import { AppMode } from "../state/index.js";
import { ansi, color, padVisibleStart, wrapPlain } from "./ansi.js";

export class BodyRenderer {
  constructor({ calendarRenderer }) {
    this.calendarRenderer = calendarRenderer;
  }

  render({ state, resultSet = null, timeBoxes = [], width = 80, height = 20, colorEnabled = false }) {
    if (state.currentMode === AppMode.PLAN) {
      return this.calendarRenderer.render({
        timeBoxes,
        planPreview: state.planPreview,
        height
      });
    }

    if (!resultSet || resultSet.count === 0) {
      return ["..."];
    }

    const rows = resultSet.toRows().slice().reverse();
    const numberWidth = Math.max(2, String(resultSet.count).length);
    const rendered = [];

    for (const { number, fact } of rows) {
      const prefix = `${padVisibleStart(String(number), numberWidth)}. `;
      const type = fact.type ? `${fact.type} ` : "";
      const due = fact.dueDate ? ` due:${fact.dueDate}` : "";
      const firstLinePrefix = `${color(prefix, ansi.gray, colorEnabled)}${color(type, ansi.cyan, colorEnabled)}`;
      const continuationPrefix = " ".repeat(numberWidth + 2);
      const firstLineWidth = Math.max(1, width - prefix.length - type.length);
      const continuationWidth = Math.max(1, width - continuationPrefix.length);
      const [first, ...rest] = wrapPlain(`${fact.content}${due}`, firstLineWidth);

      rendered.push(`${firstLinePrefix}${first}`);
      for (const line of rest) {
        for (const wrapped of wrapPlain(line, continuationWidth)) {
          rendered.push(`${continuationPrefix}${wrapped}`);
        }
      }
    }

    if (rendered.length > height) {
      return ["...", ...rendered.slice(-(height - 1))];
    }

    return rendered;
  }
}
