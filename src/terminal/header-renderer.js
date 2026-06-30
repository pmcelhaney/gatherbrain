export class HeaderRenderer {
  render({ state, resultSet = null }) {
    const session = state.currentSession?.name ?? "(none)";
    const query = state.currentQuery ?? "(none)";
    const count = resultSet?.count ?? 0;

    return `Session: ${session} | Query: ${query} | Mode: ${state.currentMode} | Results: ${count}`;
  }
}
