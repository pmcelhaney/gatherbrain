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
    selectionPreview = null,
    width = 80,
    height = 20,
    today = null,
    now = null,
    colorEnabled = false
  }) {
    if (helpLines) {
      return helpLines.slice(0, height);
    }

    if (state.currentMode === AppMode.PLAN) {
      return this.calendarRenderer.render({
        timeBoxes,
        planPreview: state.planPreview,
        height,
        now,
        colorEnabled
      });
    }

    if (!resultSet || resultSet.count === 0) {
      return ["..."];
    }

    const rows = resultSet.toRows();
    const numberWidth = Math.max(2, String(resultSet.count).length);
    const rendered = [];

    for (const { number, fact } of rows) {
      const isSelected = selectionPreview?.includes(fact.id) ?? false;
      const contextMarker = isFactInCurrentContext(fact, state.currentSession) ? "+" : " ";
      const basePrefix = `${contextMarker}${padVisibleStart(String(number), numberWidth)}. `;
      const prefix = isSelected && !colorEnabled ? `>${basePrefix}` : basePrefix;
      const type = fact.type ? `${fact.type} ` : "";
      const due = fact.dueDate ? `${formatDueDate(fact.dueDate, today)} ` : "";
      const firstLinePrefix = `${color(prefix, ansi.gray, colorEnabled)}${color(type, ansi.cyan, colorEnabled)}${color(due, ansi.magenta, colorEnabled)}`;
      const continuationPrefix = " ".repeat(numberWidth + 2);
      const firstLineWidth = Math.max(1, width - prefix.length - type.length - due.length);
      const continuationWidth = Math.max(1, width - continuationPrefix.length);
      const [first, ...rest] = wrapPlain(fact.content, firstLineWidth);

      rendered.push(highlight(`${firstLinePrefix}${first}`, isSelected, colorEnabled));
      for (const line of rest) {
        for (const wrapped of wrapPlain(line, continuationWidth)) {
          rendered.push(highlight(`${continuationPrefix}${wrapped}`, isSelected, colorEnabled));
        }
      }
    }

    if (rendered.length > height) {
      return [...rendered.slice(0, height - 1), "..."];
    }

    return rendered;
  }
}

function isFactInCurrentContext(fact, currentSession) {
  if (!currentSession) {
    return false;
  }

  return fact.homeSession.equals(currentSession) ||
    fact.associatedSessions.some((session) => session.equals(currentSession));
}

function highlight(text, enabled, colorEnabled) {
  if (!enabled || !colorEnabled) {
    return text;
  }

  return `${ansi.reverse}${text}${ansi.reset}`;
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

  if (days === -1) {
    return "yesterday";
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
