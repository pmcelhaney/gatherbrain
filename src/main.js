import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { spawn as spawnChildProcess } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";

import { SelectionActionRegistry } from "./actions/index.js";
import { defaultAppConfig, loadAppConfig, mergeAppConfig } from "./config/index.js";
import { Context, Fact } from "./domain/index.js";
import { normalizeNaturalDates } from "./domain/date-text.js";
import { CompletionService, PromptClassifier, PromptController } from "./interaction/index.js";
import { parseSearchSelectionInput, searchSelectionDelimiterIndex } from "./interaction/search-selection-input.js";
import { parseSelectionActions, selectorsForSelectionActions } from "./interaction/selection-input.js";
import { AppStateRepository, ClipboardReader, FactRepository, FileOpener, PasteRepository, ContextRepository, TagRepository, Workspace } from "./persistence/index.js";
import { PlanParser, TimeBoxRepository } from "./planning/index.js";
import { FactIndex, SearchEngine, SearchQueryParser, SearchResultSet, SearchShortcutRegistry } from "./search/index.js";
import { AppState, Selection } from "./state/index.js";
import { ansi, InputBuffer, TerminalApp } from "./terminal/index.js";

export function createAppRuntime({
  workspacePath = path.join(process.cwd(), "workspace"),
  config = defaultAppConfig(),
  clock = () => new Date(),
  clipboardReader = new ClipboardReader(),
  fileOpener = new FileOpener(),
  idGenerator = randomUUID
} = {}) {
  const appConfig = mergeAppConfig(defaultAppConfig(), config);
  const state = new AppState();
  const workspace = new Workspace(workspacePath);
  const appStateRepository = new AppStateRepository({ workspace });
  const factRepository = new FactRepository({ workspace });
  const pasteRepository = new PasteRepository({ workspace });
  const contextRepository = new ContextRepository({ workspace });
  const tagRepository = new TagRepository({ workspace });
  const timeBoxRepository = new TimeBoxRepository({ workspace });
  const factIndex = new FactIndex(factRepository);
  const searchEngine = new SearchEngine();
  const searchQueryParser = new SearchQueryParser();
  const searchShortcutRegistry = new SearchShortcutRegistry();
  const promptClassifier = new PromptClassifier();
  const planParser = new PlanParser();
  const selectionActionRegistry = SelectionActionRegistry.fromConfig(appConfig.selectionActions);
  const completionService = new CompletionService({
    contextRepository,
    factSource: factIndex,
    tagRepository,
    actionRegistry: selectionActionRegistry,
    shortcutRegistry: searchShortcutRegistry,
    commandNames: ["exit", "help", "inspect", "paste", "quit", "restart", "context", "contexts", "timebox", "undo"]
  });
  const terminalApp = new TerminalApp({ state });
  let resultSet = null;
  let timeBoxes = [];
  let helpLines = null;
  let undoSnapshot = null;
  let pendingPaste = false;
  let recentContexts = [];
  let cachedFacts = [];
  const promptController = new PromptController({
    state,
    factRepository,
    factSource: factIndex,
    contextRepository,
    searchShortcutRegistry,
    selectionActionRegistry,
    timeBoxRepository,
    fileOpener,
    clock,
    defaultFactType: appConfig.defaultFactType,
    currentResultSetProvider: () => resultSet,
    currentTimeBoxesProvider: () => timeBoxes,
    recentContextProvider: () => selectableRecentContexts(recentContexts, state.currentContext)
  });

  const initializeRuntimeState = async () => {
    const today = clock().toISOString().slice(0, 10);
    const savedState = await appStateRepository.load();

    state.restart();
    if (savedState?.currentContext) {
      state.switchContext(savedState.currentContext);
      recentContexts = recordRecentContext(recentContexts, state.currentContext);
    }

    factIndex.invalidate();
    cachedFacts = await factIndex.list();
    resultSet = await initialResultSet({
      state,
      factIndex,
      searchEngine,
      searchQueryParser,
      clock
    });
    timeBoxes = await timeBoxRepository.listByDate(today);
    helpLines = null;
    undoSnapshot = null;
  };

  return {
    state,
    terminalApp,
    completionService,
    async initialize() {
      await initializeRuntimeState();
    },
    async submit(line) {
      if (pendingPaste && !isExitCommand(line)) {
        const result = await completePendingPaste({
          line,
          state,
          factRepository,
          pasteRepository,
          clipboardReader,
          clock,
          idGenerator,
          defaultFactType: appConfig.defaultFactType
        });

        pendingPaste = false;
        factIndex.invalidate();
        cachedFacts = await factIndex.list();
        resultSet = await searchCurrentFacts({
          state,
          factIndex,
          searchEngine,
          searchQueryParser,
          clock
        });
        helpLines = null;
        await appStateRepository.save(state);
        return result;
      }

      if (line.trim() === "") {
        const result = await resetToCurrentContext({
          state,
          factIndex,
          searchEngine,
          searchQueryParser,
          clock
        });
        resultSet = result.resultSet;
        helpLines = null;
        await appStateRepository.save(state);
        return result;
      }

      const scopedSelection = scopedContextSelectionInput(line, {
        recentContexts: selectableRecentContexts(recentContexts, state.currentContext),
        actionKeywords: selectionActionRegistry.keywords()
      });
      if (scopedSelection) {
        const targetResultSet = resultSetForContext({
          contextName: scopedSelection.contextName,
          facts: cachedFacts,
          searchEngine,
          searchQueryParser,
          clock
        });
        const targetState = new AppState({ currentContext: scopedSelection.contextName });
        const selection = Selection.resolve(
          selectorsForSelectionActions(scopedSelection.selectors, scopedSelection.actions),
          targetResultSet
        );
        const scopedUndoSnapshot = await promptController.snapshotSelection(selection);
        const scopedResults = await selectionActionRegistry.executeAll(scopedSelection.actions, {
          selection,
          factStore: factRepository,
          state: targetState,
          fileOpener,
          today: clock().toISOString().slice(0, 10)
        });

        undoSnapshot = scopedUndoSnapshot;
        factIndex.invalidate();
        cachedFacts = await factIndex.list();
        resultSet = await searchCurrentFacts({
          state,
          factIndex,
          searchEngine,
          searchQueryParser,
          clock
        });
        helpLines = null;
        await appStateRepository.save(state);

        return {
          action: "selection_action",
          message: selectionActionMessage(scopedSelection.actions, selection, scopedResults)
        };
      }

      const result = await promptController.submit(canonicalizeContextSwitchInput(line, {
        facts: cachedFacts,
        recentContexts: selectableRecentContexts(recentContexts, state.currentContext)
      }));

      if (result.action === "exit") {
        await appStateRepository.save(state);
        return result;
      }

      if (result.action === "undo") {
        if (!undoSnapshot) {
          throw new Error("Nothing to undo");
        }

        await restoreUndoSnapshot({ undoSnapshot, factRepository });
        factIndex.invalidate();
        cachedFacts = await factIndex.list();
        resultSet = await searchCurrentFacts({
          state,
          factIndex,
          searchEngine,
          searchQueryParser,
          clock
        });
        helpLines = null;
        undoSnapshot = null;
        result.message = "undid last selection action";
      }

      if (result.resultSet && !result.transient) {
        resultSet = result.resultSet;
        helpLines = null;
      }

      if (result.timeBox) {
        timeBoxes = await timeBoxRepository.listByDate(result.timeBox.date);
      }

      if (result.timeBoxDate) {
        timeBoxes = await timeBoxRepository.listByDate(result.timeBoxDate);
      }

      if (result.action === "switch_context") {
        recentContexts = recordRecentContext(recentContexts, state.currentContext);
        resultSet = await searchCurrentFacts({
          state,
          factIndex,
          searchEngine,
          searchQueryParser,
          clock
        });
        helpLines = null;
      }

      if (result.action === "paste_name_requested") {
        state.requireCaptureContext();
        pendingPaste = true;
        helpLines = null;
      }

      if (result.fact || result.action === "selection_action") {
        factIndex.invalidate();
        cachedFacts = await factIndex.list();
        resultSet = await searchCurrentFacts({
          state,
          factIndex,
          searchEngine,
          searchQueryParser,
          clock
        });
        helpLines = null;
      }

      if (result.undoSnapshot) {
        undoSnapshot = result.undoSnapshot;
      }

      if (result.helpLines) {
        helpLines = result.helpLines;
      }

      if (result.action === "restart") {
        await appStateRepository.save(state);
        pendingPaste = false;
        await initializeRuntimeState();
        return result;
      }

      await appStateRepository.save(state);

      return result;
    },
    render({
      input = "",
      cursor = input.length,
      showCursor = false,
      completionSuggestionStart = null,
      completionCandidates = [],
      completionCandidateIndex = null,
      status = "",
      width = output.columns ?? 80,
      height = output.rows ?? 24,
      colorEnabled = false
    } = {}) {
      const previewContext = viewedContextForInput({
        input,
        facts: cachedFacts,
        recentContexts: selectableRecentContexts(recentContexts, state.currentContext)
      });
      const visibleRecentContexts = selectableRecentContexts(recentContexts, state.currentContext);

      return terminalApp.render({
        state: stateForPreview({
          state,
          input,
          promptClassifier,
          planParser,
          searchShortcutRegistry,
          clock
        }),
        viewedContext: previewContext,
        resultSet: previewResultSetForInput({
          input,
          resultSet,
          facts: cachedFacts,
          selectionActionRegistry,
          state,
          recentContexts: visibleRecentContexts,
          searchEngine,
          searchQueryParser,
          searchShortcutRegistry,
          clock
        }),
        timeBoxes,
        helpLines: contextListPreviewForInput({
          input,
          recentContexts: visibleRecentContexts,
          facts: cachedFacts,
          height: bodyHeightForRender({
            height,
            status,
            completionCandidates
          })
        }) ?? helpLines,
        selectionPreview: selectionPreviewForInput({
          input,
          resultSet,
          facts: cachedFacts,
          selectionActionRegistry,
          state,
          recentContexts: visibleRecentContexts,
          searchEngine,
          searchQueryParser,
          searchShortcutRegistry,
          clock
        }),
        input,
        cursor,
        showCursor,
        completionSuggestionStart,
        completionCandidates,
        completionCandidateIndex,
        status,
        width,
        height,
        today: clock().toISOString().slice(0, 10),
        now: clock(),
        colorEnabled
      });
    },
    async suggestCompletion(input, { completionIndex = 0 } = {}) {
      const searchSelectionCompletionResult = await searchSelectionCompletion({
        input,
        state,
        facts: cachedFacts,
        searchEngine,
        searchQueryParser,
        searchShortcutRegistry,
        completionService,
        completionIndex,
        clock
      });

      if (searchSelectionCompletionResult) {
        return searchSelectionCompletionResult;
      }

      const scopedCompletion = await scopedSelectionCompletion({
        input,
        recentContexts: selectableRecentContexts(recentContexts, state.currentContext),
        facts: cachedFacts,
        searchEngine,
        searchQueryParser,
        completionService,
        completionIndex,
        clock
      });

      if (scopedCompletion) {
        return scopedCompletion;
      }

      return completionService.suggest(input, { resultSet, completionIndex });
    },
    async complete(input, { completionIndex = 0 } = {}) {
      const searchSelectionCompletionResult = await searchSelectionCompletion({
        input,
        state,
        facts: cachedFacts,
        searchEngine,
        searchQueryParser,
        searchShortcutRegistry,
        completionService,
        completionIndex,
        clock
      });

      if (searchSelectionCompletionResult) {
        return searchSelectionCompletionResult.completed;
      }

      const scopedCompletion = await scopedSelectionCompletion({
        input,
        recentContexts: selectableRecentContexts(recentContexts, state.currentContext),
        facts: cachedFacts,
        searchEngine,
        searchQueryParser,
        completionService,
        completionIndex,
        clock
      });

      if (scopedCompletion) {
        return scopedCompletion.completed;
      }

      return completionService.complete(input, { resultSet, completionIndex });
    }
  };
}

