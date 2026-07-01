import {
  AssociateCurrentSessionAction,
  SetDueDateAction,
  SetTypeAction,
  TrashFactAction
} from "./selection-actions.js";

export class SelectionActionRegistry {
  constructor(actions = {}, definitions = {}) {
    this.actions = new Map(Object.entries(actions));
    this.definitions = new Map(Object.entries(definitions));
  }

  static fromConfig(config = defaultActionConfig()) {
    const actions = {};
    const definitions = {};

    for (const [keyword, definition] of Object.entries(config.actions ?? {})) {
      actions[keyword] = buildAction(definition);
      definitions[keyword] = definition;
    }

    return new SelectionActionRegistry(actions, definitions);
  }

  resolve(keyword) {
    const action = this.actions.get(keyword);

    if (!action) {
      throw new Error(`Unknown selection action: ${keyword}`);
    }

    return action;
  }

  async execute(keyword, context) {
    return this.resolve(keyword).execute(context);
  }

  keywords() {
    return [...this.actions.keys()].sort();
  }

  preview(keyword, fact, context = {}) {
    const definition = this.definitions.get(keyword);

    if (!definition) {
      return null;
    }

    const previewFact = fact.constructor.from(fact.toSerializable());

    switch (definition.action) {
      case "set_type":
        previewFact.setType(definition.value);
        return previewFact;
      case "set_due":
        previewFact.setDueDate(resolvePreviewDueDate(definition.value, context));
        return previewFact;
      case "associate_current_session":
        if (!context.state?.currentSession) {
          return previewFact;
        }
        previewFact.associateSession(context.state.currentSession);
        return previewFact;
      case "trash":
        previewFact.setType("deleted");
        return previewFact;
      default:
        return null;
    }
  }
}

function buildAction(definition) {
  switch (definition.action) {
    case "set_type":
      return new SetTypeAction(definition.value);
    case "set_due":
      return new SetDueDateAction(definition.value);
    case "trash":
      return new TrashFactAction();
    case "associate_current_session":
      return new AssociateCurrentSessionAction();
    default:
      throw new Error(`Unsupported selection action type: ${definition.action}`);
  }
}

export function defaultActionConfig() {
  return {
    actions: {
      todo: {
        action: "set_type",
        value: "todo"
      },
      waiting: {
        action: "set_type",
        value: "waiting"
      },
      "in-progress": {
        action: "set_type",
        value: "in progress"
      },
      abandoned: {
        action: "set_type",
        value: "abandoned"
      },
      done: {
        action: "set_type",
        value: "done"
      },
      today: {
        action: "set_due",
        value: "today"
      },
      tomorrow: {
        action: "set_due",
        value: "tomorrow"
      },
      delete: {
        action: "trash"
      },
      gather: {
        action: "associate_current_session"
      }
    }
  };
}

function resolvePreviewDueDate(value, context) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (value === "today") {
    return context.today;
  }

  if (value === "tomorrow" && context.today) {
    const date = new Date(`${context.today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  return null;
}
