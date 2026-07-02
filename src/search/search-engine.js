import { SearchResultSet } from "./search-result-set.js";

export class SearchEngine {
  search(facts, queryAst, context = {}) {
    return new SearchResultSet(
      facts
        .filter((fact) => evaluate(queryAst, fact, context))
        .sort((left, right) => compareSearchResults(left, right, context.currentContext))
    );
  }
}

function compareSearchResults(left, right, currentContext) {
  if (currentContext) {
    const leftIsCurrent = isFactInCurrentContext(left, currentContext);
    const rightIsCurrent = isFactInCurrentContext(right, currentContext);

    if (leftIsCurrent !== rightIsCurrent) {
      return leftIsCurrent ? -1 : 1;
    }
  }

  return compareNewestFirst(left, right);
}

function compareNewestFirst(left, right) {
  return right.createdAt.getTime() - left.createdAt.getTime();
}

function isFactInCurrentContext(fact, currentContext) {
  const currentContextName = currentContext.name ?? currentContext;

  return fact.homeContext.name === currentContextName ||
    fact.associatedContexts.some((context) => context.name === currentContextName);
}

function evaluate(node, fact, context) {
  switch (node.type) {
    case "all":
      return true;
    case "and":
      return evaluate(node.left, fact, context) && evaluate(node.right, fact, context);
    case "or":
      return evaluate(node.left, fact, context) || evaluate(node.right, fact, context);
    case "not":
      return !evaluate(node.expression, fact, context);
    case "term":
      return containsTerm(fact, node.value);
    case "field":
      return matchesField(fact, node, context);
    default:
      throw new Error(`Unsupported search AST node: ${node.type}`);
  }
}

function containsTerm(fact, term) {
  const haystack = [
    fact.content,
    fact.type,
    fact.url,
    fact.homeContext.name,
    ...fact.associatedContexts.map((context) => context.name),
    ...fact.tags
  ].join(" ").toLocaleLowerCase("en-US");

  return haystack.includes(term.toLocaleLowerCase("en-US"));
}

function matchesField(fact, node, context) {
  const value = resolveDynamicValue(node.value, context);

  if (node.field === "type") {
    return compareText(fact.type, node.operator, value);
  }

  if (node.field === "context") {
    const contexts = [
      fact.homeContext.name,
      ...fact.associatedContexts.map((context) => context.name)
    ];

    return contexts.some((context) => compareText(context, node.operator, value));
  }

  if (node.field === "tag") {
    return fact.tags.some((tag) => compareText(tag, node.operator, value));
  }

  if (node.field === "due") {
    return compareDate(fact.dueDate, node.operator, value);
  }

  if (node.field === "content") {
    return compareText(fact.content, node.operator, value);
  }

  throw new Error(`Unsupported search field: ${node.field}`);
}

function compareText(actual, operator, expected) {
  const normalizedActual = actual.toLocaleLowerCase("en-US");
  const normalizedExpected = expected.toLocaleLowerCase("en-US");

  if (operator !== ":") {
    throw new Error(`Operator ${operator} is not supported for text fields`);
  }

  return normalizedActual === normalizedExpected ||
    normalizedActual.includes(normalizedExpected);
}

function compareDate(actual, operator, expected) {
  if (!actual) {
    return false;
  }

  switch (operator) {
    case ":":
      return actual === expected;
    case "<":
      return actual < expected;
    case "<=":
      return actual <= expected;
    case ">":
      return actual > expected;
    case ">=":
      return actual >= expected;
    default:
      throw new Error(`Unsupported date operator: ${operator}`);
  }
}

function resolveDynamicValue(value, context) {
  if (value === "today") {
    if (!context.today) {
      throw new Error("Search context requires today");
    }

    return context.today;
  }

  return value;
}
