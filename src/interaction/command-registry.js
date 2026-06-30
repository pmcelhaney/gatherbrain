import { AppMode } from "../state/index.js";
import { InteractionResult } from "./interaction-result.js";

export class CommandRegistry {
  constructor(commands = defaultCommands()) {
    this.commands = new Map(Object.entries(commands));
  }

  async execute(input, context) {
    const { name, args } = parseCommand(input);
    const command = this.commands.get(name);

    if (!command) {
      throw new Error(`Unknown command: ${name}`);
    }

    return command.execute(args, context);
  }
}

class SwitchSessionCommand {
  execute(args, { state }) {
    const sessionName = args.trim();

    if (!sessionName) {
      throw new Error(":switch requires a session");
    }

    state.switchSession(sessionName);

    return InteractionResult.classified({
      mode: AppMode.COMMAND,
      action: "switch_session",
      message: `switched to ${state.currentSession.name}`
    });
  }
}

class RestartCommand {
  execute(args, { state }) {
    if (args.trim()) {
      throw new Error(":restart does not accept arguments");
    }

    state.restart();

    return InteractionResult.classified({
      mode: AppMode.COMMAND,
      action: "restart",
      message: "restarted"
    });
  }
}

class PasteCommand {
  execute(args) {
    if (args.trim()) {
      throw new Error(":paste does not accept arguments");
    }

    return InteractionResult.classified({
      mode: AppMode.COMMAND,
      action: "paste",
      message: "paste mode is not implemented yet"
    });
  }
}

function defaultCommands() {
  return {
    switch: new SwitchSessionCommand(),
    restart: new RestartCommand(),
    paste: new PasteCommand()
  };
}

function parseCommand(input) {
  const text = input.trim();

  if (!text.startsWith(":")) {
    throw new Error("Command input must start with :");
  }

  const withoutPrefix = text.slice(1).trim();
  const [name = "", ...rest] = withoutPrefix.split(/\s+/);

  if (!name) {
    throw new Error("Command name is required");
  }

  return {
    name,
    args: rest.join(" ")
  };
}
