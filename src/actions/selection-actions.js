import { resolveDateExpression } from "../domain/date-text.js";

export class SetTypeAction {
  constructor(type) {
    this.type = type;
  }

  async execute(context) {
    return mutateSelectedFacts(context, async (fact, factStore) => {
      fact.setType(this.type);
      await factStore.saveFact(fact);
      return { fact, action: "set_type", value: this.type };
    });
  }
}

export class SetDueDateAction {
  constructor(dueDateExpression) {
    this.dueDateExpression = dueDateExpression;
  }

  async execute(context) {
    const dueDate = resolveDueDate(this.dueDateExpression, context);

    return mutateSelectedFacts(context, async (fact, factStore) => {
      fact.setDueDate(dueDate);
      await factStore.saveFact(fact);
      return { fact, action: "set_due", value: dueDate };
    });
  }
}

export class AddTagAction {
  constructor(tag) {
    this.tag = tag;
  }

  async execute(context) {
    return mutateSelectedFacts(context, async (fact, factStore) => {
      fact.addTag(this.tag);
      await factStore.saveFact(fact);
      return { fact, action: "add_tag", value: this.tag };
    });
  }
}

export class TrashFactAction {
  async execute(context) {
    return mutateSelectedFacts(context, async (fact, factStore) => {
      await factStore.trashFact(fact);
      return { fact, action: "trash" };
    });
  }
}

export class AssociateCurrentSessionAction {
  async execute(context) {
    if (!context.state.currentSession) {
      throw new Error("Current session is required to gather facts");
    }

    return mutateSelectedFacts(context, async (fact, factStore) => {
      fact.associateSession(context.state.currentSession);
      await factStore.saveFact(fact);
      return {
        fact,
        action: "associate_current_session",
        value: context.state.currentSession.name
      };
    });
  }
}

export class OpenFileAction {
  async execute(context) {
    const opener = context.fileOpener ?? defaultFileOpener;
    const results = [];

    for (const factId of context.selection.toArray()) {
      const fact = await context.factStore.getFactById(factId);

      if (!fact.file) {
        throw new Error("Selected fact has no associated file");
      }

      const factPath = await context.factStore.findPathByFactId(factId);

      if (!factPath) {
        throw new Error(`Fact not found: ${factId}`);
      }

      const filePath = await opener.openAssociatedFile({ fact, factPath });
      results.push({ fact, action: "open_file", value: filePath });
    }

    return results;
  }
}

async function mutateSelectedFacts({ selection, factStore }, mutate) {
  const results = [];

  for (const factId of selection.toArray()) {
    const fact = await factStore.getFactById(factId);
    results.push(await mutate(fact, factStore));
  }

  return results;
}

const defaultFileOpener = {
  async openAssociatedFile() {
    throw new Error("File opener is required");
  }
};

function resolveDueDate(expression, context) {
  return resolveDateExpression(expression, context);
}
