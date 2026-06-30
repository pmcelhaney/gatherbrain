import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";

import { PromptClassifier, PromptController } from "./interaction/index.js";
import { FactRepository, Workspace } from "./persistence/index.js";
import { TimeBoxRepository } from "./planning/index.js";
import { SearchEngine, SearchQueryParser } from "./search/index.js";
import { AppState } from "./state/index.js";
import { ansi, InputBuffer, TerminalApp } from "./terminal/index.js";

export function createAppRuntime({
  workspacePath = path.join(process.cwd(), "workspace"),
  clock = () => new Date()
} = {}) {
  const state = new AppState();
  const workspace = new Workspace(workspacePath);
  const factRepository = new FactRepository({ workspace });
  const timeBoxRepository = new TimeBoxRepository({ workspace });
  const searchEngine = new SearchEngine();
  const searchQueryParser = new SearchQueryParser();
  const promptClassifier = new PromptClassifier();
  const terminalApp = new TerminalApp({ state });
  let resultSet = null;
  let timeBoxes = [];
  const promptController = new PromptController({
    state,
    factRepository,
    timeBoxRepository,
    clock,
    currentResultSetProvider: () => resultSet
  });

  return {
    state,
    terminalApp,
    async submit(line) {
      const result = await promptController.submit(line);

      if (result.resultSet) {
        resultSet = result.resultSet;
      }

      if (result.timeBox) {
        timeBoxes = await timeBoxRepository.listByDate(result.timeBox.date);
      }

      if (result.fact || result.action === "selection_action") {
        resultSet = await searchCurrentFacts({
          state,
          factRepository,
          searchEngine,
          searchQueryParser,
          clock
        });
      }

      return result;
    },
    render({
      input = "",
      cursor = input.length,
      showCursor = false,
      width = output.columns ?? 80,
      height = output.rows ?? 24,
      colorEnabled = false
    } = {}) {
      return terminalApp.render({
        state: stateForPreview({ state, input, promptClassifier }),
        resultSet,
        timeBoxes,
        input,
        cursor,
        showCursor,
        width,
        height,
        today: clock().toISOString().slice(0, 10),
        colorEnabled
      });
    }
  };
}

function stateForPreview({ state, input, promptClassifier }) {
  if (!input) {
    return state;
  }

  return {
    ...state,
    currentMode: promptClassifier.classify(input)
  };
}

export async function main(argv = process.argv.slice(2)) {
  const runtime = createAppRuntime({
    workspacePath: process.env.GATHERBRAIN_WORKSPACE
  });

  if (argv.includes("--render-once")) {
    output.write(`${runtime.render()}\n`);
    return;
  }

  if (input.isTTY) {
    await runTui(runtime);
    return;
  }

  const rl = readline.createInterface({ input, output, terminal: false });

  output.write(`${runtime.render()}\n`);

  for await (const line of rl) {
    output.write("\n> ");

    if (line === ":quit" || line === ":exit") {
      rl.close();
      return;
    }

    try {
      const result = await runtime.submit(line);
      if (result?.message) {
        output.write(`${result.message}\n`);
      }
    } catch (error) {
      output.write(`error: ${error.message}\n`);
    }

    output.write(`${runtime.render()}\n`);
  }
}

async function runTui(runtime) {
  readline.emitKeypressEvents(input);
  input.setRawMode(true);
  output.write(ansi.hideCursor);

  const buffer = new InputBuffer();
  let status = "";

  const redraw = () => {
    output.write(`${ansi.clear}${ansi.home}`);
    output.write(runtime.render({
      input: buffer.text,
      cursor: buffer.cursor,
      showCursor: true,
      width: output.columns ?? 80,
      height: output.rows ?? 24,
      colorEnabled: true
    }));
    if (status) {
      output.write(`\n${status}`);
    }
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
        buffer.clear();
        status = "";
        redraw();
        return;
      }

      if (key.name === "backspace") {
        buffer.backspace();
        redraw();
        return;
      }

      if (key.name === "delete") {
        buffer.delete();
        redraw();
        return;
      }

      if (key.name === "left") {
        buffer.moveLeft();
        redraw();
        return;
      }

      if (key.name === "right") {
        buffer.moveRight();
        redraw();
        return;
      }

      if (key.name === "home") {
        buffer.moveHome();
        redraw();
        return;
      }

      if (key.name === "end") {
        buffer.moveEnd();
        redraw();
        return;
      }

      if (key.name === "return") {
        const line = buffer.consume();

        if (line === ":quit" || line === ":exit") {
          resolve();
          return;
        }

        try {
          const result = await runtime.submit(line);
          status = result?.message ?? "";
        } catch (error) {
          status = `error: ${error.message}`;
        }

        redraw();
        return;
      }

      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        buffer.insert(sequence);
        redraw();
      }
    };

    input.on("keypress", onKeypress);
  }).finally(() => {
    input.off("keypress", onKeypress);
    input.setRawMode(false);
    output.write(`${ansi.showCursor}\n`);
  });
}

async function searchCurrentFacts({
  state,
  factRepository,
  searchEngine,
  searchQueryParser,
  clock
}) {
  if (!state.currentQuery) {
    return null;
  }

  const facts = await factRepository.list();
  const ast = searchQueryParser.parse(state.currentQuery);
  return searchEngine.search(facts, ast, {
    today: clock().toISOString().slice(0, 10)
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
