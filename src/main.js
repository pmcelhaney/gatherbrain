import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { spawn as spawnChildProcess } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";

import { SelectionActionRegistry } from "./actions/index.js";
import { defaultAppConfig, loadAppConfig, mergeAppConfig } from "./config/index.js";
import { Fact } from "./domain/index.js";
import { normalizeNaturalDates } from "./domain/date-text.js";
import { CompletionService, PromptClassifier, PromptController } from "./interaction/index.js";
import { AppStateRepository, ClipboardReader, FactRepository, FileOpener, PasteRepository, ContextRepository, TagRepository, Workspace } from "./persistence/index.js";
import { PlanParser, TimeBoxRepository } from "./planning/index.js";
import { FactIndex, SearchEngine, SearchQueryParser, SearchResultSet } from "./search/index.js";
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
  const promptClassifier = new PromptClassifier();
  const planParser = new PlanParser();
  const selectionActionRegistry = SelectionActionRegistry.fromConfig(appConfig.selectionActions);
  const completionService = new CompletionService({
    contextRepository,
    factSource: factIndex,
    tagRepository,
    actionRegistry: selectionActionRegistry,
    commandNames: ["exit", "help", "inspect", "paste", "quit", "restart", "context", "contexts", "switch", "timebox", "undo"]
  });
  const terminalApp = new TerminalApp({ state });
  let resultSet = null;
  let timeBoxes = [];
  let helpLines = null;
  let undoSnapshot = null;
  let pendingPaste = false;
  const promptController = new PromptController({
    state,
    factRepository,
    factSource: factIndex,
    contextRepository,
      selectionActionRegistry,
      timeBoxRepository,
      fileOpener,
      clock,
    defaultFactType: appConfig.defaultFactType,
    currentResultSetProvider: () => resultSet,
    currentTimeBoxesProvider: () => timeBoxes
  });

  const initializeRuntimeState = async () => {
    const today = clock().toISOString().slice(0, 10);
    const savedState = await appStateRepository.load();

    state.restart();
    if (savedState?.currentContext) {
      state.switchContext(savedState.currentContext);
    }
    if (savedState?.currentQuery) {
      state.setQuery(savedState.currentQuery);
    }

    factIndex.invalidate();
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

      const result = await promptController.submit(line);

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

      if (result.resultSet) {
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
      status = "",
      width = output.columns ?? 80,
      height = output.rows ?? 24,
      colorEnabled = false
    } = {}) {
      return terminalApp.render({
        state: stateForPreview({ state, input, promptClassifier, planParser, clock }),
        resultSet: previewResultSetForInput({
          input,
          resultSet,
          selectionActionRegistry,
          state,
          clock
        }),
        timeBoxes,
        helpLines,
        selectionPreview: selectionPreviewForInput(input, resultSet),
        input,
        cursor,
        showCursor,
        completionSuggestionStart,
        status,
        width,
        height,
        today: clock().toISOString().slice(0, 10),
        now: clock(),
        colorEnabled
      });
    },
    async complete(input, { completionIndex = 0 } = {}) {
      return completionService.complete(input, { resultSet, completionIndex });
    }
  };
}

function previewResultSetForInput({
  input,
  resultSet,
  selectionActionRegistry,
  state,
  clock
}) {
  const parsed = selectionInputPreview(input, resultSet);

  if (!parsed?.actionKeyword) {
    return resultSet;
  }

  const selectedIds = new Set(parsed.selection.toArray());
  const today = clock().toISOString().slice(0, 10);
  const previewFacts = resultSet.facts.map((fact) => {
    if (!selectedIds.has(fact.id)) {
      return fact;
    }

    return selectionActionRegistry.preview(parsed.actionKeyword, fact, {
      state,
      today,
      actionArgs: parsed.args
    }) ?? fact;
  });

  return new SearchResultSet(previewFacts);
}

function selectionPreviewForInput(input, resultSet) {
  return selectionInputPreview(input, resultSet)?.selection ?? null;
}

function selectionInputPreview(input, resultSet) {
  if (!resultSet || !/^\s*(\d+|\.)/.test(input)) {
    return null;
  }

  const tokens = input.trim().split(/\s+/);
  const selectors = [];

  while (tokens.length > 0 && (/^\d+$/.test(tokens[0]) || /^\.+$/.test(tokens[0]))) {
    selectors.push(tokens.shift());
  }

  if (selectors.length === 0) {
    return null;
  }

  try {
    const actionKeyword = tokens[0] ?? null;
    return {
      selection: Selection.resolve(selectorsForPreview(selectors, actionKeyword), resultSet),
      actionKeyword,
      args: tokens.slice(1)
    };
  } catch {
    return null;
  }
}

function selectorsForPreview(selectors, actionKeyword) {
  if (actionKeyword === "edit") {
    return [selectors.at(-1)];
  }

  return selectors;
}

function stateForPreview({ state, input, promptClassifier, planParser, clock }) {
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

  return {
    ...previewState
  };
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

  const completionSuggestionStart = () => {
    if (completionCycle?.completed !== buffer.text || completionCycle.cursor !== buffer.cursor) {
      return null;
    }
    return buffer.cursor < buffer.text.length ? buffer.cursor : null;
  };

  const redraw = () => {
    outputStream.write(`${ansi.clear}${ansi.home}`);
    outputStream.write(runtime.render({
      input: buffer.text,
      cursor: buffer.cursor,
      showCursor: true,
      completionSuggestionStart: completionSuggestionStart(),
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
        restoreCompletionInput();
        buffer.moveRight();
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
        const completionIndex = isContinuingCycle ? completionCycle.index + 1 : 0;
        const cursor = isContinuingCycle ? completionCycle.cursor : buffer.cursor;
        const completed = await runtime.complete(cycleInput, { completionIndex });
        buffer.text = completed;
        buffer.cursor = Math.min(cursor, completed.length);
        completionCycle = { input: cycleInput, cursor: buffer.cursor, index: completionIndex, completed };
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
    today: clock().toISOString().slice(0, 10)
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
