export class HeaderRenderer {
  render({ state, today = null }) {
    const date = today ?? new Date().toISOString().slice(0, 10);
    const session = state.currentSession?.name ?? "(no session)";

    return `sessions/${date}/${session}`;
  }
}
