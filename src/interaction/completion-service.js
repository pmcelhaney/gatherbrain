import { SelectionActionRegistry } from "../actions/index.js";
import { SearchShortcutRegistry } from "../search/index.js";

export class CompletionService {
  constructor({
    sessionRepository,
    actionRegistry = SelectionActionRegistry.fromConfig(),
    shortcutRegistry = new SearchShortcutRegistry(),
    commandNames = ["exit", "help", "inspect", "paste", "quit", "restart", "session", "sessions", "switch", "timebox", "undo"]
  } = {}) {
    this.sessionRepository = sessionRepository;
    this.actionRegistry = actionRegistry;
    this.shortcutRegistry = shortcutRegistry;
    this.commandNames = commandNames;
  }

  async complete(input, context = {}) {
    if (input.startsWith(":switch ") || input.startsWith(":session ")) {
      const prefix = input.startsWith(":switch ") ? ":switch " : ":session ";
      return completeSuffix(input, prefix, await this.sessionNames());
    }

    if (input.startsWith(":")) {
      return completeSuffix(input, ":", this.commandNames);
    }

    if (input.startsWith("//")) {
      return completeSuffix(input, "//", this.shortcutRegistry.names());
    }

    if (isSelectionInput(input)) {
      return completeSelection(input, this.actionRegistry.keywords(), context.resultSet);
    }

    return input;
  }

  async sessionNames() {
    return this.sessionRepository ? this.sessionRepository.list() : [];
  }
}

function completeSuffix(input, prefix, candidates) {
  const partial = input.slice(prefix.length);
  const match = firstMatch(candidates, partial);

  return match ? `${prefix}${match}` : input;
}

function completeSelection(input, actionKeywords, resultSet) {
  const tokens = input.trim().split(/\s+/);
  const last = tokens[tokens.length - 1] ?? "";

  if (/^\d*$/.test(last) && resultSet && last.length > 0) {
    const numbers = resultSet.toRows().map(({ number }) => String(number));
    const match = firstMatch(numbers, last);
    if (match) {
      tokens[tokens.length - 1] = match;
      return tokens.join(" ");
    }
  }

  if (/^\d+$|^\.+$/.test(tokens[0]) && tokens.length > 1) {
    const match = firstMatch(actionKeywords, last);
    if (match) {
      tokens[tokens.length - 1] = match;
      return tokens.join(" ");
    }
  }

  return input;
}

function isSelectionInput(input) {
  return /^\s*(\d+|\.)/.test(input);
}

function firstMatch(candidates, partial) {
  return candidates.find((candidate) => candidate.startsWith(partial));
}
