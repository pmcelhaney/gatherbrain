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

async function mutateSelectedFacts({ selection, factStore }, mutate) {
  const results = [];

  for (const factId of selection.toArray()) {
    const fact = await factStore.getFactById(factId);
    results.push(await mutate(fact, factStore));
  }

  return results;
}

function resolveDueDate(expression, context) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(expression)) {
    return expression;
  }

  if (expression === "today") {
    return requireToday(context);
  }

  if (expression === "tomorrow") {
    return addDays(requireToday(context), 1);
  }

  throw new Error(`Unsupported due date expression: ${expression}`);
}

function requireToday(context) {
  if (!context.today) {
    throw new Error("Today is required to resolve relative due dates");
  }

  return context.today;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
