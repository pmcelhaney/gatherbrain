export class InteractionResult {
  constructor({
    mode,
    action,
    message = null,
    fact = null,
    filePath = null,
    resultSet = null,
    query = null
  } = {}) {
    this.mode = mode;
    this.action = action;
    this.message = message;
    this.fact = fact;
    this.filePath = filePath;
    this.resultSet = resultSet;
    this.query = query;
  }

  static captured({ mode, fact, filePath }) {
    return new InteractionResult({
      mode,
      action: "capture",
      message: "captured fact",
      fact,
      filePath
    });
  }

  static classified({ mode, action = "classified", message = null }) {
    return new InteractionResult({ mode, action, message });
  }

  static searched({ mode, query, resultSet }) {
    return new InteractionResult({
      mode,
      action: "search",
      message: `${resultSet.count} result${resultSet.count === 1 ? "" : "s"}`,
      resultSet,
      query
    });
  }
}
