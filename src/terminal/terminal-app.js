import { BodyRenderer } from "./body-renderer.js";
import { CalendarRenderer } from "./calendar-renderer.js";
import { HeaderRenderer } from "./header-renderer.js";
import { PromptRenderer } from "./prompt-renderer.js";
import { ansi, color, truncateVisible } from "./ansi.js";

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
    helpLines = null,
    selectionPreview = null,
    input = "",
    cursor = input.length,
    showCursor = false,
    completionSuggestionStart = null,
    completionCandidates = [],
    completionCandidateIndex = null,
    status = "",
    width = 80,
    height = 24,
    today = null,
    now = null,
    colorEnabled = false,
    state = this.state
  } = {}) {
    const header = this.headerRenderer.render({ state, resultSet, today });
    const divider = "-".repeat(width);
    const prompt = this.promptRenderer.render({
      state,
      input,
      cursor,
      showCursor,
      completionSuggestionStart,
      colorEnabled
    });
    const completionLine = formatCompletionCandidates({
      candidates: completionCandidates,
      activeIndex: completionCandidateIndex,
      colorEnabled,
      width
    });
    const statusLines = [
      ...(completionLine ? [completionLine] : []),
      ...(status ? [status] : [])
    ];
    const bodyHeight = Math.max(1, height - 3 - statusLines.length);
    const bodyLines = this.bodyRenderer.render({
      state,
      resultSet,
      timeBoxes,
      helpLines,
      selectionPreview,
      width,
      height: bodyHeight,
      today,
      now,
      colorEnabled
    });
    const paddedBody = padLines(bodyLines, bodyHeight);

    return [
      header,
      divider,
      ...paddedBody,
      ...statusLines,
      prompt
    ].join("\n");
  }
}

function formatCompletionCandidates({
  candidates = [],
  activeIndex = null,
  colorEnabled = false,
  width = 80
}) {
  if (!Array.isArray(candidates) || candidates.length <= 1) {
    return "";
  }

  const visibleCandidates = candidates.slice(0, 5).map((candidate, index) => {
    if (index === activeIndex) {
      return color(candidate, ansi.cyan, colorEnabled);
    }
    return color(candidate, ansi.gray, colorEnabled);
  });
  const hiddenCount = candidates.length - visibleCandidates.length;

  if (hiddenCount > 0) {
    visibleCandidates.push(color(`+${hiddenCount}`, ansi.gray, colorEnabled));
  }

  return truncateVisible(visibleCandidates.join("  "), width);
}

function padLines(lines, height) {
  const result = Array.isArray(lines) ? [...lines] : String(lines).split("\n");

  while (result.length < height) {
    result.push("");
  }

  return result.slice(0, height);
}
