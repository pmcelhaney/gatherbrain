const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];
const MONTHS = new Map([
  ["january", 1],
  ["jan", 1],
  ["february", 2],
  ["feb", 2],
  ["march", 3],
  ["mar", 3],
  ["april", 4],
  ["apr", 4],
  ["may", 5],
  ["june", 6],
  ["jun", 6],
  ["july", 7],
  ["jul", 7],
  ["august", 8],
  ["aug", 8],
  ["september", 9],
  ["sep", 9],
  ["sept", 9],
  ["october", 10],
  ["oct", 10],
  ["november", 11],
  ["nov", 11],
  ["december", 12],
  ["dec", 12]
]);

const WEEKDAY_PATTERN = WEEKDAY_NAMES.join("|");
const MONTH_PATTERN = [...MONTHS.keys()].join("|");
const NATURAL_DATE_PATTERN = new RegExp(
  `\\b(today|tomorrow|yesterday|next\\s+(?:${WEEKDAY_PATTERN})|(?:${MONTH_PATTERN})\\.?\\s+\\d{1,2}(?:,?\\s+\\d{4})?)\\b`,
  "gi"
);
const NATURAL_DATE_PREFIX_PATTERN = new RegExp(
  `^(?<date>today|tomorrow|yesterday|next\\s+(?:${WEEKDAY_PATTERN})|(?:${MONTH_PATTERN})\\.?\\s+\\d{1,2}(?:,?\\s+\\d{4})?)(?=\\s|$)`,
  "i"
);

export function normalizeNaturalDates(text, { today } = {}) {
  if (!today || typeof text !== "string") {
    return text;
  }

  return text.replace(NATURAL_DATE_PATTERN, (match) => {
    return dateFromNaturalText(match, { today }) ?? match;
  });
}

export function naturalDatePrefix(text, { today } = {}) {
  if (!today || typeof text !== "string") {
    return null;
  }

  const match = text.match(NATURAL_DATE_PREFIX_PATTERN);

  if (!match) {
    return null;
  }

  const date = dateFromNaturalText(match.groups.date, { today });

  if (!date) {
    return null;
  }

  return {
    date,
    text: match.groups.date,
    rest: text.slice(match[0].length).trimStart()
  };
}

export function isDateExpression(expression) {
  if (typeof expression !== "string") {
    return false;
  }

  const normalized = expression.trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
    dateFromNaturalText(normalized, { today: "2026-01-01" }) !== null;
}

export function resolveDateExpression(expression, { today } = {}) {
  const normalized = expression.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const date = dateFromNaturalText(normalized, { today });

  if (date) {
    return date;
  }

  throw new Error(`Unsupported due date expression: ${expression}`);
}

export function replaceIsoDatesWithNaturalDates(text, { today } = {}) {
  if (!today || typeof text !== "string") {
    return text;
  }

  return text.replace(ISO_DATE_PATTERN, (match) => {
    return isValidDateParts(match) ? formatNaturalDate(match, { today }) : match;
  });
}

export function formatNaturalDate(dateString, { today } = {}) {
  if (!today) {
    return dateString;
  }

  const days = daysBetween(today, dateString);

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
    return formatUtcDate(dateString, { weekday: "short" });
  }

  return formatUtcDate(dateString, { month: "short", day: "numeric" });
}

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateFromNaturalText(expression, { today } = {}) {
  if (!today) {
    return null;
  }

  const normalized = expression.trim().toLocaleLowerCase("en-US").replace(/\.$/, "");

  if (normalized === "today") {
    return today;
  }

  if (normalized === "tomorrow") {
    return addDays(today, 1);
  }

  if (normalized === "yesterday") {
    return addDays(today, -1);
  }

  const nextWeekday = normalized.match(/^next\s+([a-z]+)$/);

  if (nextWeekday) {
    return dateForNextWeekday(today, nextWeekday[1]);
  }

  const monthDay = normalized.match(/^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);

  if (monthDay) {
    const month = MONTHS.get(monthDay[1]);
    const day = Number(monthDay[2]);
    const year = Number(monthDay[3] ?? today.slice(0, 4));
    return dateForMonthDay({ year, month, day });
  }

  return null;
}

function dateForNextWeekday(today, weekdayName) {
  const targetDay = WEEKDAY_NAMES.indexOf(weekdayName);

  if (targetDay === -1) {
    return null;
  }

  const date = new Date(`${today}T00:00:00.000Z`);
  const currentDay = date.getUTCDay();
  const daysUntilTarget = ((targetDay - currentDay + 7) % 7) || 7;
  date.setUTCDate(date.getUTCDate() + daysUntilTarget);
  return date.toISOString().slice(0, 10);
}

function dateForMonthDay({ year, month, day }) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
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

function isValidDateParts(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return dateForMonthDay({ year, month, day }) === dateString;
}
