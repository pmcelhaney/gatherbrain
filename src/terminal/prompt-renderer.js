import { AppMode } from "../state/index.js";
import { ansi } from "./ansi.js";

export class PromptRenderer {
  render({ state, input = "", cursor = input.length, showCursor = false }) {
    const renderedInput = showCursor ? renderCursor(input, cursor) : input;
    return `${prefixForMode(state.currentMode)} ${renderedInput}`.trimEnd();
  }
}

function renderCursor(input, cursor) {
  if (cursor >= input.length) {
    return `${input}█`;
  }

  return `${input.slice(0, cursor)}${ansi.reverse}${input[cursor]}${ansi.reset}${input.slice(cursor + 1)}`;
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
