import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { formatDateArgument } from './dates.js';

const timeboxDirectory = path.join('.gatherbrain', 'timeboxes');
const minutesPerDay = 24 * 60;
const plannerRowMinutes = 15;
const defaultDurationMinutes = 30;

export function timeboxDate(date = new Date()) {
  return formatDateArgument(date);
}

export function timeboxFilePath(rootDirectory, date) {
  return path.join(rootDirectory, timeboxDirectory, `${date}.tsv`);
}

function normalizeContext(context) {
  const trimmedContext = context.trim();

  if (trimmedContext === '/') {
    return '/';
  }

  return `/${trimmedContext.replace(/^\/+/u, '').replace(/\/+$/u, '')}`;
}

function parseMeridiemTime(value) {
  const match = value.match(/^(?<hour>\d{1,2})(?::(?<minute>\d{2}))?(?<meridiem>am|pm)$/iu);

  if (!match) {
    return null;
  }

  let hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute ?? 0);
  const meridiem = match.groups.meridiem.toLowerCase();

  if (hour < 1 || hour > 12 || minute > 59) {
    return null;
  }

  if (meridiem === 'am') {
    hour = hour === 12 ? 0 : hour;
  } else {
    hour = hour === 12 ? 12 : hour + 12;
  }

  return hour * 60 + minute;
}

export function parseClockTime(value) {
  const trimmedValue = value.trim();
  const meridiemTime = parseMeridiemTime(trimmedValue);

  if (meridiemTime !== null) {
    return meridiemTime;
  }

  const match = trimmedValue.match(/^(?<hour>\d{1,2})(?::(?<minute>\d{2}))?$/u);

  if (!match) {
    return null;
  }

  let hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute ?? 0);

  if (hour > 23 || minute > 59) {
    return null;
  }

  if (hour >= 1 && hour <= 7) {
    hour += 12;
  }

  return hour * 60 + minute;
}

function parseStoredClockTime(value) {
  const match = value.trim().match(/^(?<hour>\d{2}):(?<minute>\d{2})$/u);

  if (!match) {
    return null;
  }

  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);

  if (hour > 23 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
}

