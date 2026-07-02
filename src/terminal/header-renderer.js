import { AppMode } from "../state/index.js";

export class HeaderRenderer {
  render({ state, today = null }) {
    const context = state.currentContext?.name ?? "(no context)";
    const query = state.currentMode === AppMode.SEARCH ? state.currentQuery : null;

    return query ? `contexts/${context} | ${query}` : `contexts/${context}`;
  }
}
