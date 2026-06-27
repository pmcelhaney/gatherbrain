import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { formatDateArgument } from './dates.js';

const timeboxDirectory = path.join('.gatherbrain', 'timeboxes');
const minutesPerDay = 24 * 60;
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

export function parseStoredClockTime(value) {
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

export function formatDisplayClockTime(minutes, options = {}) {
  const normalizedMinutes = Math.max(0, Math.min(minutes, minutesPerDay));
  const hour = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;
  const displayHour = hour % 12 || 12;
  const paddedHour = options.padHour && displayHour < 10
    ? ` ${displayHour}`
    : String(displayHour);

  return `${paddedHour}:${String(minute).padStart(2, '0')}`;
}

export function formatDisplayTimeRange(timebox) {
  return `${formatDisplayClockTime(timebox.startMinutes)}-${formatDisplayClockTime(timebox.endMinutes)}`;
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
    end: options.range.end,
    startMinutes: options.range.startMinutes,
    endMinutes: options.range.endMinutes
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
  const minutes = options.minutes ?? plannerMinutesFromDate(options.now ?? new Date());
  const timeboxes = await readTimeboxes(rootDirectory, date);

  return resolveTimeboxContext(timeboxes, minutes);
}

export function plannerMinutesFromDate(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function compactDurationText(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}m`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

function plannerDisplayRange(timeboxes, options = {}) {
  const workdayStartMinutes = options.workday?.startMinutes ?? 8 * 60;
  const workdayEndMinutes = options.workday?.endMinutes ?? 18 * 60;
  const earliestTimeboxStart = Math.min(workdayStartMinutes, ...timeboxes.map((timebox) => timebox.startMinutes));
  const latestTimeboxEnd = Math.max(workdayEndMinutes, ...timeboxes.map((timebox) => timebox.endMinutes));

  return {
    startMinutes: earliestTimeboxStart,
    endMinutes: latestTimeboxEnd
  };
}

export function plannerLinesForDay(timeboxes, options = {}) {
  const { startMinutes, endMinutes } = plannerDisplayRange(timeboxes, options);
  const currentMinutes = Number.isInteger(options.currentMinutes)
    ? options.currentMinutes
    : null;
  const blocks = plannerBlocksForDay(timeboxes, options);

  return renderPlannerBlocks(blocks, {
    currentMinutes,
    targetRows: options.targetRows
  });
}

export function plannerBlocksForDay(timeboxes, options = {}) {
  const { startMinutes, endMinutes } = plannerDisplayRange(timeboxes, options);

  return resolvedPlannerBlocks(timeboxes, startMinutes, endMinutes);
}

export function renderPlannerBlocks(blocks, options = {}) {
  const currentMinutes = Number.isInteger(options.currentMinutes)
    ? options.currentMinutes
    : null;
  const extraRows = plannerExtraRowsForBlocks(blocks, currentMinutes, options.targetRows);
  const lines = [];

  for (const [index, block] of blocks.entries()) {
    lines.push(plannerBlockStartLine(block, currentMinutes));
    lines.push(plannerBlockDurationLine(block));

    if (currentMinutes > block.startMinutes && currentMinutes < block.endMinutes) {
      lines.push(plannerCurrentLine(block, currentMinutes));
    }

    for (let count = 0; count < extraRows[index]; count += 1) {
      lines.push(plannerBlockRailLine(block));
    }
  }

  return lines;
}

function plannerExtraRowsForBlocks(blocks, currentMinutes, targetRows) {
  const baseRows = blocks.reduce((count, block) => (
    count + 2 + (currentMinutes > block.startMinutes && currentMinutes < block.endMinutes ? 1 : 0)
  ), 0);
  const availableExtraRows = Number.isInteger(targetRows)
    ? Math.max(targetRows - baseRows, 0)
    : 0;

  if (availableExtraRows === 0 || blocks.length === 0) {
    return blocks.map(() => 0);
  }

  const totalMinutes = blocks.reduce((total, block) => total + block.endMinutes - block.startMinutes, 0);

  if (totalMinutes <= 0) {
    return blocks.map(() => 0);
  }

  const allocations = blocks.map((block, index) => {
    const exactRows = ((block.endMinutes - block.startMinutes) / totalMinutes) * availableExtraRows;

    return {
      index,
      rows: Math.floor(exactRows),
      remainder: exactRows % 1
    };
  });
  let remainingRows = availableExtraRows - allocations.reduce((total, allocation) => total + allocation.rows, 0);

  for (const allocation of [...allocations].sort((left, right) => right.remainder - left.remainder)) {
    if (remainingRows <= 0) {
      break;
    }

    allocation.rows += 1;
    remainingRows -= 1;
  }

  return allocations
    .sort((left, right) => left.index - right.index)
    .map((allocation) => allocation.rows);
}

function resolvedPlannerBlocks(timeboxes, startMinutes, endMinutes) {
  const blocks = [];
  const boundaries = plannerBoundaries(timeboxes, startMinutes, endMinutes);

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const blockStartMinutes = boundaries[index];
    const blockEndMinutes = boundaries[index + 1];
    const context = resolveTimeboxContext(timeboxes, blockStartMinutes);

    if (blockEndMinutes <= blockStartMinutes) {
      continue;
    }

    const previousBlock = blocks.at(-1);

    if (previousBlock?.context === context && previousBlock.endMinutes === blockStartMinutes) {
      previousBlock.endMinutes = blockEndMinutes;
      continue;
    }

    blocks.push({
      context,
      startMinutes: blockStartMinutes,
      endMinutes: blockEndMinutes
    });
  }

  return blocks;
}

function plannerBoundaries(timeboxes, startMinutes, endMinutes) {
  const boundaries = new Set([startMinutes, endMinutes]);

  for (const timebox of timeboxes) {
    if (timebox.startMinutes > startMinutes && timebox.startMinutes < endMinutes) {
      boundaries.add(timebox.startMinutes);
    }

    if (timebox.endMinutes > startMinutes && timebox.endMinutes < endMinutes) {
      boundaries.add(timebox.endMinutes);
    }
  }

  return [...boundaries].sort((left, right) => left - right);
}

function plannerBlockStartLine(block, currentMinutes) {
  const hasCurrentMarker = block.startMinutes === currentMinutes;
  const marker = hasCurrentMarker ? '> ' : '  ';
  const node = hasCurrentMarker ? '●' : nodeForPlannerBlock(block);

  return `${marker}${formatDisplayClockTime(block.startMinutes, { padHour: true })}  ${node}  ${labelForPlannerBlock(block)}`;
}

function plannerCurrentLine(block, currentMinutes) {
  return `> ${formatDisplayClockTime(currentMinutes, { padHour: true })}  ${railForPlannerBlock(block)}`;
}

function plannerBlockRailLine(block) {
  return `         ${railForPlannerBlock(block)}`;
}

function plannerBlockDurationLine(block) {
  return `         ${railForPlannerBlock(block)}  ${compactDurationText(block.endMinutes - block.startMinutes)}`;
}

function labelForPlannerBlock(block) {
  return block.context === '/' ? 'free' : block.context;
}

function nodeForPlannerBlock(block) {
  return block.context === '/' ? '◇' : '○';
}

function railForPlannerBlock(block) {
  return block.context === '/' ? '╎' : '│';
}

export async function plannerLines(rootDirectory, date, options = {}) {
  return plannerLinesForDay(await readTimeboxes(rootDirectory, date), options);
}

export async function plannerBlocks(rootDirectory, date, options = {}) {
  return plannerBlocksForDay(await readTimeboxes(rootDirectory, date), options);
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