function recordRecentContext(recentContexts, context) {
  if (!context) {
    return recentContexts;
  }

  const nextContext = Context.from(context);
  return [
    nextContext.name,
    ...recentContexts.filter((name) => {
      const canonicalName = Context.canonicalize(name);
      return canonicalName !== nextContext.canonicalName
        && !nextContext.canonicalName.startsWith(canonicalName);
    })
  ];
}

function selectableRecentContexts(recentContexts, currentContext) {
  if (!currentContext) {
    return recentContexts;
  }

  const current = Context.from(currentContext);
  return recentContexts.filter((contextName) =>
    Context.canonicalize(contextName) !== current.canonicalName
  );
}

function canonicalizeContextSwitchInput(input, { facts = [], recentContexts = [] } = {}) {
  const target = scopedContextTarget(input, { recentContexts, facts });

  if (!target || target.rest.trim()) {
    return input;
  }

  return `@${target.contextName}`;
}

function contextListPreviewForInput({ input, recentContexts, facts = [], height }) {
  if (!input.startsWith("@")) {
    return null;
  }

  if (scopedContextTarget(input, { recentContexts, facts })) {
    return null;
  }

  return recentContexts
    .slice(0, height)
    .map((contextName, index) => `${String(index + 1).padStart(2, " ")}. ${contextName}`);
}

