import {
  AddTagAction,
  AssociateCurrentSessionAction,
  EditFactFileAction,
  OpenFileAction,
  SetDueDateAction,
  SetTypeAction,
  TrashFactAction
} from "./selection-actions.js";
import { isDateExpression, resolveDateExpression } from "../domain/date-text.js";

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
    if (isTagAction(keyword)) {
      return new AddTagAction(tagFromAction(keyword));
    }

    const action = this.actions.get(keyword);

    if (!action) {
      if (isDateExpression(keyword)) {
        return new SetDueDateAction(keyword);
      }

      throw new Error(`Unknown selection action: ${keyword}`);
    }

    return action;
  }

  async execute(keyword, context) {
    return this.resolve(actionText(keyword, context.actionArgs)).execute(context);
  }

  keywords() {
    return [...this.actions.keys()].sort();
  }

  preview(keyword, fact, context = {}) {
    const resolvedKeyword = actionText(keyword, context.actionArgs);

    if (isTagAction(resolvedKeyword)) {
      const previewFact = fact.constructor.from(fact.toSerializable());
      previewFact.addTag(tagFromAction(resolvedKeyword));
      return previewFact;
    }

    const definition = this.definitions.get(keyword);

    if (!definition && isDateExpression(resolvedKeyword)) {
      const previewFact = fact.constructor.from(fact.toSerializable());
      previewFact.setDueDate(resolvePreviewDueDate(resolvedKeyword, context));
      return previewFact;
    }

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
      case "open_file":
      case "edit_file":
        return previewFact;
      case "trash":
        previewFact.setType("deleted");
        return previewFact;
      default:
        return null;
    }
  }
}

function actionText(keyword, args = []) {
  return [keyword, ...args].filter(Boolean).join(" ");
}

function isTagAction(keyword) {
  return typeof keyword === "string" && keyword.startsWith("@") && keyword.length > 1;
}

function tagFromAction(keyword) {
  return keyword.slice(1);
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
    case "open_file":
      return new OpenFileAction();
    case "edit_file":
      return new EditFactFileAction();
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
      inprogress: {
        action: "set_type",
        value: "inprogress"
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
      },
      open: {
        action: "open_file"
      },
      edit: {
        action: "edit_file"
      }
    }
  };
}

function resolvePreviewDueDate(value, context) {
  return resolveDateExpression(value, context);
}
