export class InteractionResult {
  constructor({ mode, action, message = null, fact = null, filePath = null } = {}) {
    this.mode = mode;
    this.action = action;
    this.message = message;
    this.fact = fact;
    this.filePath = filePath;
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
}