function bodyHeightForRender({
  height,
  status,
  completionCandidates
}) {
  const completionLineCount = Array.isArray(completionCandidates) && completionCandidates.length > 1 ? 1 : 0;
  const statusLineCount = status ? 1 : 0;
  return Math.max(1, height - 3 - completionLineCount - statusLineCount);
}

function previewResultSetForInput({
  input,
  resultSet,
  facts = [],
  selectionActionRegistry,
  state,
  recentContexts = [],
  searchEngine,
  searchQueryParser,
  searchShortcutRegistry,
  clock
}) {
  const activeResultSet = searchResultSetForInput({
    input,
    state,
    facts,
    searchEngine,
    searchQueryParser,
    searchShortcutRegistry,
    clock
  }) ?? scopedResultSetForInput({
    input,
    facts,
    recentContexts,
    searchEngine,
    searchQueryParser,
    clock
  }) ?? resultSet;
  const parsed = selectionInputPreview(input, activeResultSet, selectionActionRegistry, {
    recentContexts
  });

  if (!parsed?.actions.length) {
    return activeResultSet;
  }

  const selectedIds = new Set(parsed.selection.toArray());
  const today = clock().toISOString().slice(0, 10);
  const previewFacts = activeResultSet.facts.map((fact) => {
    if (!selectedIds.has(fact.id)) {
      return fact;
    }

    return selectionActionRegistry.previewAll(parsed.actions, fact, {
      state: parsed.contextName ? new AppState({ currentContext: parsed.contextName }) : state,
      today
    }) ?? fact;
  });

  return new SearchResultSet(previewFacts);
}

