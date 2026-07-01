import { AppMode } from "../state/index.js";
import { TimeBox } from "../domain/index.js";
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
        ":switch <session>   switch or create a session",
        ":sessions           list known sessions",
        ":session <number>   switch to a numbered session",
        ":inspect <number>   show visible fact details",
        ":timebox <number> <range> <session>  update a timebox",
        ":timebox delete <number>             delete a timebox",
        ":undo               undo the last selection action",
        ":restart            restart the app and reload current state",
        ":paste              paste clipboard into the current session",
        ":help               show this help",
        ":exit / :quit       exit",
        "",
        "Input",
        "plain text          capture a fact",
        "/query              search facts",
        ". todo              update first visible fact",
        ". @tag              tag first visible fact",
        "; 9-10 Session      plan a timebox"
      ]
    });
  }
}

class InspectCommand {
  async execute(args, { factRepository, resultSet }) {
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
      helpLines: factDetailLines(fact, filePath)
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

class SessionsCommand {
  async execute(args, { state, sessionRepository }) {
    if (args.trim()) {
      throw new Error(":sessions does not accept arguments");
    }

    if (!sessionRepository) {
      throw new Error(":sessions requires a session repository");
    }

    const sessions = await sessionRepository.list();
    const currentName = state.currentSession?.name ?? null;
    const helpLines = sessions.length > 0
      ? [
          "Sessions",
          ...sessions.map((session, index) => {
            const marker = session === currentName ? "*" : " ";
            return `${String(index + 1).padStart(2, " ")}. ${marker} ${session}`;
          })
        ]
      : ["Sessions", "(none)"];

    return InteractionResult.help({
      mode: AppMode.COMMAND,
      helpLines
    });
  }
}

class SessionCommand {
  async execute(args, { state, sessionRepository }) {
    const target = args.trim();

    if (!target) {
      throw new Error(":session requires a number or session name");
    }

    const sessionName = await resolveSessionName(target, sessionRepository);
    state.switchSession(sessionName);

    return InteractionResult.classified({
      mode: AppMode.COMMAND,
      action: "switch_session",
      message: `switched to ${state.currentSession.name}`
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
    const session = tokens.join(" ").trim();

    if (!rangeToken || !session) {
      throw new Error(":timebox update requires a number, range, and session");
    }

    const [startsAt, endsAt] = parseTimeRange(rangeToken);
    const updatedTimeBox = new TimeBox({
      ...timeBox.toSerializable(),
      date: today ?? timeBox.date,
      startsAt,
      endsAt,
      session
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
    session: new SessionCommand(),
    sessions: new SessionsCommand(),
    switch: new SwitchSessionCommand(),
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

function factDetailLines(fact, filePath) {
  return [
    `Fact ${fact.id}`,
    `type: ${fact.type}`,
    `created: ${fact.createdAt.toISOString()}`,
    `home session: ${fact.homeSession.name}`,
    `associated sessions: ${fact.associatedSessions.map((session) => session.name).join(", ") || "(none)"}`,
    `due: ${fact.dueDate ?? "(none)"}`,
    `attached file: ${fact.file ?? "(none)"}`,
    `path: ${filePath ?? "(not found)"}`,
    "",
    fact.content
  ];
}

async function resolveSessionName(target, sessionRepository) {
  if (!/^\d+$/.test(target)) {
    return target;
  }

  if (!sessionRepository) {
    throw new Error(":session number requires a session repository");
  }

  const sessions = await sessionRepository.list();
  const sessionName = sessions[Number(target) - 1];

  if (!sessionName) {
    throw new Error(`No session numbered ${target}`);
  }

  return sessionName;
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
