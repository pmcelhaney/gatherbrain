import {
  AssociateCurrentSessionAction,
  SetDueDateAction,
  SetTypeAction,
  TrashFactAction
} from "./selection-actions.js";

export class SelectionActionRegistry {
  constructor(actions = {}) {
    this.actions = new Map(Object.entries(actions));
  }

  static fromConfig(config = defaultActionConfig()) {
    const actions = {};

    for (const [keyword, definition] of Object.entries(config.actions ?? {})) {
      actions[keyword] = buildAction(definition);
    }

    return new SelectionActionRegistry(actions);
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
      done: {
        action: "set_type",
        value: "done"
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