function searchResultSetForInput({
  input,
  state,
  facts = [],
  searchEngine,
  searchQueryParser,
  searchShortcutRegistry,
  clock
}) {
  if (!String(input).trimStart().startsWith("/") || !searchEngine || !searchQueryParser || !searchShortcutRegistry) {
    return null;
  }

  try {
    const today = clock().toISOString().slice(0, 10);
    const expandedQuery = searchShortcutRegistry.expand(searchInputForPreview(input) || "/", {
      currentContext: state?.currentContext
    });
    const query = queryForRuntimeSearchInput(normalizeNaturalDates(expandedQuery, { today }), state);
    const ast = query === "*" ? { type: "all" } : searchQueryParser.parse(query);

    return searchEngine.search(facts, ast, {
      today,
      currentContext: state?.currentContext ?? null
    });
  } catch {
    return null;
  }
}

function searchSelectionResultSetForInput(options) {
  if (searchSelectionDelimiterIndex(options.input) === -1) {
    return null;
  }

  return searchResultSetForInput(options);
}

function searchInputForPreview(input) {
  const delimiterIndex = searchSelectionDelimiterIndex(input);
  const rawSearchInput = delimiterIndex === -1
    ? input
    : input.slice(0, delimiterIndex);
  return rawSearchInput.trim();
}

function viewedContextForInput({
  input,
  facts = [],
  recentContexts = []
}) {
  return scopedContextTarget(input, { recentContexts, facts })?.contextName ?? null;
}

function selectionPreviewForInput({
  input,
  resultSet,
  facts = [],
  selectionActionRegistry,
  state,
  recentContexts = [],
  searchEngine,
  searchQueryParser,
  searchShortcutRegistry,
  clock
}) {
  const activeResultSet = searchResultSetForInput({
    input,
    state,
    facts,
    searchEngine,
    searchQueryParser,
    searchShortcutRegistry,
    clock
  }) ?? scopedResultSetForInput({
    input,
    facts,
    recentContexts,
    searchEngine,
    searchQueryParser,
    clock
  }) ?? resultSet;
  return selectionInputPreview(input, activeResultSet, selectionActionRegistry, {
    recentContexts
  })?.selection ?? null;
}

function selectionInputPreview(input, resultSet, selectionActionRegistry, {
  recentContexts = []
} = {}) {
  const actionKeywords = selectionActionRegistry.keywords();
  let searchSelection = null;

  try {
    searchSelection = parseSearchSelectionInput(input, { actionKeywords });
  } catch {
    searchSelection = null;
  }

  const scopedSelection = searchSelection ? null : scopedContextSelectionInput(input, {
    recentContexts,
    actionKeywords
  });
  const selectionInput = searchSelection?.selectionInput ?? scopedSelection?.selectionInput ?? input;

  if (!resultSet || !/^\s*(\d+|\.)/.test(selectionInput)) {
    return null;
  }

  const tokens = selectionInput.trim().split(/\s+/);
  const selectors = [];

  while (tokens.length > 0 && (/^\d+$/.test(tokens[0]) || /^\.+$/.test(tokens[0]))) {
    selectors.push(tokens.shift());
  }

  if (selectors.length === 0) {
    return null;
  }

  try {
    const actions = parseSelectionActions(tokens, {
      actionKeywords
    });
    return {
      selection: Selection.resolve(selectorsForSelectionActions(selectors, actions), resultSet),
      actions,
      contextName: scopedSelection?.contextName ?? null
    };
  } catch {
    return null;
  }
}

