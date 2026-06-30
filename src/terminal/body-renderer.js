import { AppMode } from "../state/index.js";

export class BodyRenderer {
  constructor({ calendarRenderer }) {
    this.calendarRenderer = calendarRenderer;
  }

  render({ state, resultSet = null, timeBoxes = [] }) {
    if (state.currentMode === AppMode.PLAN) {
      return this.calendarRenderer.render({
        timeBoxes,
        planPreview: state.planPreview
      });
    }

    if (!resultSet || resultSet.count === 0) {
      return "(no facts)";
    }

    return resultSet.toRows().map(({ number, fact }) => {
      const due = fact.dueDate ? ` due:${fact.dueDate}` : "";
      return `${number}. [${fact.type}] ${fact.content}${due}`;
    }).join("\n");
  }
}
