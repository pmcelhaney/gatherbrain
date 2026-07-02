export class HeaderRenderer {
  render({ state, today = null }) {
    const context = state.currentContext?.name ?? "(no context)";

    return `contexts/${context}`;
  }
}
