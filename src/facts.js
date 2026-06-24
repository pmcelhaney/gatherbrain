import { access, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pad = (value, width = 2) => String(value).padStart(width, '0');
const factTypePattern = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const trashDirectoryName = '.trash';
const relatedContextsField = 'relatedContexts';

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

export function slugifyTitle(title) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/['"]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

  return slug.length > 0 ? slug : 'fact';
}

export function buildFactMarkdown(title, options = {}) {
  const {
    body = '',
    type = 'fact'
  } = options;

  return [
    '---',
    `title: ${quoteFrontMatterScalar(title)}`,
    `type: ${quoteFrontMatterScalar(type)}`,
    '---',
    '',
    body,
    ''
  ].join('\n');
}

export function markdownWithContextLinks(text, options = {}) {
  const { contextLinks = [] } = options;

  return contextLinks.reduce((nextText, contextLink) => {
    const mentionPattern = new RegExp(`(^|\\s)@${escapeRegExp(contextLink.folder)}(?=$|\\s|[.,;:!?])`, 'gu');

    return nextText.replace(
      mentionPattern,
      `$1[${contextLink.folder}](/${contextLink.name})`
    );
  }, text);
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&');
}

function matchFrontMatter(markdown) {
  return markdown.match(/^---\r?\n(?<frontMatter>[\s\S]*?)\r?\n---\r?\n?/u);
}

function unquoteFrontMatterScalar(value) {
  const trimmedValue = value.trim();

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"'))
    || (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue
      .slice(1, -1)
      .replaceAll('\\"', '"')
      .replaceAll('\\\\', '\\');
  }

  return trimmedValue;
}

function frontMatterScalar(frontMatter, key) {
  return frontMatter.match(new RegExp(`^${escapeRegExp(key)}:\\s*(?<value>.+?)\\s*$`, 'mu'))
    ?.groups.value;
}

function quoteFrontMatterScalar(value) {
  const stringValue = String(value);

  if (/^[A-Za-z0-9_-]+$/u.test(stringValue)) {
    return stringValue;
  }

  return quoteFrontMatterString(stringValue);
}

function markdownFrontMatter(markdown) {
  return matchFrontMatter(markdown)?.groups.frontMatter ?? '';
}

export function factTitleFromMarkdown(markdown) {
  const title = frontMatterScalar(markdownFrontMatter(markdown), 'title');

  return title ? unquoteFrontMatterScalar(title) : null;
}

export function factTypeFromMarkdown(markdown) {
  const frontMatter = markdownFrontMatter(markdown);

  if (!frontMatter) {
    return null;
  }

  const type = frontMatterScalar(frontMatter, 'type');

  return type ? unquoteFrontMatterScalar(type) : null;
}

export function factTextFromMarkdown(markdown) {
  if (!markdown.startsWith('---')) {
    return markdown.trimEnd();
  }

  const frontMatter = matchFrontMatter(markdown);

  if (!frontMatter) {
    return markdown.trimEnd();
  }

  return markdown
    .slice(frontMatter[0].length)
    .replace(/^\r?\n/u, '')
    .trimEnd();
}

export function markdownWithFactType(markdown, type) {
  if (!factTypePattern.test(type)) {
    throw new Error('type must start with a letter and contain only letters, numbers, _, or -');
  }

  const frontMatterMatch = matchFrontMatter(markdown);

  if (!frontMatterMatch) {
    return `---\ntype: ${type}\n---\n\n${markdown}`;
  }

  const frontMatter = frontMatterMatch.groups.frontMatter;
  const nextFrontMatter = /^type:\s*.*$/mu.test(frontMatter)
    ? frontMatter.replace(/^type:\s*.*$/mu, `type: ${type}`)
    : `type: ${type}\n${frontMatter}`;
  const body = markdown.slice(frontMatterMatch[0].length);

  return `---\n${nextFrontMatter.trimEnd()}\n---\n${body}`;
}

function quoteFrontMatterString(value) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function frontMatterStringList(frontMatter, key) {
  const inlineValues = frontMatter.match(new RegExp(`^${escapeRegExp(key)}:\\s*\\[(?<values>.*?)\\]\\s*$`, 'mu'))
    ?.groups.values;

  if (inlineValues !== undefined) {
    return [...inlineValues.matchAll(/"(?<value>(?:\\.|[^"\\])*)"|'(?<singleValue>(?:\\.|[^'\\])*)'|(?<bareValue>[^,\s][^,]*)/gu)]
      .map((match) => match.groups.value ?? match.groups.singleValue ?? match.groups.bareValue)
      .map((value) => unquoteFrontMatterScalar(value.trim()))
      .filter((value) => value.length > 0);
  }

  const blockValues = frontMatter.match(new RegExp(`^${escapeRegExp(key)}:\\s*\\r?\\n(?<values>(?:\\s+-\\s+.+\\r?\\n?)*)`, 'mu'))
    ?.groups.values;

  if (!blockValues) {
    return [];
  }

  return blockValues
    .split(/\r?\n/u)
    .map((line) => line.match(/^\s+-\s+(?<value>.+?)\s*$/u)?.groups.value)
    .filter((value) => value !== undefined)
    .map(unquoteFrontMatterScalar);
}

