import { SelectionActionRegistry } from "../actions/index.js";
import { SearchShortcutRegistry } from "../search/index.js";

export class CompletionService {
  constructor({
    sessionRepository,
    factSource = null,
    tagRepository = null,
    actionRegistry = SelectionActionRegistry.fromConfig(),
    shortcutRegistry = new SearchShortcutRegistry(),
    commandNames = ["exit", "help", "inspect", "paste", "quit", "restart", "session", "sessions", "switch", "timebox", "undo"]
  } = {}) {
    this.sessionRepository = sessionRepository;
    this.factSource = factSource;
    this.tagRepository = tagRepository;
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

    const tagCompletion = await this.completeTag(input);
    if (tagCompletion) {
      return tagCompletion;
    }

    return input;
  }

  async sessionNames() {
    return this.sessionRepository ? this.sessionRepository.list() : [];
  }

  async completeTag(input) {
    const activeTag = activeTagSegment(input);

    if (!activeTag) {
      return null;
    }

    const match = firstMatch(await this.tagNames(), activeTag.value);

    if (!match) {
      return null;
    }

    return `${input.slice(0, activeTag.startIndex)}@${escapeTag(match)}`;
  }

  async tagNames() {
    const facts = this.factSource ? await this.factSource.list() : [];
    const workspaceTags = this.tagRepository ? await this.tagRepository.list() : [];
    const tags = [];

    for (const tag of workspaceTags) {
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }

    for (const fact of facts) {
      for (const tag of fact.tags ?? []) {
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }

    return tags.sort((left, right) => left.localeCompare(right, "en-US"));
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
  const normalizedPartial = partial.toLocaleLowerCase("en-US");
  return candidates.find((candidate) =>
    candidate.toLocaleLowerCase("en-US").startsWith(normalizedPartial)
  );
}

function activeTagSegment(input) {
  const startIndex = input.lastIndexOf("@");

  if (startIndex === -1) {
    return null;
  }

  let value = "";

  for (let index = startIndex + 1; index < input.length; index += 1) {
    const char = input[index];

    if (char === "\\" && /\s/.test(input[index + 1] ?? "")) {
      value += input[index + 1];
      index += 1;
      continue;
    }

    if (/\s/.test(char) || isTagStopChar(char)) {
      return null;
    }

    value += char;
  }

  return value.length > 0 ? { startIndex, value } : null;
}

function isTagStopChar(char) {
  return ["'", "\"", ".", ",", ";", ":", "!", "?", "(", ")", "[", "]", "{", "}", "<", ">"].includes(char);
}

function escapeTag(tag) {
  return tag.replace(/\s/g, "\\$&");
}