function queryForRuntimeSearchInput(rawQuery, state) {
  const query = rawQuery.trim().replace(/^\//, "").trim();

  if (query) {
    return query;
  }

  if (state?.currentQuery) {
    return state.currentQuery;
  }

  if (state?.currentContext) {
    return `context:"${state.currentContext.name}"`;
  }

  return "*";
}

function scopedResultSetForInput({
  input,
  facts,
  recentContexts,
  searchEngine,
  searchQueryParser,
  clock
}) {
  const target = scopedContextTarget(input, { recentContexts, facts });

  if (!target || !searchEngine || !searchQueryParser) {
    return null;
  }

  return resultSetForContext({
    contextName: target.contextName,
    facts,
    searchEngine,
    searchQueryParser,
    clock
  });
}

function scopedContextSelectionInput(input, {
  recentContexts = [],
  actionKeywords = []
} = {}) {
  const target = scopedContextTarget(input, { recentContexts });

  if (!target || target.rest.trim().length === 0) {
    return null;
  }

  const tokens = target.rest.trim().split(/\s+/);
  const selectors = [];

  while (tokens.length > 0 && (/^\d+$/.test(tokens[0]) || /^\.+$/.test(tokens[0]))) {
    selectors.push(tokens.shift());
  }

  if (selectors.length === 0) {
    return null;
  }

  const actions = parseSelectionActions(tokens, {
    actionKeywords
  });

  if (actions.length === 0) {
    return null;
  }

  return {
    contextName: target.contextName,
    selectionInput: target.rest,
    selectors,
    actions
  };
}

function scopedContextTarget(input, { recentContexts = [], facts = [] } = {}) {
  const selectorMatch = String(input).match(/^@(?<selector>\d+|\.+)(?<rest>\s+.*)?$/);

  if (selectorMatch) {
    const contextName = contextNameForRecentSelector(selectorMatch.groups.selector, recentContexts);

    if (!contextName) {
      return null;
    }

    return {
      contextName,
      rest: selectorMatch.groups.rest ?? ""
    };
  }

  const contextMatch = String(input).match(/^@(?<context>\S+)$/);

  if (!contextMatch) {
    return null;
  }

  const contextName = contextNameForTypedPrefix(contextMatch.groups.context, {
    recentContexts,
    facts
  });

  if (!contextName) {
    return null;
  }

  return {
    contextName,
    rest: ""
  };
}

function contextNameForRecentSelector(selector, recentContexts = []) {
  const index = /^\d+$/.test(selector) ? Number(selector) - 1 : selector.length - 1;
  return recentContexts[index] ?? null;
}

function contextNameForTypedPrefix(rawPrefix, { recentContexts = [], facts = [] } = {}) {
  const prefix = Context.normalizeName(rawPrefix);

  if (!prefix) {
    return null;
  }

  const normalizedPrefix = Context.canonicalize(prefix);
  const matches = contextNamesFromFactsAndRecentContexts(facts, recentContexts).filter((contextName) =>
    Context.canonicalize(contextName).startsWith(normalizedPrefix)
  );
  const strictMatches = matches.filter((contextName) =>
    Context.canonicalize(contextName) !== normalizedPrefix
  );

  if (strictMatches.length === 1) {
    return strictMatches[0];
  }

  if (matches.length === 1) {
    return matches[0];
  }

  return matches.find((contextName) =>
    Context.canonicalize(contextName) === normalizedPrefix
  ) ?? null;
}

function contextNamesFromFactsAndRecentContexts(facts = [], recentContexts = []) {
  const contextNames = [];

  for (const contextName of recentContexts) {
    appendUniqueContextName(contextNames, contextName);
  }

  for (const fact of facts) {
    appendUniqueContextName(contextNames, fact.homeContext.name);

    for (const context of fact.associatedContexts) {
      appendUniqueContextName(contextNames, context.name);
    }
  }

  return contextNames;
}

function appendUniqueContextName(contextNames, contextName) {
  if (!contextName) {
    return;
  }

  const normalizedName = Context.canonicalize(contextName);

  if (!contextNames.some((existing) => Context.canonicalize(existing) === normalizedName)) {
    contextNames.push(Context.normalizeName(contextName));
  }
}

function resultSetForContext({
  contextName,
  facts,
  searchEngine,
  searchQueryParser,
  clock
}) {
  const query = `context:"${contextName}"`;
  const ast = searchQueryParser.parse(query);
  return searchEngine.search(facts, ast, {
    today: clock().toISOString().slice(0, 10),
    currentContext: new Context(contextName)
  });
}

async function scopedSelectionCompletion({
  input,
  recentContexts,
  facts,
  searchEngine,
  searchQueryParser,
  completionService,
  completionIndex,
  clock
}) {
  const scopedInput = scopedSelectionCompletionInput(input, recentContexts);

  if (!scopedInput) {
    return null;
  }

  const targetResultSet = resultSetForContext({
    contextName: scopedInput.contextName,
    facts,
    searchEngine,
    searchQueryParser,
    clock
  });
  const suggestion = await completionService.suggest(scopedInput.selectionInput, {
    resultSet: targetResultSet,
    completionIndex
  });

  return {
    input,
    completed: `${scopedInput.prefix}${suggestion.completed}`,
    candidates: suggestion.candidates.map((candidate) => `${scopedInput.prefix}${candidate}`)
  };
}

async function searchSelectionCompletion({
  input,
  state,
  facts,
  searchEngine,
  searchQueryParser,
  searchShortcutRegistry,
  completionService,
  completionIndex,
  clock
}) {
  const delimiterIndex = searchSelectionDelimiterIndex(input);

  if (delimiterIndex === -1) {
    return null;
  }

  const rawSelectionInput = input.slice(delimiterIndex + 1);
  const leadingSpace = rawSelectionInput.match(/^\s*/)?.[0] ?? "";
  const selectionInput = rawSelectionInput.slice(leadingSpace.length);

  if (!selectionInput) {
    return null;
  }

  const targetResultSet = searchSelectionResultSetForInput({
    input,
    state,
    facts,
    searchEngine,
    searchQueryParser,
    searchShortcutRegistry,
    clock
  });

  if (!targetResultSet) {
    return null;
  }

  const suggestion = await completionService.suggest(selectionInput, {
    resultSet: targetResultSet,
    completionIndex
  });

  if (suggestion.completed === selectionInput && suggestion.candidates.length === 0) {
    return null;
  }

  const prefix = `${input.slice(0, delimiterIndex + 1)}${leadingSpace}`;

  return {
    input,
    completed: `${prefix}${suggestion.completed}`,
    candidates: suggestion.candidates.map((candidate) => `${prefix}${candidate}`)
  };
}

function scopedSelectionCompletionInput(input, recentContexts = []) {
  const match = String(input).match(/^(?<prefix>@(?<selector>\d+|\.{1,})\s+)(?<selectionInput>.*)$/);

  if (!match) {
    return null;
  }

  const contextName = contextNameForRecentSelector(match.groups.selector, recentContexts);

  if (!contextName) {
    return null;
  }

  return {
    contextName,
    prefix: match.groups.prefix,
    selectionInput: match.groups.selectionInput
  };
}

function selectionActionMessage(actions, selection, results) {
  if (results.every((result) => result.action === "open_file")) {
    const targetCount = results.reduce((count, result) => count + result.value.length, 0);

    if (targetCount === 1) {
      return `opened ${results[0].fact.url || results[0].fact.file}`;
    }

    return `opened ${targetCount} targets`;
  }

  if (results.every((result) => result.action === "edit_file")) {
    return `editing ${results[0].value}`;
  }

  return `${selectionActionsText(actions)} applied to ${selection.size} fact${selection.size === 1 ? "" : "s"}`;
}

function selectionActionsText(actions) {
  return actions.map(({ actionKeyword, args = [] }) =>
    [actionKeyword, ...args].filter(Boolean).join(" ")
  ).join(" ");
}

function stateForPreview({
  state,
  input,
  promptClassifier,
  planParser,
  searchShortcutRegistry,
  clock
}) {
  if (!input) {
    return state;
  }

  const currentMode = promptClassifier.classify(input);
  const previewState = {
    ...state,
    currentMode
  };

  if (currentMode === "Plan") {
    previewState.planPreview = planParser.parse(input, {
      today: clock().toISOString().slice(0, 10)
    });
  }

  if (currentMode === "Search") {
    previewState.currentQuery = queryForSearchPreview({
      input,
      state,
      searchShortcutRegistry,
      clock
    });
  }

  return {
    ...previewState
  };
}

function queryForSearchPreview({
  input,
  state,
  searchShortcutRegistry,
  clock
}) {
  try {
    const today = clock().toISOString().slice(0, 10);
    const expandedQuery = searchShortcutRegistry.expand(searchInputForPreview(input) || "/", {
      currentContext: state?.currentContext
    });

    return queryForRuntimeSearchInput(normalizeNaturalDates(expandedQuery, { today }), state);
  } catch {
    return state.currentQuery;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const config = await loadAppConfig();
  const runtime = createAppRuntime({
    config,
    workspacePath: process.env.GATHERBRAIN_WORKSPACE
  });
  await runtime.initialize();

  if (argv.includes("--render-once")) {
    output.write(`${runtime.render()}\n`);
    return;
  }

  if (input.isTTY) {
    const result = await runTui(runtime);
    if (result === "restart") {
      await restartCurrentProcess();
    }
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: false });

  output.write(`${runtime.render()}\n`);

  for await (const line of rl) {
    output.write("\n> ");

    if (isExitCommand(line)) {
      rl.close();
      return;
    }

    try {
      const result = await runtime.submit(line);
      if (result?.action === "exit") {
        rl.close();
        return;
      }
      if (result?.message) {
        output.write(`${result.message}\n`);
      }
    } catch (error) {
      output.write(`error: ${error.message}\n`);
    }

    output.write(`${runtime.render()}\n`);
  }
}

export async function runTui(runtime, { inputStream = input, outputStream = output } = {}) {
  readline.emitKeypressEvents(inputStream);
  inputStream.setRawMode(true);
  outputStream.write(ansi.hideCursor);

  const buffer = new InputBuffer();
  let status = "";
  let completionCycle = null;

  const resetCompletionCycle = () => {
    completionCycle = null;
  };

  const restoreCompletionInput = () => {
    if (completionCycle?.completed === buffer.text) {
      buffer.text = completionCycle.input;
      buffer.cursor = completionCycle.cursor;
    }
    resetCompletionCycle();
  };

  const acceptCompletionSuggestion = () => {
    if (completionCycle?.completed !== buffer.text || completionCycle.cursor !== buffer.cursor) {
      return false;
    }

    buffer.moveEnd();
    resetCompletionCycle();
    return true;
  };

  const completionSuggestionStart = () => {
    if (completionCycle?.completed !== buffer.text || completionCycle.cursor !== buffer.cursor) {
      return null;
    }
    return buffer.cursor < buffer.text.length ? buffer.cursor : null;
  };

  const completionCandidates = () => {
    if (completionCycle?.completed !== buffer.text || completionCycle.cursor !== buffer.cursor) {
      return [];
    }
    return completionCycle.candidates ?? [];
  };

  const completionCandidateIndex = () => {
    if (completionCycle?.completed !== buffer.text || completionCycle.cursor !== buffer.cursor) {
      return null;
    }
    return completionCycle.index >= 0 ? completionCycle.index : null;
  };

  const redraw = () => {
    outputStream.write(`${ansi.clear}${ansi.home}`);
    outputStream.write(runtime.render({
      input: buffer.text,
      cursor: buffer.cursor,
      showCursor: true,
      completionSuggestionStart: completionSuggestionStart(),
      completionCandidates: completionCandidates(),
      completionCandidateIndex: completionCandidateIndex(),
      status,
      width: outputStream.columns ?? 80,
      height: outputStream.rows ?? 24,
      colorEnabled: true
    }));
  };

  redraw();

  let onKeypress;

  await new Promise((resolve) => {
    onKeypress = async (sequence, key) => {
      if (isControlKey(key, sequence, "c", "\u0003")) {
        resolve();
        return;
      }

      if (isControlKey(key, sequence, "a", "\u0001")) {
        restoreCompletionInput();
        buffer.moveHome();
        redraw();
        return;
      }

      if (isControlKey(key, sequence, "e", "\u0005")) {
        restoreCompletionInput();
        buffer.moveEnd();
        redraw();
        return;
      }

      if (isControlKey(key, sequence, "f", "\u0006")) {
        if (!acceptCompletionSuggestion()) {
          buffer.moveRight();
        }
        redraw();
        return;
      }

      if (key.name === "escape") {
        resetCompletionCycle();
        buffer.clear();
        status = "";
        redraw();
        return;
      }

      if (key.name === "backspace") {
        restoreCompletionInput();
        buffer.backspace();
        redraw();
        return;
      }

      if (key.name === "delete") {
        restoreCompletionInput();
        buffer.delete();
        redraw();
        return;
      }

      if (key.name === "left") {
        restoreCompletionInput();
        buffer.moveLeft();
        redraw();
        return;
      }

      if (key.name === "right") {
        if (!acceptCompletionSuggestion()) {
          buffer.moveRight();
        }
        redraw();
        return;
      }

      if (key.name === "home") {
        restoreCompletionInput();
        buffer.moveHome();
        redraw();
        return;
      }

      if (key.name === "end") {
        restoreCompletionInput();
        buffer.moveEnd();
        redraw();
        return;
      }

      if (key.name === "tab") {
        const isContinuingCycle = completionCycle?.completed === buffer.text
          && completionCycle.cursor === buffer.cursor;
        const cycleInput = isContinuingCycle ? completionCycle.input : buffer.text;
        const completionIndex = isContinuingCycle && completionCycle.phase !== "common-prefix"
          ? completionCycle.index + 1
          : 0;
        const cursor = isContinuingCycle ? completionCycle.cursor : buffer.cursor;
        const suggestion = await completeRuntimeInput(runtime, cycleInput, { completionIndex });
        const commonPrefix = commonCompletionPrefix(suggestion.candidates);
        const shouldCompleteCommonPrefix = !isContinuingCycle
          && suggestion.candidates.length > 1
          && commonPrefix.length > cycleInput.length
          && commonPrefix !== suggestion.completed;
        const completed = shouldCompleteCommonPrefix ? commonPrefix : suggestion.completed;
        buffer.text = completed;
        buffer.cursor = Math.min(cursor, completed.length);
        completionCycle = {
          input: cycleInput,
          cursor: buffer.cursor,
          index: shouldCompleteCommonPrefix ? -1 : completionIndex,
          phase: shouldCompleteCommonPrefix ? "common-prefix" : "candidate",
          completed,
          candidates: suggestion.candidates
        };
        redraw();
        return;
      }

      if (key.name === "return") {
        resetCompletionCycle();
        const line = buffer.consume();

        if (isExitCommand(line)) {
          resolve();
          return;
        }

        const restoreInput = isEditSelectionCommand(line)
          ? suspendTuiInputForChildProcess(inputStream, outputStream)
          : null;

        try {
          const result = await runtime.submit(line);
          status = result?.message ?? "";
          if (result?.action === "restart") {
            redraw();
            resolve("restart");
            return;
          }
          if (result?.action === "exit") {
            resolve();
            return;
          }
        } catch (error) {
          status = `error: ${error.message}`;
        } finally {
          restoreInput?.();
        }

        redraw();
        return;
      }

      if (isPrintableKeypress(key, sequence)) {
        restoreCompletionInput();
        buffer.insert(sequence);
        redraw();
      }
    };

    inputStream.on("keypress", onKeypress);
  }).finally(() => {
    inputStream.off("keypress", onKeypress);
    inputStream.setRawMode(false);
    inputStream.pause();
    outputStream.write(`${ansi.showCursor}\n`);
  });
}

async function completeRuntimeInput(runtime, input, { completionIndex = 0 } = {}) {
  if (typeof runtime.suggestCompletion === "function") {
    return runtime.suggestCompletion(input, { completionIndex });
  }

  const completed = await runtime.complete(input, { completionIndex });
  return {
    input,
    completed,
    candidates: completed === input ? [] : [completed]
  };
}

function commonCompletionPrefix(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return "";
  }

  let prefix = candidates[0];

  for (const candidate of candidates.slice(1)) {
    while (!candidate.startsWith(prefix) && prefix.length > 0) {
      prefix = prefix.slice(0, -1);
    }
  }

  return prefix;
}

