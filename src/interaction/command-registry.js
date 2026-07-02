import { AppMode } from "../state/index.js";
import { TimeBox } from "../domain/index.js";
import {
  formatNaturalDate,
  replaceIsoDatesWithNaturalDates
} from "../domain/date-text.js";
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
  execute(args, { state }) {
    const contextName = args.trim();

    if (!contextName) {
      throw new Error("@ requires a context");
    }

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
        "@<context>          switch or create a context",
        ":contexts           list known contexts",
        ":context <number>   switch to a numbered context",
        ":inspect <number>   show visible fact details",
        ":timebox <number> <range> <context>  update a timebox",
        ":timebox delete <number>             delete a timebox",
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
        ". @tag              tag first visible fact",
        "; 9-10 Context      plan a timebox"
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

class TimeBoxCommand {
  async execute(args, { timeBoxRepository, timeBoxes, today }) {
    if (!timeBoxRepository) {
      throw new Error(":timebox requires a time box repository");
    }

    const tokens = args.trim().split(/\s+/).filter(Boolean);

    if (tokens[0] === "delete") {
      const timeBox = resolveTimeBoxNumber(tokens[1], timeBoxes);
      await timeBoxRepository.delete(timeBox);
      return InteractionResult.timeBoxChanged({
        mode: AppMode.COMMAND,
        action: "timebox_delete",
        message: `deleted timebox ${tokens[1]}`,
        timeBoxDate: timeBox.date
      });
    }

    const timeBox = resolveTimeBoxNumber(tokens.shift(), timeBoxes);
    const rangeToken = tokens.shift();
    const context = tokens.join(" ").trim();

    if (!rangeToken || !context) {
      throw new Error(":timebox update requires a number, range, and context");
    }

    const [startsAt, endsAt] = parseTimeRange(rangeToken);
    const updatedTimeBox = new TimeBox({
      ...timeBox.toSerializable(),
      date: today ?? timeBox.date,
      startsAt,
      endsAt,
      context
    });

    await timeBoxRepository.save(updatedTimeBox);

    return InteractionResult.timeBoxChanged({
      mode: AppMode.COMMAND,
      action: "timebox_update",
      message: `updated timebox ${timeBoxNumberFor(timeBox, timeBoxes)}`,
      timeBoxDate: updatedTimeBox.date
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
    timebox: new TimeBoxCommand(),
    undo: new UndoCommand(),
    restart: new RestartCommand(),
    paste: new PasteCommand()
  };
}

function resolveTimeBoxNumber(numberText, timeBoxes = []) {
  if (!/^\d+$/.test(numberText ?? "")) {
    throw new Error(":timebox requires a visible timebox number");
  }

  const sorted = sortedTimeBoxes(timeBoxes);
  const timeBox = sorted[Number(numberText) - 1];

  if (!timeBox) {
    throw new Error(`No timebox numbered ${numberText}`);
  }

  return timeBox;
}

function timeBoxNumberFor(timeBox, timeBoxes) {
  return String(sortedTimeBoxes(timeBoxes).findIndex((candidate) => candidate.id === timeBox.id) + 1);
}

function sortedTimeBoxes(timeBoxes = []) {
  return [...timeBoxes].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

function parseTimeRange(rangeToken) {
  const match = rangeToken.match(/^(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?$/);

  if (!match) {
    throw new Error("Timebox range must look like 9-10 or 09:30-10:00");
  }

  return [
    normalizeTime(match[1], match[2] ?? "00"),
    normalizeTime(match[3], match[4] ?? "00")
  ];
}

function normalizeTime(hoursValue, minutesValue) {
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("Timebox range contains an invalid local time");
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
