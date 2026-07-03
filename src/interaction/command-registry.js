import { AppMode } from "../state/index.js";
import {
  formatNaturalDate,
  replaceIsoDatesWithNaturalDates
} from "../domain/date-text.js";
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
  async execute(args, { state, recentContexts = [], contextRepository }) {
    const rawTarget = args.trim();

    if (!rawTarget) {
      throw new Error("@ requires a context");
    }

    const { target, createIfMissing } = parseContextCreationTarget(rawTarget);
    const contextName = await resolveContextSwitchTarget(target, {
      state,
      recentContexts,
      contextRepository,
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
        ":contexts           list known contexts",
        ":context <number>   switch to a numbered context",
        ":inspect <number>   show visible fact details",
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

class InspectCommand {
  async execute(args, { factRepository, resultSet, today }) {
    const selector = args.trim();

    if (!selector) {
      throw new Error(":inspect requires a visible fact number");
    }

    if (!resultSet) {
      throw new Error(":inspect requires visible search results");
    }

    if (!/^\d+$/.test(selector)) {
      throw new Error(":inspect currently accepts a visible fact number");
    }

    const factId = resultSet.factIdForNumber(Number(selector));
    const fact = await factRepository.getFactById(factId);
    const filePath = await factRepository.findPathByFactId(factId);

    return InteractionResult.panel({
      mode: AppMode.COMMAND,
      action: "inspect",
      message: `inspected fact ${selector}`,
      helpLines: factDetailLines(fact, filePath, today)
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

class ContextsCommand {
  async execute(args, { state, contextRepository }) {
    if (args.trim()) {
      throw new Error(":contexts does not accept arguments");
    }

    if (!contextRepository) {
      throw new Error(":contexts requires a context repository");
    }

    const contexts = await contextRepository.list();
    const currentName = state.currentContext?.name ?? null;
    const helpLines = contexts.length > 0
      ? [
          "Contexts",
          ...contexts.map((context, index) => {
            const marker = context === currentName ? "*" : " ";
            return `${String(index + 1).padStart(2, " ")}. ${marker} ${context}`;
          })
        ]
      : ["Contexts", "(none)"];

    return InteractionResult.help({
      mode: AppMode.COMMAND,
      helpLines
    });
  }
}

class ContextCommand {
  async execute(args, { state, contextRepository }) {
    const target = args.trim();

    if (!target) {
      throw new Error(":context requires a number or context name");
    }

    const contextName = await resolveContextName(target, contextRepository);
    state.switchContext(contextName);

    return InteractionResult.classified({
      mode: AppMode.COMMAND,
      action: "switch_context",
      message: `switched to ${state.currentContext.name}`
    });
  }
}

function defaultCommands() {
  const exitCommand = new ExitCommand();

  return {
    exit: exitCommand,
    help: new HelpCommand(),
    inspect: new InspectCommand(),
    quit: exitCommand,
    context: new ContextCommand(),
    contexts: new ContextsCommand(),
    "@context-switch": new SwitchContextCommand(),
    undo: new UndoCommand(),
    restart: new RestartCommand(),
    paste: new PasteCommand()
  };
}

function factDetailLines(fact, filePath, today) {
  return [
    `Fact ${fact.id}`,
    `type: ${fact.type}`,
    `created: ${fact.createdAt.toISOString()}`,
    `home context: ${fact.homeContext.name}`,
    `associated contexts: ${fact.associatedContexts.map((context) => context.name).join(", ") || "(none)"}`,
    `due: ${fact.dueDate ? formatNaturalDate(fact.dueDate, { today }) : "(none)"}`,
    `attached file: ${fact.file ?? "(none)"}`,
    `path: ${filePath ?? "(not found)"}`,
    "",
    replaceIsoDatesWithNaturalDates(fact.content, { today })
  ];
}

async function resolveContextName(target, contextRepository) {
  if (!/^\d+$/.test(target)) {
    return target;
  }

  if (!contextRepository) {
    throw new Error(":context number requires a context repository");
  }

  const contexts = await contextRepository.list();
  const contextName = contexts[Number(target) - 1];

  if (!contextName) {
    throw new Error(`No context numbered ${target}`);
  }

  return contextName;
}

async function resolveContextSwitchTarget(target, {
  state,
  recentContexts = [],
  contextRepository,
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
    return contextName;
  }

  const exactContextName = await resolveExistingContextName(contextName, {
    state,
    recentContexts,
    contextRepository
  });

  if (!exactContextName) {
    throw new Error(`Context does not exist: ${contextName}. Add ! to create it.`);
  }

  return exactContextName;
}

async function resolveExistingContextName(target, {
  state,
  recentContexts = [],
  contextRepository
} = {}) {
  const contextNames = [];
  appendUniqueContextName(contextNames, state?.currentContext?.name);

  for (const contextName of recentContexts) {
    appendUniqueContextName(contextNames, contextName);
  }

  if (contextRepository) {
    for (const contextName of await contextRepository.list()) {
      appendUniqueContextName(contextNames, contextName);
    }
  }

  const canonicalTarget = Context.canonicalize(target);
  return contextNames.find((contextName) =>
    Context.canonicalize(contextName) === canonicalTarget
  ) ?? null;
}

function appendUniqueContextName(contextNames, contextName) {
  if (!contextName) {
    return;
  }

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
