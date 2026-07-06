import { AppMode } from "../state/index.js";
import { Context } from "../domain/index.js";
import { InteractionResult } from "./interaction-result.js";

export class CommandRegistry {
  constructor(commands = defaultCommands()) {
    this.commands = new Map(Object.entries(commands));
  }

  async execute(input, context) {
    const { name, args } = parseCommand(input);
    const commandName = resolveCommandName(name, this.commands);
    const command = this.commands.get(commandName);

    if (!command) {
      throw new Error(`Unknown command: ${name}`);
    }

    return command.execute(args, context);
  }
}

class SwitchContextCommand {
  async execute(args, { state, recentContexts = [], contextRepository, factSource }) {
    const rawTarget = args.trim();

    if (!rawTarget) {
      throw new Error("@ requires a context");
    }

    const { target, createIfMissing } = parseContextCreationTarget(rawTarget);
    const contextName = await resolveContextSwitchTarget(target, {
      state,
      recentContexts,
      contextRepository,
      factSource,
      createIfMissing
    });

    state.switchContext(contextName);

    return InteractionResult.classified({
      mode: AppMode.COMMAND,
      action: "switch_context",
      message: `switched to ${state.currentContext.name}`
    });
  }
}

class RestartCommand {
  execute(args) {
    if (args.trim()) {
      throw new Error(":restart does not accept arguments");
    }

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
      action: "paste_name_requested",
      message: "name this paste"
    });
  }
}

class ExitCommand {
  execute(args) {
    if (args.trim()) {
      throw new Error(":quit does not accept arguments");
    }

    return InteractionResult.classified({
      mode: AppMode.COMMAND,
      action: "exit",
      message: "exit"
    });
  }
}

class HelpCommand {
  execute(args) {
    if (args.trim()) {
      throw new Error(":help does not accept arguments");
    }

    return InteractionResult.help({
      mode: AppMode.COMMAND,
      helpLines: [
        "Commands",
        "@<context>          switch to an existing context",
        "@<context>!         create the context if needed, then switch",
        ":undo               undo the last selection action",
        ":restart            restart the app and reload current state",
        ":paste              paste clipboard into the current context",
        ":help               show this help",
        ":exit / :quit       exit",
        "",
        "Input",
        "plain text          capture a fact",
        "/query              search facts",
        ". task              update first visible fact",
        "@2 1 task          update fact 1 in recent context 2"
      ]
    });
  }
}

class UndoCommand {
  execute(args) {
    if (args.trim()) {
      throw new Error(":undo does not accept arguments");
    }

    return InteractionResult.classified({
      mode: AppMode.COMMAND,
      action: "undo",
      message: "undo"
    });
  }
}

function defaultCommands() {
  const exitCommand = new ExitCommand();

  return {
    exit: exitCommand,
    help: new HelpCommand(),
    quit: exitCommand,
    "@context-switch": new SwitchContextCommand(),
    undo: new UndoCommand(),
    restart: new RestartCommand(),
    paste: new PasteCommand()
  };
}

async function resolveContextSwitchTarget(target, {
  state,
  recentContexts = [],
  contextRepository,
  factSource,
  createIfMissing = false
} = {}) {
  if (/^\d+$/.test(target)) {
    const contextName = recentContexts[Number(target) - 1];

    if (!contextName) {
      throw new Error(`No recent context numbered ${target}`);
    }

    return contextName;
  }

  if (/^\.+$/.test(target)) {
    const contextName = recentContexts[target.length - 1];

    if (!contextName) {
      throw new Error(`No recent context selected by @${target}`);
    }

    return contextName;
  }

  const contextName = Context.normalizeName(target);

  if (!contextName) {
    throw new Error("@ requires a context");
  }

  if (createIfMissing) {
    if (contextRepository?.create) {
      const createdContext = await contextRepository.create(contextName);
      return createdContext.name;
    }

    return contextName;
  }

  const exactContextName = await resolveExistingContextName(contextName, {
    state,
    recentContexts,
    contextRepository,
    factSource
  });

  if (!exactContextName) {
    throw new Error(`Context does not exist: ${contextName}. Add ! to create it.`);
  }

  return exactContextName;
}

async function resolveExistingContextName(target, {
  contextRepository,
  factSource
} = {}) {
  const contextNames = [];

  if (contextRepository) {
    for (const contextName of await contextRepository.list()) {
      appendUniqueContextName(contextNames, contextName);
    }
  }

  if (factSource) {
    for (const fact of await factSource.list()) {
      appendUniqueContextName(contextNames, fact.homeContext);

      for (const context of fact.associatedContexts ?? []) {
        appendUniqueContextName(contextNames, context);
      }
    }
  }

  const canonicalTarget = Context.canonicalize(target);
  return contextNames.find((contextName) =>
    Context.canonicalize(contextName) === canonicalTarget
  ) ?? null;
}

function appendUniqueContextName(contextNames, context) {
  if (!context) {
    return;
  }

  const contextName = context.name ?? context;
  const normalizedName = Context.normalizeName(contextName);
  const canonicalName = Context.canonicalize(normalizedName);

  if (!contextNames.some((existing) => Context.canonicalize(existing) === canonicalName)) {
    contextNames.push(normalizedName);
  }
}

function parseContextCreationTarget(target) {
  if (target.endsWith("\\!")) {
    return {
      target: target.slice(0, -2),
      createIfMissing: true
    };
  }

  if (target.endsWith("!")) {
    return {
      target: target.slice(0, -1),
      createIfMissing: true
    };
  }

  return {
    target,
    createIfMissing: false
  };
}

function parseCommand(input) {
  const text = input.trim();

  if (text.startsWith("@")) {
    return {
      name: "@context-switch",
      args: text.slice(1)
    };
  }

  if (!text.startsWith(":")) {
    throw new Error("Command input must start with : or @");
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

function resolveCommandName(name, commands) {
  if (commands.has(name)) {
    return name;
  }

  const normalizedName = name.toLocaleLowerCase("en-US");
  const matches = [...commands.keys()].filter((commandName) =>
    commandName.toLocaleLowerCase("en-US").startsWith(normalizedName)
  );

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    throw new Error(`Ambiguous command: ${name} (${matches.map((match) => `:${match}`).join(", ")})`);
  }

  return name;
}
