import { AppMode } from "../state/index.js";
import { ansi, color } from "./ansi.js";

export class HeaderRenderer {
  render({ state, viewedContext = null, colorEnabled = false, today = null }) {
    const context = state.currentContext?.name ?? "(no context)";
    const viewedContextName = viewedContext?.name ?? viewedContext;

    if (
      viewedContextName &&
      isDifferentContext(state.currentContext, viewedContextName, context)
    ) {
      return `${color(`${context} > `, ansi.gray, colorEnabled)}${viewedContextName}`;
    }

    const query = state.currentMode === AppMode.SEARCH ? state.currentQuery : null;

    return query ? `${context} | ${query}` : context;
  }
}

function isDifferentContext(currentContext, viewedContext, fallbackContextName) {
  if (!currentContext) {
    return viewedContext !== fallbackContextName;
  }

  return !currentContext.equals(viewedContext);
}
