import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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

export function factTextFromMarkdown(markdown) {
  if (!markdown.startsWith('---')) {
    return markdown.trimEnd();
  }

  const frontMatter = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u);

  if (!frontMatter) {
    return markdown.trimEnd();
  }

  return markdown
    .slice(frontMatter[0].length)
    .replace(/^\r?\n/u, '')
    .trimEnd();
}

export function resolveContextDirectory(contextName, options = {}) {
  const { notesDirectory } = options;

  if (!notesDirectory) {
    throw new Error('notesDirectory is required');
  }

  const trimmedContextName = contextName.trim();

  if (trimmedContextName.length === 0) {
    throw new Error('context name is required');
  }

  if (path.isAbsolute(trimmedContextName)) {
    throw new Error('context name must be relative');
  }

  const notesRoot = path.resolve(notesDirectory);
  const contextDirectory = path.resolve(notesRoot, trimmedContextName);
  const relativeContextPath = path.relative(notesRoot, contextDirectory);

  if (
    relativeContextPath.length === 0
    || relativeContextPath === '..'
    || relativeContextPath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeContextPath)
  ) {
    throw new Error('context must be a folder inside notesDirectory');
  }

  return contextDirectory;
}

export async function ensureContextDirectory(contextName, options = {}) {
  const contextDirectory = resolveContextDirectory(contextName, options);
  await mkdir(contextDirectory, { recursive: true });
  return contextDirectory;
}

export async function listFacts(options = {}) {
  const { notesDirectory } = options;

  if (!notesDirectory) {
    throw new Error('notesDirectory is required');
  }

  let entries;

  try {
    entries = await readdir(notesDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const filenames = entries
    .filter((entry) => entry.isFile() && path.extname(entry.name) === '.md')
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    filenames.map(async (filename) => {
      const filePath = path.join(notesDirectory, filename);
      const markdown = await readFile(filePath, 'utf8');

      return {
        filename,
        path: filePath,
        text: factTextFromMarkdown(markdown)
      };
    })
  );
}

export async function listContextDirectories(options = {}) {
  const { notesDirectory } = options;

  if (!notesDirectory) {
    throw new Error('notesDirectory is required');
  }

  const contexts = [];

  async function visit(directory, relativeDirectory = '') {
    let entries;

    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }

      throw error;
    }

    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    await Promise.all(
      directories.map(async (directoryName) => {
        const relativeContext = relativeDirectory
          ? path.join(relativeDirectory, directoryName)
          : directoryName;
        const contextName = relativeContext.split(path.sep).join('/');

        contexts.push(contextName);
        await visit(path.join(directory, directoryName), relativeContext);
      })
    );
  }

  await visit(notesDirectory);
  return contexts.sort();
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
