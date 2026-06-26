#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  buildFactMarkdown,
  slugifyTitle
} from '../src/facts.js';

const columns = [
  'Company',
  'Email',
  'Left Ulta',
  'Location',
  'Manager',
  'Met?',
  'Organization',
  'Projects',
  'Role'
];

const propertyNames = new Map([
  ['Company', 'company'],
  ['Email', 'email'],
  ['Left Ulta', 'leftUlta'],
  ['Location', 'location'],
  ['Manager', 'manager'],
  ['Met?', 'met'],
  ['Organization', 'organization'],
  ['Projects', 'projects'],
  ['Role', 'role']
]);

function trimByteOrderMark(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }

      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (character !== '\r') {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header, index) => (index === 0 ? trimByteOrderMark(header) : header));

  return rows.slice(1)
    .filter((values) => values.some((value) => value.trim().length > 0))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function notionLinks(value) {
  return [...value.matchAll(/([^,()]+?)\s*\((https?:\/\/[^)]+)\)/gu)]
    .map((match) => ({
      label: match[1].trim(),
      url: match[2].trim()
    }));
}

function markdownValue(value) {
  const links = notionLinks(value);

  if (links.length === 0) {
    return value.trim();
  }

  return links.map((link) => `[${link.label}](${link.url})`).join(', ');
}

function bodyLinesForRow(row) {
  const lines = [];

  for (const column of columns) {
    const value = row[column]?.trim();

    if (!value) {
      continue;
    }

    const links = notionLinks(value);

    if (column === 'Projects' && links.length > 1) {
      lines.push(`- ${column}:`);
      lines.push(...links.map((link) => `  - [${link.label}](${link.url})`));
      continue;
    }

    lines.push(`- ${column}: ${markdownValue(value)}`);
  }

  return lines;
}

export function personMarkdownFromRow(row) {
  const title = row.Name?.trim();

  if (!title) {
    throw new Error('person row is missing Name');
  }

  const properties = {};

  for (const column of columns) {
    const value = row[column]?.trim();

    if (value) {
      properties[propertyNames.get(column)] = value;
    }
  }

  return buildFactMarkdown(title, {
    body: bodyLinesForRow(row).join('\n'),
    properties,
    type: 'person'
  });
}

export async function importPeopleCsv(csvPath, options = {}) {
  if (!csvPath) {
    throw new Error('usage: npm run import:people -- <csv-path> [root-directory]');
  }

  const rootDirectory = path.resolve(options.rootDirectory ?? 'notes');
  const peopleDirectory = path.join(rootDirectory, 'people');
  const rows = parseCsv(await readFile(csvPath, 'utf8'));
  let written = 0;

  await mkdir(peopleDirectory, { recursive: true });

  for (const row of rows) {
    const title = row.Name?.trim();

    if (!title) {
      continue;
    }

    await writeFile(
      path.join(peopleDirectory, `${slugifyTitle(title)}.md`),
      personMarkdownFromRow(row)
    );
    written += 1;
  }

  return {
    peopleDirectory,
    written
  };
}

async function main() {
  const [_node, _script, csvPath, rootDirectory] = process.argv;
  const result = await importPeopleCsv(csvPath, { rootDirectory });

  console.log(`Imported ${result.written} people into ${result.peopleDirectory}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
