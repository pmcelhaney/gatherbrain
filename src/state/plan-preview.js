import { TimeBox } from "../domain/index.js";

export class PlanPreview {
  constructor({ timeBox = null, input = "", error = null } = {}) {
    this.timeBox = timeBox ? TimeBox.from(timeBox) : null;
    this.input = String(input);
    this.error = error;
  }

  isValid() {
    return this.timeBox !== null && this.error === null;
  }

  commit() {
    if (!this.isValid()) {
      throw new Error(this.error ?? "Plan preview is not valid");
    }

    return this.timeBox;
  }

  static valid(timeBox, input = "") {
    return new PlanPreview({ timeBox, input });
  }

  static invalid(input, error) {
    return new PlanPreview({ input, error: error instanceof Error ? error.message : String(error) });
  }

  static from(value) {
    if (value instanceof PlanPreview) {
      return new PlanPreview({
        timeBox: value.timeBox,
        input: value.input,
        error: value.error
      });
    }

    return new PlanPreview(value);
  }
}
