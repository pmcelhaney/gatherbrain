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

  render({
    resultSet = null,
    timeBoxes = [],
    input = "",
    width = 80,
    height = 24,
    today = null,
    colorEnabled = false
  } = {}) {
    const header = this.headerRenderer.render({ state: this.state, resultSet, today });
    const divider = "-".repeat(width);
    const prompt = this.promptRenderer.render({ state: this.state, input });
    const bodyHeight = Math.max(1, height - 4);
    const bodyLines = this.bodyRenderer.render({
      state: this.state,
      resultSet,
      timeBoxes,
      width,
      height: bodyHeight,
      colorEnabled
    });
    const paddedBody = padLines(bodyLines, bodyHeight);

    return [
      header,
      divider,
      ...paddedBody,
      prompt
    ].join("\n");
  }
}

function padLines(lines, height) {
  const result = Array.isArray(lines) ? [...lines] : String(lines).split("\n");

  while (result.length < height) {
    result.push("");
  }

  return result.slice(0, height);
}