function isControlKey(key, sequence, name, controlSequence) {
  return key?.sequence === controlSequence || sequence === controlSequence || (key?.ctrl && key?.name === name);
}

function isPrintableKeypress(key, sequence) {
  return typeof sequence === "string"
    && sequence.length === 1
    && sequence >= " "
    && sequence !== "\x7f"
    && !key?.ctrl
    && !key?.meta;
}

function suspendTuiInputForChildProcess(inputStream, outputStream) {
  inputStream.setRawMode(false);
  inputStream.pause?.();
  outputStream.write(ansi.showCursor);

  return () => {
    inputStream.resume?.();
    inputStream.setRawMode(true);
    outputStream.write(ansi.hideCursor);
  };
}

function isEditSelectionCommand(line) {
  const tokens = String(line).trim().split(/\s+/);

  if (/^@(?:\d+|\.+)$/.test(tokens[0] ?? "")) {
    tokens.shift();
  }

  let selectorCount = 0;

  while (tokens.length > 0 && (/^\d+$/.test(tokens[0]) || /^\.+$/.test(tokens[0]))) {
    tokens.shift();
    selectorCount += 1;
  }

  return selectorCount > 0 && tokens[0] === "edit";
}

export function restartCurrentProcess({
  spawn = spawnChildProcess,
  exit = process.exit,
  execPath = process.execPath,
  argv = process.argv,
  env = process.env,
  cwd = process.cwd(),
  pid = process.pid,
  signalProcess = process.kill
} = {}) {
  const child = spawn(execPath, argv.slice(1), {
    cwd,
    env: {
      ...env,
      GATHERBRAIN_RESTART_PARENT_PID: String(pid)
    },
    stdio: "inherit"
  });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) {
        return;
      }

      settled = true;
      callback();
      resolve();
    };

    child.once("error", () => {
      finish(() => exit(1));
    });
    child.once("close", (code, signal) => {
      if (signal) {
        finish(() => signalProcess(pid, signal));
        return;
      }

      finish(() => exit(code ?? 0));
    });
  });
}

