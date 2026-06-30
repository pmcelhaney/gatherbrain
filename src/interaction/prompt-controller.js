import { randomUUID } from "node:crypto";

import { Fact } from "../domain/index.js";
import {
  SearchEngine,
  SearchQueryParser,
  SearchShortcutRegistry
} from "../search/index.js";
import { AppMode } from "../state/index.js";
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
    const facts = await this.factRepository.list();
    const today = this.clock().toISOString().slice(0, 10);
    const resultSet = this.searchEngine.search(facts, ast, { today });

    this.state.setQuery(expandedQuery.replace(/^\//, ""));

    return InteractionResult.searched({
      mode: AppMode.SEARCH,
      query: this.state.currentQuery,
      resultSet
    });
  }
}
