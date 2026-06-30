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
        ":undo               undo the last selection action",
        ":restart            clear current app state",
        ":paste              recognized; not implemented yet",
        ":help               show this help",
        ":exit / :quit       exit",
        "",
        "Input",
        "plain text          capture a fact",
        "/query              search facts",
        ". todo              update first visible fact",
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

function defaultCommands() {
  return {
    help: new HelpCommand(),
    inspect: new InspectCommand(),
    session: new SessionCommand(),
    sessions: new SessionsCommand(),
    switch: new SwitchSessionCommand(),
    undo: new UndoCommand(),
    restart: new RestartCommand(),
    paste: new PasteCommand()
  };
}

function factDetailLines(fact, filePath) {
  return [
    `Fact ${fact.id}`,
    `type: ${fact.type}`,
    `created: ${fact.createdAt.toISOString()}`,
    `home session: ${fact.homeSession.name}`,
    `associated sessions: ${fact.associatedSessions.map((session) => session.name).join(", ") || "(none)"}`,
    `due: ${fact.dueDate ?? "(none)"}`,
    `file: ${filePath ?? "(not found)"}`,
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
