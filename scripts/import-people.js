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
  ['Left Ulta', 'left-ulta'],
  ['Location', 'location'],
  ['Manager', 'manager'],
  ['Met?', 'met'],
  ['Organization', 'organization'],
  ['Projects', 'projects'],
  ['Role', 'role']
]);

const sourceName = 'Notion Collaborators export';

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
  return [...value.matchAll(/(?:^|,\s*)(.*?)\s*\((https?:\/\/[^)]+)\)/gu)]
    .map((match) => ({
      label: match[1].trim(),
      url: match[2].trim()
    }));
}

function firstNotionLabel(value) {
  return notionLinks(value).at(0)?.label ?? value.replace(/\s*\(https?:\/\/[^)]+\)\s*/gu, '').trim();
}

function markdownValue(value) {
  const links = notionLinks(value);

  if (links.length === 0) {
    return value.trim();
  }

  return links.map((link) => `[${link.label}](${link.url})`).join(', ');
}

function factBodyForCell(column, value) {
  const links = notionLinks(value);

  if (column === 'Manager') {
    const managerName = firstNotionLabel(value);

    return `[${managerName}](/people/${slugifyTitle(managerName)})`;
  }

  if (column === 'Projects' && links.length > 1) {
    return links.map((link) => `- [${link.label}](${link.url})`).join('\n');
  }

  return markdownValue(value);
}

function factTitleValueForCell(column, value) {
  if (column === 'Manager') {
    return firstNotionLabel(value);
  }

  return value.trim();
}

export function factMarkdownFromCell(row, column, options = {}) {
  const personName = row.Name?.trim();
  const value = row[column]?.trim();
  const factType = propertyNames.get(column);

  if (!personName) {
    throw new Error('person row is missing Name');
  }

  if (!factType) {
    throw new Error(`unsupported people column ${column}`);
  }

  if (!value) {
    throw new Error(`person row is missing ${column}`);
  }

  const sourceFile = options.sourceFile ? path.basename(options.sourceFile) : '';
  const properties = {
    source: sourceName,
    ...(sourceFile ? { sourceFile } : {}),
    ...(options.sourceRow ? { sourceRow: String(options.sourceRow) } : {}),
    sourceColumn: column,
    sourceValue: value
  };
  const relations = [];

  if (column === 'Manager') {
    relations.push(`people/${slugifyTitle(firstNotionLabel(value))}`);
  }

  return buildFactMarkdown(`${column}: ${factTitleValueForCell(column, value)}`, {
    body: factBodyForCell(column, value),
    properties,
    relations,
    type: factType
  });
}

export function personFactsFromRow(row, options = {}) {
  const title = row.Name?.trim();

  if (!title) {
    throw new Error('person row is missing Name');
  }

  return columns
    .filter((column) => row[column]?.trim())
    .map((column) => ({
      column,
      filename: `${propertyNames.get(column)}.md`,
      markdown: factMarkdownFromCell(row, column, options)
    }));
}

export async function importPeopleCsv(csvPath, options = {}) {
  if (!csvPath) {
    throw new Error('usage: npm run import:people -- <csv-path> [root-directory]');
  }

  const rootDirectory = path.resolve(options.rootDirectory ?? 'notes');
  const peopleDirectory = path.join(rootDirectory, 'people');
  const rows = parseCsv(await readFile(csvPath, 'utf8'));
  let people = 0;
  let facts = 0;
  const personContextIds = new Set();

  for (const row of rows) {
    const personName = row.Name?.trim();

    if (personName) {
      personContextIds.add(slugifyTitle(personName));
    }

    const manager = row.Manager?.trim();

    if (manager) {
      personContextIds.add(slugifyTitle(firstNotionLabel(manager)));
    }
  }

  await mkdir(peopleDirectory, { recursive: true });

  for (const personContextId of personContextIds) {
    await mkdir(path.join(peopleDirectory, personContextId), { recursive: true });
  }

  for (const [rowIndex, row] of rows.entries()) {
    const title = row.Name?.trim();

    if (!title) {
      continue;
    }

    const personDirectory = path.join(peopleDirectory, slugifyTitle(title));
    people += 1;

    for (const fact of personFactsFromRow(row, {
      sourceFile: csvPath,
      sourceRow: rowIndex + 2
    })) {
      await writeFile(path.join(personDirectory, fact.filename), fact.markdown);
      facts += 1;
    }
  }

  return {
    facts,
    people,
    peopleDirectory,
  };
}

async function main() {
  const [_node, _script, csvPath, rootDirectory] = process.argv;
  const result = await importPeopleCsv(csvPath, { rootDirectory });

  console.log(`Imported ${result.people} people and ${result.facts} facts into ${result.peopleDirectory}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
