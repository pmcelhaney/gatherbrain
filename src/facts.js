import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pad = (value, width = 2) => String(value).padStart(width, '0');

export function timestampForFilename(date = new Date()) {
  const timezoneOffsetMinutes = -date.getTimezoneOffset();
  const timezoneSign = timezoneOffsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(timezoneOffsetMinutes);
  const offsetHours = pad(Math.floor(absoluteOffset / 60));
  const offsetMinutes = pad(absoluteOffset % 60);

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    '-',
    pad(date.getMinutes()),
    '-',
    pad(date.getSeconds()),
    '.',
    pad(date.getMilliseconds(), 3),
    timezoneSign,
    offsetHours,
    '-',
    offsetMinutes
  ].join('');
}

export function buildFactMarkdown(text) {
  return `---\ntype: fact\n---\n\n${text}\n`;
}

export async function saveFact(text, options = {}) {
  const {
    notesDirectory,
    now = () => new Date()
  } = options;

  if (!notesDirectory) {
    throw new Error('notesDirectory is required');
  }

  await mkdir(notesDirectory, { recursive: true });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const filename = `${timestampForFilename(now())}.md`;
    const filePath = path.join(notesDirectory, filename);

    try {
      await writeFile(filePath, buildFactMarkdown(text), { flag: 'wx' });
      return filePath;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  throw new Error('Could not create a unique timestamped note filename');
}
