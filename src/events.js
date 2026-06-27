import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { formatDateArgument } from './dates.js';

const eventDirectory = path.join('.gatherbrain', 'events');

export function eventLogFilePath(rootDirectory, date) {
  return path.join(rootDirectory, eventDirectory, `${date}.tsv`);
}

export async function logEvent(state, event, metadata = {}) {
  if (!state?.rootDirectory || !event) {
    return;
  }

  const now = state.now ? state.now() : new Date();
  const timestamp = now.toISOString();
  const date = formatDateArgument(now);
  const line = [
    timestamp,
    event,
    JSON.stringify(metadata)
  ].join('\t');

  await mkdir(path.join(state.rootDirectory, eventDirectory), { recursive: true });
  await appendFile(eventLogFilePath(state.rootDirectory, date), `${line}\n`);
}