export function formatClockTime(minutes) {
  const normalizedMinutes = Math.max(0, Math.min(minutes, minutesPerDay));
  const hour = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseTimeRange(value, options = {}) {
  const durationMinutes = options.durationMinutes ?? defaultDurationMinutes;
  const match = value.trim().match(/^(?<start>[^\s-]+)(?:-(?<end>[^\s-]+))?$/u);

  if (!match) {
    return null;
  }

  const startMinutes = parseClockTime(match.groups.start);

  if (startMinutes === null) {
    return null;
  }

  const endMinutes = match.groups.end
    ? parseClockTime(match.groups.end)
    : startMinutes + durationMinutes;

  if (endMinutes === null || endMinutes <= startMinutes || endMinutes > minutesPerDay) {
    return null;
  }

  return {
    start: formatClockTime(startMinutes),
    end: formatClockTime(endMinutes),
    startMinutes,
    endMinutes,
    isRange: Boolean(match.groups.end)
  };
}

export function parseTimeboxRow(line, index) {
  const columns = line.split('\t');

  if (columns.length !== 3) {
    throw new Error(`invalid timebox row ${index + 1}`);
  }

  const [context, start, end] = columns;
  const startMinutes = parseStoredClockTime(start);
  const endMinutes = parseStoredClockTime(end);

  if (!context || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    throw new Error(`invalid timebox row ${index + 1}`);
  }

  return {
    index,
    context: normalizeContext(context),
    start,
    end,
    startMinutes,
    endMinutes
  };
}

export async function readTimeboxes(rootDirectory, date) {
  let contents;

  try {
    contents = await readFile(timeboxFilePath(rootDirectory, date), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  return contents
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map(parseTimeboxRow);
}

export async function appendTimebox(rootDirectory, options = {}) {
  const context = normalizeContext(options.context ?? '');

  if (context === '/') {
    throw new Error('root context cannot be stored as a timebox');
  }

  await mkdir(path.join(rootDirectory, timeboxDirectory), { recursive: true });
  await appendFile(
    timeboxFilePath(rootDirectory, options.date),
    `${context}\t${options.range.start}\t${options.range.end}\n`
  );

  return {
    context,
    date: options.date,
    start: options.range.start,
    end: options.range.end
  };
}

function timeboxContains(timebox, minutes) {
  return timebox.startMinutes <= minutes && minutes < timebox.endMinutes;
}

function timeboxMatchesRange(timebox, range) {
  return range.isRange
    ? timebox.startMinutes === range.startMinutes && timebox.endMinutes === range.endMinutes
    : timeboxContains(timebox, range.startMinutes);
}

export async function matchingTimeboxes(rootDirectory, options = {}) {
  const context = normalizeContext(options.context ?? '');
  const timeboxes = await readTimeboxes(rootDirectory, options.date);

  if (context === '/') {
    return [];
  }

  return timeboxes.filter((timebox) => (
    timebox.context === context && timeboxMatchesRange(timebox, options.range)
  ));
}

export async function cancelTimebox(rootDirectory, options = {}) {
  const matches = await matchingTimeboxes(rootDirectory, options);

  if (matches.length === 0) {
    return {
      cancelled: [],
      matches
    };
  }

  if (matches.length > 1 && options.index === undefined) {
    return {
      cancelled: [],
      matches
    };
  }

  const cancelledIndex = options.index ?? matches[0].index;
  const timeboxes = await readTimeboxes(rootDirectory, options.date);
  const remaining = timeboxes.filter((timebox) => timebox.index !== cancelledIndex);
  const cancelled = timeboxes.filter((timebox) => timebox.index === cancelledIndex);
  const contents = remaining
    .map((timebox) => `${timebox.context}\t${timebox.start}\t${timebox.end}`)
    .join('\n');

  await writeFile(
    timeboxFilePath(rootDirectory, options.date),
    contents.length > 0 ? `${contents}\n` : ''
  );

  return {
    cancelled,
    matches
  };
}

export function resolveTimeboxContext(timeboxes, minutes) {
  return timeboxes
    .filter((timebox) => timeboxContains(timebox, minutes))
    .at(-1)?.context ?? '/';
}

export async function resolveContextForTime(rootDirectory, options = {}) {
  const date = options.date ?? timeboxDate(options.now ?? new Date());
  const minutes = options.minutes ?? minutesFromDate(options.now ?? new Date());
  const timeboxes = await readTimeboxes(rootDirectory, date);

  return resolveTimeboxContext(timeboxes, minutes);
}

function minutesFromDate(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function durationText(minutes) {
  if (minutes < 60) {
    return `${minutes} minutes free`;
  }

  const hours = minutes / 60;

  return hours === 1 ? '1 hour free' : `${hours} hours free`;
}

export function plannerLinesForDay(timeboxes) {
  const lines = [];
  let previousContext = null;
  let freeBlockEnd = 0;

  for (let minutes = 0; minutes < minutesPerDay; minutes += plannerRowMinutes) {
    const context = resolveTimeboxContext(timeboxes, minutes);
    let label = '';

    if (context !== previousContext) {
      if (context === '/') {
        const nextClaimedMinute = nextContextBoundary(timeboxes, minutes, context);
        freeBlockEnd = nextClaimedMinute;
        label = `[${durationText(nextClaimedMinute - minutes)}]`;
      } else {
        label = context;
      }
    } else if (context === '/' && minutes >= freeBlockEnd) {
      freeBlockEnd = nextContextBoundary(timeboxes, minutes, context);
      label = `[${durationText(freeBlockEnd - minutes)}]`;
    }

    lines.push(label ? `${formatClockTime(minutes)}  ${label}` : formatClockTime(minutes));
    previousContext = context;
  }

  return lines;
}

function nextContextBoundary(timeboxes, startMinutes, context) {
  for (let minutes = startMinutes + plannerRowMinutes; minutes < minutesPerDay; minutes += plannerRowMinutes) {
    if (resolveTimeboxContext(timeboxes, minutes) !== context) {
      return minutes;
    }
  }

  return minutesPerDay;
}

export async function plannerLines(rootDirectory, date) {
  return plannerLinesForDay(await readTimeboxes(rootDirectory, date));
}

export async function contextsOverlappingTime(rootDirectory, options = {}) {
  const timeboxes = await readTimeboxes(rootDirectory, options.date);
  const contexts = timeboxes
    .filter((timebox) => rangesOverlap(timebox, options.range))
    .map((timebox) => timebox.context);

  return [...new Set(contexts)];
}

function rangesOverlap(timebox, range) {
  const rangeEnd = range.isRange ? range.endMinutes : range.startMinutes + 1;

  return timebox.startMinutes < rangeEnd && range.startMinutes < timebox.endMinutes;
}
