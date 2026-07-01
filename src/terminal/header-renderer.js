export class HeaderRenderer {
  render({ state, today = null }) {
    const session = state.currentSession?.name ?? "(no session)";

    return `sessions/${session}`;
  }
}
