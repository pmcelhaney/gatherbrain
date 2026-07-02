import { ansi, color } from "./ansi.js";

const DAY_START_MINUTE = 8 * 60;
const DAY_END_MINUTE = 18 * 60;
const TIME_COLUMN_WIDTH = 5;

export class CalendarRenderer {
  render({
    timeBoxes = [],
    planPreview = null,
    height = 20,
    now = null,
    colorEnabled = false
  } = {}) {
    const entries = visibleEntries({ timeBoxes, planPreview });

    if (entries.length === 0) {
      if (planPreview?.error) {
        return [`! ${planPreview.error}`].slice(0, height);
      }

      return ["(no time boxes)"];
    }

    const bounds = timelineBounds(entries, now);
    const rowCount = Math.max(1, height);
    const rowEvents = new Map();

    for (const freeSegment of freeSegments(entries, bounds)) {
      if (freeSegment.endMinute > freeSegment.startMinute) {
        addRowEvent(rowEvents, rowForMinute(freeSegment.startMinute, bounds, rowCount), {
          kind: "free",
          minute: freeSegment.startMinute,
          durationMinutes: freeSegment.endMinute - freeSegment.startMinute
        });
      }
    }

    for (const entry of entries) {
      addRowEvent(rowEvents, rowForMinute(entry.timeBox.startMinute, bounds, rowCount), entry);
    }

    const currentMinute = currentTimelineMinute(now, entries[0]?.timeBox.date);
    if (currentMinute !== null && currentMinute >= bounds.startMinute && currentMinute <= bounds.endMinute) {
      addRowEvent(rowEvents, rowForMinute(currentMinute, bounds, rowCount), {
        kind: "now",
        minute: currentMinute
      });
    }

    return Array.from({ length: rowCount }, (_, row) => {
      const minute = minuteForRow(row, bounds, rowCount);
      const connector = connectorForMinute(minute, entries);
      const events = rowEvents.get(row) ?? [];
      return renderRow({ events, connector, colorEnabled });
    });
  }
}

function visibleEntries({ timeBoxes, planPreview }) {
  const committed = timeBoxes.map((timeBox, index) => ({
    kind: "timeBox",
    number: index + 1,
    timeBox
  }));
  const preview = planPreview?.timeBox
    ? [{ kind: "preview", number: "?", timeBox: planPreview.timeBox }]
    : [];

  return [...committed, ...preview]
    .sort((left, right) => left.timeBox.startsAt.localeCompare(right.timeBox.startsAt));
}

function timelineBounds(entries, now) {
  const starts = entries.map((entry) => entry.timeBox.startMinute);
  const ends = entries.map((entry) => entry.timeBox.endMinute);
  const currentMinute = currentTimelineMinute(now, entries[0]?.timeBox.date);
  const relevantMinutes = currentMinute === null ? [] : [currentMinute];
  const startMinute = Math.min(DAY_START_MINUTE, ...starts, ...relevantMinutes);
  const endMinute = Math.max(DAY_END_MINUTE, ...ends, ...relevantMinutes);

  return { startMinute, endMinute };
}

function freeSegments(entries, bounds) {
  const segments = [];
  let cursor = bounds.startMinute;

  for (const entry of entries) {
    if (entry.timeBox.startMinute > cursor) {
      segments.push({ startMinute: cursor, endMinute: entry.timeBox.startMinute });
    }
    cursor = Math.max(cursor, entry.timeBox.endMinute);
  }

  if (cursor < bounds.endMinute) {
    segments.push({ startMinute: cursor, endMinute: bounds.endMinute });
  }

  return segments;
}

function rowForMinute(minute, bounds, rowCount) {
  if (rowCount === 1 || bounds.endMinute === bounds.startMinute) {
    return 0;
  }

  const ratio = (minute - bounds.startMinute) / (bounds.endMinute - bounds.startMinute);
  return Math.max(0, Math.min(rowCount - 1, Math.round(ratio * (rowCount - 1))));
}

function minuteForRow(row, bounds, rowCount) {
  if (rowCount === 1) {
    return bounds.startMinute;
  }

  const ratio = row / (rowCount - 1);
  return bounds.startMinute + Math.round(ratio * (bounds.endMinute - bounds.startMinute));
}

function addRowEvent(rowEvents, row, event) {
  const events = rowEvents.get(row) ?? [];
  events.push(event);
  rowEvents.set(row, events);
}

function connectorForMinute(minute, entries) {
  return entries.some((entry) => minute >= entry.timeBox.startMinute && minute < entry.timeBox.endMinute)
    ? "busy"
    : "free";
}

function renderRow({ events, connector, colorEnabled }) {
  const connectorText = connector === "busy" ? "│" : "┆";
  const connectorColor = connector === "busy" ? ansi.cyan : ansi.green;
  const event = primaryEvent(events);

  if (!event) {
    return `${" ".repeat(TIME_COLUMN_WIDTH)}  ${color(connectorText, connectorColor, colorEnabled)}`;
  }

  const nowSuffix = events.some((candidate) => candidate.kind === "now" && candidate !== event)
    ? color(" ← now", ansi.magenta, colorEnabled)
    : "";

  if (event.kind === "free") {
    return `${formatMinute(event.minute)}  ${color("○", ansi.green, colorEnabled)}  ${color(`free · ${formatDuration(event.durationMinutes)}`, ansi.green, colorEnabled)}${nowSuffix}`;
  }

  if (event.kind === "now") {
    return `${formatMinute(event.minute)}  ${color("◆", ansi.magenta, colorEnabled)}  ${color("now", ansi.magenta, colorEnabled)}`;
  }

  const marker = event.kind === "preview" ? "?" : "●";
  const label = `${event.timeBox.context.name} · ${formatDuration(event.timeBox.endMinute - event.timeBox.startMinute)}`;
  return `${formatMinute(event.timeBox.startMinute)}  ${color(marker, ansi.cyan, colorEnabled)}  ${color(label, ansi.cyan, colorEnabled)}${nowSuffix}`;
}

function primaryEvent(events) {
  return events.find((event) => event.kind === "timeBox" || event.kind === "preview") ??
    events.find((event) => event.kind === "now") ??
    events[0] ??
    null;
}

function currentTimelineMinute(now, date) {
  if (!(now instanceof Date) || Number.isNaN(now.valueOf()) || !date) {
    return null;
  }

  if (formatLocalDate(now) !== date) {
    return null;
  }

  return now.getHours() * 60 + now.getMinutes();
}

function formatLocalDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function formatMinute(minute) {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  const hour12 = hours % 12 || 12;
  return `${String(hour12).padStart(TIME_COLUMN_WIDTH - 3, " ")}:${String(minutes).padStart(2, "0")}`;
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder}m`;
  }

  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
}
