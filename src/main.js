import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";

import { PromptController } from "./interaction/index.js";
import { FactRepository, Workspace } from "./persistence/index.js";
import { AppMode, AppState } from "./state/index.js";
import { TerminalApp } from "./terminal/index.js";

export function createAppRuntime({
  workspacePath = path.join(process.cwd(), "workspace"),
  clock = () => new Date()
} = {}) {
  const state = new AppState();
  const workspace = new Workspace(workspacePath);
  const factRepository = new FactRepository({ workspace });
  const terminalApp = new TerminalApp({ state });
  const promptController = new PromptController({
    state,
    factRepository,
    clock
  });

  return {
    state,
    terminalApp,
    async submit(line) {
      return handleLine({ line, state, promptController });
    },
    render() {
      return terminalApp.render();
    }
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

  const rl = readline.createInterface({ input, output });

  output.write(`${runtime.render()}\n`);

  while (true) {
    const line = await rl.question("\n> ");

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

async function handleLine({ line, state, promptController }) {
  const trimmed = line.trim();

  if (trimmed.startsWith(":switch ")) {
    state.switchSession(trimmed.slice(":switch ".length));
    return { message: `switched to ${state.currentSession.name}` };
  }

  if (trimmed === ":restart") {
    state.restart();
    return { message: "restarted" };
  }

  const result = await promptController.submit(line);

  if ([AppMode.SEARCH, AppMode.SELECTION, AppMode.PLAN].includes(result.mode)) {
    return {
      ...result,
      message: `${result.mode} input recognized; execution is not wired yet`
    };
  }

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
