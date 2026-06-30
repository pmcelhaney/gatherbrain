import { randomUUID } from "node:crypto";

import { Fact } from "../domain/index.js";
import { SelectionActionRegistry } from "../actions/index.js";
import {
  SearchEngine,
  SearchQueryParser,
  SearchShortcutRegistry
} from "../search/index.js";
import { PlanParser } from "../planning/index.js";
import { AppMode, Selection } from "../state/index.js";
import { CommandRegistry } from "./command-registry.js";
import { InteractionResult } from "./interaction-result.js";
import { PromptClassifier } from "./prompt-classifier.js";

export class PromptController {
  constructor({
    state,
    factRepository,
    classifier = new PromptClassifier(),
    commandRegistry = new CommandRegistry(),
    searchShortcutRegistry = new SearchShortcutRegistry(),
    searchQueryParser = new SearchQueryParser(),
    searchEngine = new SearchEngine(),
    factSource = factRepository,
    selectionActionRegistry = SelectionActionRegistry.fromConfig(),
    currentResultSetProvider = () => null,
    planParser = null,
    timeBoxRepository = null,
    clock = () => new Date(),
    idGenerator = randomUUID,
    defaultFactType = "fact"
  }) {
    this.state = state;
    this.factRepository = factRepository;
    this.classifier = classifier;
    this.commandRegistry = commandRegistry;
    this.searchShortcutRegistry = searchShortcutRegistry;
    this.searchQueryParser = searchQueryParser;
    this.searchEngine = searchEngine;
    this.factSource = factSource;
    this.selectionActionRegistry = selectionActionRegistry;
    this.currentResultSetProvider = currentResultSetProvider;
    this.planParser = planParser;
    this.timeBoxRepository = timeBoxRepository;
    this.clock = clock;
    this.idGenerator = idGenerator;
    this.defaultFactType = defaultFactType;
  }

  async submit(input) {
    const mode = this.classifier.classify(input);
    this.state.setMode(mode);

    if (mode === AppMode.CAPTURE) {
      return this.capture(input);
    }

    if (mode === AppMode.COMMAND) {
      return this.commandRegistry.execute(input, { state: this.state });
    }

    if (mode === AppMode.SEARCH) {
      return this.search(input);
    }

    if (mode === AppMode.SELECTION) {
      return this.selection(input);
    }

    if (mode === AppMode.PLAN) {
      return this.plan(input);
    }

    return InteractionResult.classified({ mode });
  }

  async capture(input) {
    const content = input.trim();

    if (!content) {
      return InteractionResult.classified({
        mode: AppMode.CAPTURE,
        action: "ignored",
        message: "empty capture"
      });
    }

    this.state.requireCaptureSession();

    const fact = new Fact({
      id: this.idGenerator(),
      content,
      type: this.defaultFactType,
      createdAt: this.clock(),
      homeSession: this.state.currentSession
    });

    const { filePath } = await this.factRepository.create(fact);

    return InteractionResult.captured({
      mode: AppMode.CAPTURE,
      fact,
      filePath
    });
  }

  async search(input) {
    const expandedQuery = this.searchShortcutRegistry.expand(input, {
      currentSession: this.state.currentSession
    });
    const ast = this.searchQueryParser.parse(expandedQuery);
    const facts = await this.factSource.list();
    const today = this.clock().toISOString().slice(0, 10);
    const resultSet = this.searchEngine.search(facts, ast, { today });

    this.state.setQuery(expandedQuery.replace(/^\//, ""));

    return InteractionResult.searched({
      mode: AppMode.SEARCH,
      query: this.state.currentQuery,
      resultSet
    });
  }

  async selection(input) {
    const { selectors, actionKeyword } = parseSelectionInput(input);
    const resultSet = this.currentResultSetProvider();

    if (!resultSet) {
      throw new Error("Selection requires visible search results");
    }

    const selection = Selection.resolve(selectors, resultSet);
    this.state.setSelection(selection);

    const results = await this.selectionActionRegistry.execute(actionKeyword, {
      selection,
      factStore: this.factRepository,
      state: this.state,
      today: this.clock().toISOString().slice(0, 10)
    });

    return InteractionResult.classified({
      mode: AppMode.SELECTION,
      action: "selection_action",
      message: `${actionKeyword} applied to ${results.length} fact${results.length === 1 ? "" : "s"}`
    });
  }

  async plan(input) {
    if (!this.timeBoxRepository) {
      throw new Error("Time box repository is required for plan input");
    }

    const today = this.clock().toISOString().slice(0, 10);
    const parser = this.planParser ?? new PlanParser({ today });
    const preview = parser.parse(input, { today });
    this.state.setPlanPreview(preview);

    const timeBox = preview.commit();
    await this.timeBoxRepository.save(timeBox);

    return InteractionResult.planned({
      mode: AppMode.PLAN,
      timeBox
    });
  }
}

function parseSelectionInput(input) {
  const tokens = input.trim().split(/\s+/);
  const selectors = [];

  while (tokens.length > 0 && (/^\d+$/.test(tokens[0]) || /^\.+$/.test(tokens[0]))) {
    selectors.push(tokens.shift());
  }

  if (selectors.length === 0) {
    throw new Error("Selection input requires at least one selector");
  }

  const actionKeyword = tokens.shift();

  if (!actionKeyword) {
    throw new Error("Selection input requires an action");
  }

  return { selectors, actionKeyword, args: tokens };
}