export function factRelationsFromMarkdown(markdown) {
  const relations = frontMatterStringList(markdownFrontMatter(markdown), relatedContextsField);

  return [...new Set(relations)];
}

export function markdownWithRelation(markdown, relation) {
  const frontMatterMatch = matchFrontMatter(markdown);

  if (!frontMatterMatch) {
    return [
      '---',
      `${relatedContextsField}: [${quoteFrontMatterString(relation)}]`,
      '---',
      '',
      markdown
    ].join('\n');
  }

  const frontMatter = frontMatterMatch.groups.frontMatter;
  const relations = factRelationsFromMarkdown(markdown);
  const nextRelations = relations.includes(relation)
    ? relations
    : [...relations, relation];
  const relationLine = `${relatedContextsField}: [${nextRelations.map(quoteFrontMatterString).join(', ')}]`;
  const relationPattern = new RegExp(`^${relatedContextsField}:\\s*\\[.*?\\]\\s*$`, 'mu');
  const nextFrontMatter = relationPattern.test(frontMatter)
    ? frontMatter.replace(relationPattern, relationLine)
    : `${frontMatter.trimEnd()}\n${relationLine}`;
  const body = markdown.slice(frontMatterMatch[0].length);

  return `---\n${nextFrontMatter.trimEnd()}\n---\n${body}`;
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

export async function listFacts(options = {}) {
  const { notesDirectory } = options;

  if (!notesDirectory) {
    throw new Error('notesDirectory is required');
  }

  const filenames = [];

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

    const sortedEntries = entries.toSorted((left, right) => left.name.localeCompare(right.name));

    await Promise.all(
      sortedEntries.map(async (entry) => {
        const relativePath = relativeDirectory
          ? path.join(relativeDirectory, entry.name)
          : entry.name;
        const filePath = path.join(directory, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await visit(filePath, relativePath);
          return;
        }

        if (entry.isFile() && path.extname(entry.name) === '.md') {
          filenames.push(relativePath);
        }
      })
    );
  }

  await visit(notesDirectory);

  return Promise.all(
    filenames
      .sort((left, right) => {
        const filenameComparison = path.basename(left).localeCompare(path.basename(right));

        return filenameComparison === 0
          ? left.localeCompare(right)
          : filenameComparison;
      })
      .map(async (filename) => {
        const filePath = path.join(notesDirectory, filename);
        const markdown = await readFile(filePath, 'utf8');
        const relations = factRelationsFromMarkdown(markdown);
        const title = factTitleFromMarkdown(markdown) ?? path.basename(filename, '.md');
        const body = factTextFromMarkdown(markdown);

        return {
          filename,
          path: filePath,
          ...(relations.length > 0 ? { relations } : {}),
          title,
          type: factTypeFromMarkdown(markdown) ?? 'note',
          text: body.length > 0 ? body : title
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
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
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

export async function factAtIndex(options = {}) {
  const {
    index,
    notesDirectory
  } = options;

  if (!Number.isInteger(index) || index < 1) {
    throw new Error('item number must be a positive integer');
  }

  if (!notesDirectory) {
    throw new Error('notesDirectory is required');
  }

  const facts = await listFacts({ notesDirectory });
  const fact = facts[index - 1];

  if (!fact) {
    throw new Error(`item ${index} does not exist`);
  }

  return fact;
}

export async function updateFactTypeAtIndex(options = {}) {
  const {
    index,
    notesDirectory,
    type
  } = options;

  if (!type) {
    throw new Error('type is required');
  }

  const fact = await factAtIndex({ index, notesDirectory });
  await updateFactType(fact.path, type);

  return {
    ...fact,
    type
  };
}

export async function updateFactType(filePath, type) {
  const markdown = await readFile(filePath, 'utf8');
  await writeFile(filePath, markdownWithFactType(markdown, type));
}

export async function addFactRelation(filePath, relation) {
  const markdown = await readFile(filePath, 'utf8');
  await writeFile(filePath, markdownWithRelation(markdown, relation));
}

export async function deleteFact(filePath) {
  const trashDirectory = path.join(path.dirname(filePath), trashDirectoryName);
  await mkdir(trashDirectory, { recursive: true });

  const extension = path.extname(filePath);
  const basename = path.basename(filePath, extension);
  let destination = path.join(trashDirectory, path.basename(filePath));

  for (let attempt = 1;; attempt += 1) {
    try {
      await access(destination);
      destination = path.join(trashDirectory, `${basename}-${attempt}${extension}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      await rename(filePath, destination);
      return destination;
    }
  }
}

export async function saveFact(text, options = {}) {
  const {
    title = text,
    type = 'fact',
    notesDirectory,
  } = options;

  if (!notesDirectory) {
    throw new Error('notesDirectory is required');
  }

  await mkdir(notesDirectory, { recursive: true });

  const slug = slugifyTitle(title);

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const filename = `${attempt === 0 ? slug : `${slug}-${attempt + 1}`}.md`;
    const filePath = path.join(notesDirectory, filename);

    try {
      await writeFile(filePath, buildFactMarkdown(title, { type }), { flag: 'wx' });
      return filePath;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  throw new Error('Could not create a unique slug filename');
}
