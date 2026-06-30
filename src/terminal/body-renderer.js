import { AppMode } from "../state/index.js";
import { ansi, color, padVisibleStart, wrapPlain } from "./ansi.js";

export class BodyRenderer {
  constructor({ calendarRenderer }) {
    this.calendarRenderer = calendarRenderer;
  }

  render({
    state,
    resultSet = null,
    timeBoxes = [],
    helpLines = null,
    width = 80,
    height = 20,
    today = null,
    colorEnabled = false
  }) {
    if (helpLines) {
      return helpLines.slice(0, height);
    }

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
      const due = fact.dueDate ? ` due:${formatDueDate(fact.dueDate, today)}` : "";
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

function formatDueDate(dueDate, today) {
  if (!today) {
    return dueDate;
  }

  const days = daysBetween(today, dueDate);

  if (days === 0) {
    return "today";
  }

  if (days === 1) {
    return "tomorrow";
  }

  if (days > 1 && days < 7) {
    return formatUtcDate(dueDate, { weekday: "short" });
  }

  return formatUtcDate(dueDate, { month: "short", day: "numeric" });
}

function daysBetween(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);

  return Math.round((end - start) / 86_400_000);
}

function formatUtcDate(date, options) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...options
  }).format(new Date(`${date}T00:00:00.000Z`));
}
