import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";

import { PromptController } from "./interaction/index.js";
import { FactRepository, Workspace } from "./persistence/index.js";
import { AppState } from "./state/index.js";
import { TerminalApp } from "./terminal/index.js";

export function createAppRuntime({
  workspacePath = path.join(process.cwd(), "workspace"),
  clock = () => new Date()
} = {}) {
  const state = new AppState();
  const workspace = new Workspace(workspacePath);
  const factRepository = new FactRepository({ workspace });
  const terminalApp = new TerminalApp({ state });
  let resultSet = null;
  const promptController = new PromptController({
    state,
    factRepository,
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

      return result;
    },
    render() {
      return terminalApp.render({ resultSet });
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

  const rl = readline.createInterface({ input, output, terminal: input.isTTY });

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

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
