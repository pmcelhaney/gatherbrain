import { BodyRenderer } from "./body-renderer.js";
import { CalendarRenderer } from "./calendar-renderer.js";
import { HeaderRenderer } from "./header-renderer.js";
import { PromptRenderer } from "./prompt-renderer.js";

export class TerminalApp {
  constructor({
    state,
    headerRenderer = new HeaderRenderer(),
    calendarRenderer = new CalendarRenderer(),
    bodyRenderer = new BodyRenderer({ calendarRenderer }),
    promptRenderer = new PromptRenderer()
  }) {
    this.state = state;
    this.headerRenderer = headerRenderer;
    this.bodyRenderer = bodyRenderer;
    this.promptRenderer = promptRenderer;
  }

  render({ resultSet = null, timeBoxes = [], input = "" } = {}) {
    return [
      this.headerRenderer.render({ state: this.state, resultSet }),
      "",
      this.bodyRenderer.render({ state: this.state, resultSet, timeBoxes }),
      "",
      this.promptRenderer.render({ state: this.state, input })
    ].join("\n");
  }
}
