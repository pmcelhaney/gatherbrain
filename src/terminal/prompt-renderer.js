import { AppMode } from "../state/index.js";

export class PromptRenderer {
  render({ state, input = "" }) {
    return `${prefixForMode(state.currentMode)} ${input}`.trimEnd();
  }
}

function prefixForMode(mode) {
  switch (mode) {
    case AppMode.SEARCH:
      return "/";
    case AppMode.COMMAND:
      return ":";
    case AppMode.PLAN:
      return ";";
    case AppMode.SELECTION:
      return ">";
    case AppMode.CAPTURE:
    default:
      return ">";
  }
}
