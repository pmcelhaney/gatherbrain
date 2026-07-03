import { SelectionActionRegistry } from "../actions/index.js";
import { SearchShortcutRegistry } from "../search/index.js";

export class CompletionService {
  constructor({
    contextRepository,
    factSource = null,
    actionRegistry = SelectionActionRegistry.fromConfig(),
    shortcutRegistry = new SearchShortcutRegistry(),
    commandNames = ["exit", "help", "inspect", "paste", "quit", "restart", "context", "contexts", "undo"]
  } = {}) {
    this.contextRepository = contextRepository;
    this.factSource = factSource;
    this.actionRegistry = actionRegistry;
    this.shortcutRegistry = shortcutRegistry;
    this.commandNames = commandNames;
  }

  async complete(input, context = {}) {
    return (await this.suggest(input, context)).completed;
  }

  async suggest(input, context = {}) {
    const matchIndex = context.completionIndex ?? 0;
    const contextCommandPrefix = contextCompletionPrefix(input, this.commandNames);
    if (contextCommandPrefix) {
      return completeSuffix(input, contextCommandPrefix, await this.contextNames(), matchIndex);
    }

    if (input.startsWith(":")) {
      return completeSuffix(input, ":", this.commandNames, matchIndex);
    }

    if (input.startsWith("//")) {
      return completeSuffix(input, "//", this.shortcutRegistry.names(), matchIndex);
    }

    const contextSwitchCompletion = await this.completeContextSwitch(input, matchIndex);
    if (contextSwitchCompletion) {
      return contextSwitchCompletion;
    }

    if (isSelectionInput(input)) {
      const selectionCompletion = completeSelection(input, this.actionRegistry.keywords(), context.resultSet, matchIndex);
      if (selectionCompletion) {
        return selectionCompletion;
      }

      return noCompletion(input);
    }

    return noCompletion(input);
  }

  async contextNames() {
    return this.contextRepository ? this.contextRepository.list() : [];
  }

  async completeContextSwitch(input, matchIndex = 0) {
    const activeContext = activeLeadingAtSegment(input);

    if (!activeContext) {
      return null;
    }

    const matches = matchingCandidates(await this.contextNames(), activeContext.value);

    if (matches.length === 0) {
      return null;
    }

    return completionResult(
      input,
      matches.map((match) => `@${escapeAtValue(match)}`),
      matchIndex
    );
  }

}

function completeSuffix(input, prefix, candidates, matchIndex = 0) {
  const partial = input.slice(prefix.length);
  const matches = matchingCandidates(candidates, partial);

  return completionResult(input, matches.map((match) => `${prefix}${match}`), matchIndex);
}

function contextCompletionPrefix(input, commandNames) {
  const match = input.match(/^:([^\s]+)\s+/);

  if (!match) {
    return null;
  }

  const commandToken = match[1];
  const commandName = resolveCommandName(commandToken, commandNames);

  if (commandName === "context") {
    if (commandToken.toLocaleLowerCase("en-US") === "context") {
      return ":context ";
    }

    return `:${commandToken} `;
  }

  return null;
}

function resolveCommandName(commandToken, commandNames) {
  const normalizedToken = commandToken.toLocaleLowerCase("en-US");
  const exactMatch = commandNames.find((commandName) =>
    commandName.toLocaleLowerCase("en-US") === normalizedToken
  );

  if (exactMatch) {
    return exactMatch;
  }

  const matches = commandNames.filter((commandName) =>
    commandName.toLocaleLowerCase("en-US").startsWith(normalizedToken)
  );

  if (matches.length === 1) {
    return matches[0];
  }

  return null;
}

function completeSelection(input, actionKeywords, resultSet, matchIndex = 0) {
  const tokens = input.trim().split(/\s+/);
  const last = tokens[tokens.length - 1] ?? "";

  if (/^\d*$/.test(last) && resultSet && last.length > 0) {
    const numbers = resultSet.toRows().map(({ number }) => String(number));
    const matches = matchingCandidates(numbers, last);
    if (matches.length > 0) {
      return completionResult(input, matches.map((match) => replaceLastToken(tokens, match)), matchIndex);
    }
  }

  if (/^\d+$|^\.+$/.test(tokens[0]) && tokens.length > 1) {
    const matches = matchingCandidates(actionKeywords, last);
    if (matches.length > 0) {
      return completionResult(input, matches.map((match) => replaceLastToken(tokens, match)), matchIndex);
    }
  }

  return null;
}

function isSelectionInput(input) {
  return /^\s*(\d+|\.)/.test(input);
}

function selectionActionStartIndex(input) {
  const tokens = input.matchAll(/\S+/g);
  let hasSelector = false;

  for (const token of tokens) {
    const value = token[0];

    if (/^\d+$/.test(value) || /^\.+$/.test(value)) {
      hasSelector = true;
      continue;
    }

    return hasSelector ? token.index : null;
  }

  return null;
}

function matchingCandidates(candidates, partial) {
  const normalizedPartial = partial.toLocaleLowerCase("en-US");
  return candidates.filter((candidate) =>
    candidate.toLocaleLowerCase("en-US").startsWith(normalizedPartial)
  );
}

function replaceLastToken(tokens, replacement) {
  const completed = [...tokens];
  completed[completed.length - 1] = replacement;
  return completed.join(" ");
}

function completionResult(input, candidates, matchIndex = 0) {
  if (candidates.length === 0) {
    return noCompletion(input);
  }

  return {
    input,
    completed: candidates[matchIndex % candidates.length],
    candidates
  };
}

function noCompletion(input) {
  return {
    input,
    completed: input,
    candidates: []
  };
}

function activeLeadingAtSegment(input) {
  if (!input.startsWith("@")) {
    return null;
  }

  const activeContext = activeAtSegment(input, { allowEmpty: true });

  return activeContext?.startIndex === 0 ? activeContext : null;
}

function activeAtSegment(input, { allowEmpty = false } = {}) {
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

    if (/\s/.test(char) || isAtStopChar(char)) {
      return null;
    }

    value += char;
  }

  return value.length > 0 || allowEmpty ? { startIndex, value } : null;
}

function isAtStopChar(char) {
  return ["'", "\"", ".", ",", ";", ":", "!", "?", "(", ")", "[", "]", "{", "}", "<", ">"].includes(char);
}

function escapeAtValue(value) {
  return value.replace(/\s/g, "\\$&");
}
