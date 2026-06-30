import { AppMode } from "../state/index.js";

export class PromptRenderer {
  render({ state, input = "", cursor = input.length, showCursor = false }) {
    const renderedInput = showCursor ? renderCursor(input, cursor) : input;
    return `${prefixForMode(state.currentMode)} ${renderedInput}`.trimEnd();
  }
}

function renderCursor(input, cursor) {
  return `${input.slice(0, cursor)}█${input.slice(cursor)}`;
}

function prefixForMode(mode) {
  switch (mode) {
    case AppMode.SEARCH:
      return ">";
    case AppMode.COMMAND:
      return ">";
    case AppMode.PLAN:
      return ">";
    case AppMode.SELECTION:
      return ">";
    case AppMode.CAPTURE:
    default:
      return ">";
  }
}