async function searchCurrentFacts({
  state,
  factIndex,
  searchEngine,
  searchQueryParser,
  clock
}) {
  if (!state.currentQuery) {
    return null;
  }

  const facts = await factIndex.list();
  const ast = searchQueryParser.parse(state.currentQuery);
  return searchEngine.search(facts, ast, {
    today: clock().toISOString().slice(0, 10),
    currentContext: state.currentContext
  });
}

async function initialResultSet({
  state,
  factIndex,
  searchEngine,
  searchQueryParser,
  clock
}) {
  const currentFacts = await searchCurrentFacts({
    state,
    factIndex,
    searchEngine,
    searchQueryParser,
    clock
  });

  if (currentFacts) {
    return currentFacts;
  }

  return new SearchResultSet(await factIndex.list());
}

async function restoreUndoSnapshot({ undoSnapshot, factRepository }) {
  for (const item of undoSnapshot.facts ?? []) {
    await factRepository.saveFact(new Fact(item.fact));
  }
}

async function resetToCurrentContext({
  state,
  factIndex,
  searchEngine,
  searchQueryParser,
  clock
}) {
  if (state.currentContext) {
    state.setQuery(`context:"${state.currentContext.name}"`);
  } else {
    state.restart();
  }

  return {
    action: "reset_to_current_context",
    message: state.currentContext ? `showing ${state.currentContext.name}` : "cleared search",
    resultSet: await initialResultSet({
      state,
      factIndex,
      searchEngine,
      searchQueryParser,
      clock
    })
  };
}

async function completePendingPaste({
  line,
  state,
  factRepository,
  pasteRepository,
  clipboardReader,
  clock,
  idGenerator,
  defaultFactType
}) {
  const name = normalizeNaturalDates(line.trim(), {
    today: clock().toISOString().slice(0, 10)
  });

  if (!name) {
    throw new Error("Paste name is required");
  }

  state.requireCaptureContext();

  const createdAt = clock();
  const date = createdAt.toISOString().slice(0, 10);
  const clipboardItem = await clipboardReader.read();
  const paste = await pasteRepository.create({
    date,
    context: state.currentContext,
    name,
    clipboardItem
  });
  const fact = new Fact({
    id: idGenerator(),
    content: name,
    type: "file",
    createdAt,
    file: paste.fileName,
    homeContext: state.currentContext
  });

  await factRepository.create(fact);

  return {
    action: "paste",
    message: `pasted ${paste.fileName}`,
    fact,
    filePath: paste.filePath
  };
}

function isExitCommand(line) {
  const command = String(line).trim();
  return command === ":exit" || command === ":quit";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
