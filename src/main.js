import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { spawn as spawnChildProcess } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";

import { SelectionActionRegistry } from "./actions/index.js";
import { defaultAppConfig, loadAppConfig, mergeAppConfig } from "./config/index.js";
import { Fact } from "./domain/index.js";
import { CompletionService, PromptClassifier, PromptController } from "./interaction/index.js";
import { AppStateRepository, ClipboardReader, FactRepository, FileOpener, PasteRepository, SessionRepository, TagRepository, Workspace } from "./persistence/index.js";
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
  const sessionRepository = new SessionRepository({ workspace });
  const tagRepository = new TagRepository({ workspace });
  const timeBoxRepository = new TimeBoxRepository({ workspace });
  const factIndex = new FactIndex(factRepository);
  const searchEngine = new SearchEngine();
  const searchQueryParser = new SearchQueryParser();
  const promptClassifier = new PromptClassifier();
  const planParser = new PlanParser();
  const selectionActionRegistry = SelectionActionRegistry.fromConfig(appConfig.selectionActions);
  const completionService = new CompletionService({
    sessionRepository,
    factSource: factIndex,
    tagRepository,
    actionRegistry: selectionActionRegistry,
    commandNames: ["exit", "help", "inspect", "paste", "quit", "restart", "session", "sessions", "switch", "timebox", "undo"]
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
    sessionRepository,
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
    if (savedState?.currentSession) {
      state.switchSession(savedState.currentSession);
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
        const result = await resetToCurrentSession({
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

      if (result.action === "switch_session") {
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
        state.requireCaptureSession();
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
    return {
      selection: Selection.resolve(selectors, resultSet),
      actionKeyword: tokens[0] ?? null,
      args: tokens.slice(1)
    };
  } catch {
    return null;
  }
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

  const redraw = () => {
    outputStream.write(`${ansi.clear}${ansi.home}`);
    outputStream.write(runtime.render({
      input: buffer.text,
      cursor: buffer.cursor,
      showCursor: true,
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
      if (key.ctrl && key.name === "c") {
        resolve();
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
        resetCompletionCycle();
        buffer.backspace();
        redraw();
        return;
      }

      if (key.name === "delete") {
        resetCompletionCycle();
        buffer.delete();
        redraw();
        return;
      }

      if (key.name === "left") {
        resetCompletionCycle();
        buffer.moveLeft();
        redraw();
        return;
      }

      if (key.name === "right") {
        resetCompletionCycle();
        buffer.moveRight();
        redraw();
        return;
      }

      if (key.name === "home") {
        resetCompletionCycle();
        buffer.moveHome();
        redraw();
        return;
      }

      if (key.name === "end") {
        resetCompletionCycle();
        buffer.moveEnd();
        redraw();
        return;
      }

      if (key.name === "tab") {
        const isContinuingCycle = completionCycle?.completed === buffer.text;
        const cycleInput = isContinuingCycle ? completionCycle.input : buffer.text;
        const completionIndex = isContinuingCycle ? completionCycle.index + 1 : 0;
        const completed = await runtime.complete(cycleInput, { completionIndex });
        buffer.text = completed;
        buffer.moveEnd();
        completionCycle = { input: cycleInput, index: completionIndex, completed };
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
        }

        redraw();
        return;
      }

      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        resetCompletionCycle();
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

async function resetToCurrentSession({
  state,
  factIndex,
  searchEngine,
  searchQueryParser,
  clock
}) {
  if (state.currentSession) {
    state.setQuery(`session:"${state.currentSession.name}"`);
  } else {
    state.restart();
  }

  return {
    action: "reset_to_current_session",
    message: state.currentSession ? `showing ${state.currentSession.name}` : "cleared search",
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
  const name = line.trim();

  if (!name) {
    throw new Error("Paste name is required");
  }

  state.requireCaptureSession();

  const createdAt = clock();
  const date = createdAt.toISOString().slice(0, 10);
  const clipboardItem = await clipboardReader.read();
  const paste = await pasteRepository.create({
    date,
    session: state.currentSession,
    name,
    clipboardItem
  });
  const fact = new Fact({
    id: idGenerator(),
    content: name,
    type: "file",
    createdAt,
    file: paste.fileName,
    homeSession: state.currentSession
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
