export class SearchQueryParser {
  parse(rawQuery) {
    const query = normalizeQuery(rawQuery);
    const tokens = coalesceFieldValues(tokenize(query));
    const parser = new Parser(tokens);
    const expression = parser.parseExpression();

    if (!parser.isAtEnd()) {
      throw new Error(`Unexpected search token: ${parser.peek().value}`);
    }

    return expression;
  }
}

function normalizeQuery(rawQuery) {
  if (typeof rawQuery !== "string" || rawQuery.trim().length === 0) {
    throw new Error("Search query is required");
  }

  const query = rawQuery.trim().replace(/^\//, "").trim();

  if (query.startsWith("@") && !/\s+(AND|OR|NOT)\s+/i.test(query)) {
    return `session:"${query.slice(1).trim()}"`;
  }

  return query;
}

function tokenize(query) {
  const tokens = [];
  let index = 0;

  while (index < query.length) {
    const char = query[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }

    if (char === "\"") {
      const endIndex = query.indexOf("\"", index + 1);

      if (endIndex === -1) {
        throw new Error("Unclosed quoted phrase in search query");
      }

      tokens.push({ type: "phrase", value: query.slice(index + 1, endIndex) });
      index = endIndex + 1;
      continue;
    }

    let value = "";

    while (index < query.length && !/\s|\(|\)/.test(query[index])) {
      if (query[index] === "\"") {
        const endIndex = query.indexOf("\"", index + 1);

        if (endIndex === -1) {
          throw new Error("Unclosed quoted phrase in search query");
        }

        value += query.slice(index + 1, endIndex);
        index = endIndex + 1;
        continue;
      }

      value += query[index];
      index += 1;
    }

    tokens.push(classifyWord(value));
  }

  return tokens;
}

function classifyWord(value) {
  const upperValue = value.toUpperCase();

  if (["AND", "OR", "NOT"].includes(upperValue)) {
    return { type: "operator", value: upperValue };
  }

  return { type: "term", value };
}

function coalesceFieldValues(tokens) {
  const result = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const field = parseFieldToken(token);

    if (!field) {
      result.push(token);
      continue;
    }

    if (field.name === "session") {
      const values = [field.value];

      while (index + 1 < tokens.length && isSessionFieldContinuation(tokens[index + 1])) {
        index += 1;
        values.push(tokens[index].value);
      }

      result.push({
        type: "field",
        name: field.name,
        operator: field.operator,
        value: values.join(" ").trim()
      });
      continue;
    }

    result.push({
      type: "field",
      name: field.name,
      operator: field.operator,
      value: field.value
    });
  }

  return result;
}

function isSessionFieldContinuation(token) {
  if (!token || token.type !== "term" && token.type !== "phrase") {
    return false;
  }

  return !parseFieldToken(token);
}

function parseFieldToken(token) {
  if (!token || token.type !== "term") {
    return null;
  }

  const match = token.value.match(/^([A-Za-z_][A-Za-z0-9_]*)(<=|>=|<|>|:)(.*)$/);

  if (!match) {
    return null;
  }

  return {
    name: match[1].toLowerCase(),
    operator: match[2],
    value: match[3]
  };
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  parseExpression() {
    return this.parseOr();
  }

  parseOr() {
    let expression = this.parseAnd();

    while (this.matchOperator("OR")) {
      expression = {
        type: "or",
        left: expression,
        right: this.parseAnd()
      };
    }

    return expression;
  }

  parseAnd() {
    let expression = this.parseNot();

    while (this.matchOperator("AND") || this.startsImplicitAnd()) {
      expression = {
        type: "and",
        left: expression,
        right: this.parseNot()
      };
    }

    return expression;
  }

  parseNot() {
    if (this.matchOperator("NOT")) {
      return {
        type: "not",
        expression: this.parseNot()
      };
    }

    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.advance();

    if (!token) {
      throw new Error("Unexpected end of search query");
    }

    if (token.type === "(") {
      const expression = this.parseExpression();
      this.consume(")", "Expected closing parenthesis in search query");
      return expression;
    }

    if (token.type === "term" || token.type === "phrase") {
      return {
        type: "term",
        value: token.value
      };
    }

    if (token.type === "field") {
      return {
        type: "field",
        field: token.name,
        operator: token.operator,
        value: token.value
      };
    }

    throw new Error(`Unexpected search token: ${token.value}`);
  }

  startsImplicitAnd() {
    const token = this.peek();
    return token && ["term", "phrase", "field", "("].includes(token.type);
  }

  matchOperator(operator) {
    const token = this.peek();

    if (token?.type === "operator" && token.value === operator) {
      this.advance();
      return true;
    }

    return false;
  }

  consume(type, message) {
    if (this.peek()?.type === type) {
      return this.advance();
    }

    throw new Error(message);
  }

  advance() {
    if (this.isAtEnd()) {
      return null;
    }

    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  peek() {
    return this.tokens[this.index];
  }

  isAtEnd() {
    return this.index >= this.tokens.length;
  }
}
