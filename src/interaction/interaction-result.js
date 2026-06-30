export class InteractionResult {
  constructor({
    mode,
    action,
    message = null,
    fact = null,
    filePath = null,
    resultSet = null,
    query = null,
    timeBox = null,
    timeBoxDate = null,
    helpLines = null,
    undoSnapshot = null
  } = {}) {
    this.mode = mode;
    this.action = action;
    this.message = message;
    this.fact = fact;
    this.filePath = filePath;
    this.resultSet = resultSet;
    this.query = query;
    this.timeBox = timeBox;
    this.timeBoxDate = timeBoxDate;
    this.helpLines = helpLines;
    this.undoSnapshot = undoSnapshot;
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

  static selectionAction({ mode, message, undoSnapshot }) {
    return new InteractionResult({
      mode,
      action: "selection_action",
      message,
      undoSnapshot
    });
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

  static planned({ mode, timeBox }) {
    return new InteractionResult({
      mode,
      action: "plan",
      message: `planned ${timeBox.startsAt}-${timeBox.endsAt} ${timeBox.session.name}`,
      timeBox
    });
  }

  static help({ mode, helpLines }) {
    return new InteractionResult({
      mode,
      action: "help",
      message: "help",
      helpLines
    });
  }

  static panel({ mode, action, message, helpLines }) {
    return new InteractionResult({
      mode,
      action,
      message,
      helpLines
    });
  }

  static timeBoxChanged({ mode, action, message, timeBoxDate }) {
    return new InteractionResult({
      mode,
      action,
      message,
      timeBoxDate
    });
  }
}
