const weekdayIndexes = new Map([
  ['sunday', 0],
  ['sun', 0],
  ['monday', 1],
  ['mon', 1],
  ['tuesday', 2],
  ['tue', 2],
  ['tues', 2],
  ['wednesday', 3],
  ['wed', 3],
  ['thursday', 4],
  ['thu', 4],
  ['thur', 4],
  ['thurs', 4],
  ['friday', 5],
  ['fri', 5],
  ['saturday', 6],
  ['sat', 6]
]);

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/u;

function localDateAtNoon(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function dateWithOffset(date, days) {
  const nextDate = localDateAtNoon(date);

  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatDateArgument(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function validIsoDate(value) {
  if (!isoDatePattern.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);

  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    ? value
    : null;
}

function dateFromMonthDayYear(value) {
  const match = value.match(/^(?<month>\d{1,2})\/(?<day>\d{1,2})\/(?<year>\d{2}|\d{4})$/u);

  if (!match) {
    return null;
  }

  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const yearValue = Number(match.groups.year);
  const year = match.groups.year.length === 2 ? 2000 + yearValue : yearValue;
  const date = new Date(year, month - 1, day, 12);

  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    ? formatDateArgument(date)
    : null;
}

function nextWeekdayDate(value, today) {
  const match = value.match(/^(?:(?<modifier>next|this)\s+)?(?<weekday>[A-Za-z]+)$/u);

  if (!match || !weekdayIndexes.has(match.groups.weekday.toLowerCase())) {
    return null;
  }

  const requestedWeekday = weekdayIndexes.get(match.groups.weekday.toLowerCase());
  const todayWeekday = today.getDay();
  let daysAhead = (requestedWeekday - todayWeekday + 7) % 7;

  if (match.groups.modifier === 'next' && daysAhead === 0) {
    daysAhead = 7;
  }

  return formatDateArgument(dateWithOffset(today, daysAhead));
}

export function parseDateArgument(value, options = {}) {
  const today = localDateAtNoon(options.today ?? new Date());
  const normalizedValue = value.trim().toLowerCase().replace(/\s+/gu, ' ');

  if (normalizedValue.length === 0) {
    return null;
  }

  if (normalizedValue === 'today') {
    return formatDateArgument(today);
  }

  if (normalizedValue === 'tomorrow') {
    return formatDateArgument(dateWithOffset(today, 1));
  }

  if (normalizedValue === 'yesterday') {
    return formatDateArgument(dateWithOffset(today, -1));
  }

  const relativeMatch = normalizedValue.match(/^in (?<amount>[1-9]\d*) (?<unit>days?|weeks?)$/u);

  if (relativeMatch) {
    const amount = Number(relativeMatch.groups.amount);
    const days = relativeMatch.groups.unit.startsWith('week') ? amount * 7 : amount;

    return formatDateArgument(dateWithOffset(today, days));
  }

  return validIsoDate(normalizedValue)
    ?? dateFromMonthDayYear(normalizedValue)
    ?? nextWeekdayDate(normalizedValue, today);
}
