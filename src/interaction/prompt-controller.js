import { randomUUID } from "node:crypto";

import { extractTags, Fact, normalizeTaggedContent } from "../domain/index.js";
import { normalizeNaturalDates } from "../domain/date-text.js";
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
import { parseSearchSelectionInput } from "./search-selection-input.js";
import { parseSelectionInput, selectorsForSelectionActions } from "./selection-input.js";

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
    contextRepository = null,
    selectionActionRegistry = SelectionActionRegistry.fromConfig(),
    currentResultSetProvider = () => null,
    currentTimeBoxesProvider = () => [],
    recentContextProvider = () => [],
    planParser = null,
    timeBoxRepository = null,
    fileOpener = null,
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
    this.contextRepository = contextRepository;
    this.selectionActionRegistry = selectionActionRegistry;
    this.currentResultSetProvider = currentResultSetProvider;
    this.currentTimeBoxesProvider = currentTimeBoxesProvider;
    this.recentContextProvider = recentContextProvider;
    this.planParser = planParser;
    this.timeBoxRepository = timeBoxRepository;
    this.fileOpener = fileOpener;
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
      return this.commandRegistry.execute(input, {
        state: this.state,
        contextRepository: this.contextRepository,
        factRepository: this.factRepository,
        resultSet: this.currentResultSetProvider(),
        timeBoxRepository: this.timeBoxRepository,
        timeBoxes: this.currentTimeBoxesProvider(),
        recentContexts: this.recentContextProvider(),
        today: this.clock().toISOString().slice(0, 10)
      });
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
    const rawContent = normalizeNaturalDates(input.trim(), {
      today: this.clock().toISOString().slice(0, 10)
    });
    const bookmark = extractBookmark(rawContent);
    const content = normalizeTaggedContent(bookmark.content);

    if (!content) {
      return InteractionResult.classified({
        mode: AppMode.CAPTURE,
        action: "ignored",
        message: "empty capture"
      });
    }

    this.state.requireCaptureContext();

    const fact = new Fact({
      id: this.idGenerator(),
      content,
      type: bookmark.url ? "bookmark" : this.defaultFactType,
      createdAt: this.clock(),
      homeContext: this.state.currentContext,
      url: bookmark.url,
      tags: extractTags(rawContent)
    });

    const { filePath } = await this.factRepository.create(fact);

    return InteractionResult.captured({
      mode: AppMode.CAPTURE,
      fact,
      filePath
    });
  }

  async search(input) {
    const today = this.clock().toISOString().slice(0, 10);
    const searchSelection = parseSearchSelectionInput(input, {
      actionKeywords: this.selectionActionRegistry.keywords()
    });
    const searchInput = searchSelection?.searchInput ?? input;
    const expandedQuery = this.searchShortcutRegistry.expand(searchInput, {
      currentContext: this.state.currentContext
    });
    const query = queryForSearch(normalizeNaturalDates(expandedQuery, { today }), this.state);
    const ast = query === "*" ? { type: "all" } : this.searchQueryParser.parse(query);
    const facts = await this.factSource.list();
    const resultSet = this.searchEngine.search(facts, ast, {
      today,
      currentContext: this.state.currentContext
    });

    if (searchSelection) {
      const selection = Selection.resolve(
        selectorsForSelectionActions(searchSelection.selectors, searchSelection.actions),
        resultSet
      );
      this.state.setSelection(selection);
      const undoSnapshot = await this.snapshotSelection(selection);

      const results = await this.selectionActionRegistry.executeAll(searchSelection.actions, {
        selection,
        factStore: this.factRepository,
        state: this.state,
        fileOpener: this.fileOpener,
        today
      });

      return InteractionResult.selectionAction({
        mode: AppMode.SEARCH,
        message: selectionMessage(selectionActionsText(searchSelection.actions), selection, results),
        undoSnapshot
      });
    }

    this.state.setQuery(query);

    return InteractionResult.searched({
      mode: AppMode.SEARCH,
      query: this.state.currentQuery,
      resultSet
    });
  }

  async selection(input) {
    const { selectors, actions } = parseSelectionInput(input, {
      actionKeywords: this.selectionActionRegistry.keywords()
    });
    const resultSet = this.currentResultSetProvider();

    if (!resultSet) {
      throw new Error("Selection requires visible search results");
    }

    const selection = Selection.resolve(selectorsForSelectionActions(selectors, actions), resultSet);
    this.state.setSelection(selection);
    const undoSnapshot = await this.snapshotSelection(selection);

    const results = await this.selectionActionRegistry.executeAll(actions, {
      selection,
      factStore: this.factRepository,
      state: this.state,
      fileOpener: this.fileOpener,
      today: this.clock().toISOString().slice(0, 10)
    });

    return InteractionResult.selectionAction({
      mode: AppMode.SELECTION,
      message: selectionMessage(selectionActionsText(actions), selection, results),
      undoSnapshot
    });
  }

  async snapshotSelection(selection) {
    const facts = [];

    for (const factId of selection.factIds) {
      const filePath = await this.factRepository.findPathByFactId(factId);
      const fact = await this.factRepository.getFactById(factId);
      facts.push({
        fact: fact.toSerializable(),
        filePath
      });
    }

    return { facts };
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

function extractBookmark(input) {
  const urlMatch = input.match(/https?:\/\/\S+/i);

  if (!urlMatch) {
    return { content: input, url: null };
  }

  const rawUrl = urlMatch[0];
  const url = rawUrl.replace(/[),.;:!?]+$/u, "");
  const urlEnd = urlMatch.index + url.length;
  const withoutUrl = `${input.slice(0, urlMatch.index)}${input.slice(urlEnd)}`
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .trim();

  return {
    content: withoutUrl || labelForUrl(url),
    url
  };
}

function labelForUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return "bookmark";
  }
}

function selectionMessage(actionText, selection, results) {
  if (results.every((result) => result.action === "open_file")) {
    const targetCount = results.reduce((count, result) => count + result.value.length, 0);

    if (targetCount === 1) {
      return `opened ${openLabel(results[0])}`;
    }

    return `opened ${targetCount} targets`;
  }

  if (results.every((result) => result.action === "edit_file")) {
    return `editing ${results[0].value}`;
  }

  return `${actionText} applied to ${selection.size} fact${selection.size === 1 ? "" : "s"}`;
}

function openLabel(result) {
  return result.fact.url || result.fact.file;
}

function selectionActionsText(actions) {
  return actions.map(selectionActionText).join(" ");
}

function selectionActionText({ actionKeyword, args = [] }) {
  return [actionKeyword, ...args].filter(Boolean).join(" ");
}

function queryForSearch(rawQuery, state) {
  const query = rawQuery.trim().replace(/^\//, "").trim();

  if (query) {
    return query;
  }

  if (state.currentQuery) {
    return state.currentQuery;
  }

  if (state.currentContext) {
    return `context:"${state.currentContext.name}"`;
  }

  return "*";
}
