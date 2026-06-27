import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  factMarkdownFromCell,
  importPeopleCsv,
  parseCsv,
  personFactsFromRow
} from '../scripts/import-people.js';

const csvHeader = 'Name,Company,Email,Left Ulta,Location,Manager,Met?,Organization,Projects,Role';

test('parses CSV fields with commas and quotes', () => {
  assert.deepEqual(
    parseCsv(`${csvHeader}\n"Smith, Jane",Ulta,jane@example.com,No,Chicago,"Boss ""B"" (https://example.com/boss)",1:1,EA,"Project A (https://example.com/a), Project B (https://example.com/b)",Architect\n`),
    [{
      Name: 'Smith, Jane',
      Company: 'Ulta',
      Email: 'jane@example.com',
      'Left Ulta': 'No',
      Location: 'Chicago',
      Manager: 'Boss "B" (https://example.com/boss)',
      'Met?': '1:1',
      Organization: 'EA',
      Projects: 'Project A (https://example.com/a), Project B (https://example.com/b)',
      Role: 'Architect'
    }]
  );
});

test('builds a source-traceable fact from a Notion export cell', () => {
  assert.equal(
    factMarkdownFromCell({
      Name: 'Jane Smith',
      Manager: 'Steve Ma (https://example.com/steve)'
    }, 'Manager', {
      id: '11111111-1111-4111-8111-111111111111',
      sourceFile: '/tmp/collaborators.csv',
      sourceRow: 12
    }),
    [
      '---',
      'title: "Manager: Steve Ma"',
      'type: manager',
      'id: 11111111-1111-4111-8111-111111111111',
      'source: "Notion Collaborators export"',
      'sourceFile: "collaborators.csv"',
      'sourceRow: 12',
      'sourceColumn: Manager',
      'sourceValue: "Steve Ma (https://example.com/steve)"',
      'relatedContexts: ["people/steve-ma"]',
      '---',
      '',
      '[Steve Ma](/people/steve-ma)',
      ''
    ].join('\n')
  );
});

test('builds manager relations when Notion labels contain parentheses', () => {
  assert.equal(
    factMarkdownFromCell({
      Name: 'Jane Smith',
      Manager: 'Michael (Mike) Sisto (https://example.com/mike)'
    }, 'Manager', {
      id: '11111111-1111-4111-8111-111111111111',
      sourceFile: '/tmp/collaborators.csv',
      sourceRow: 12
    }),
    [
      '---',
      'title: "Manager: Michael (Mike) Sisto"',
      'type: manager',
      'id: 11111111-1111-4111-8111-111111111111',
      'source: "Notion Collaborators export"',
      'sourceFile: "collaborators.csv"',
      'sourceRow: 12',
      'sourceColumn: Manager',
      'sourceValue: "Michael (Mike) Sisto (https://example.com/mike)"',
      'relatedContexts: ["people/michael-mike-sisto"]',
      '---',
      '',
      '[Michael (Mike) Sisto](/people/michael-mike-sisto)',
      ''
    ].join('\n')
  );
});

test('builds one fact per importable person metadata value', () => {
  assert.deepEqual(
    personFactsFromRow({
      Name: 'Jane Smith',
      Company: '',
      Email: 'jane@example.com',
      'Left Ulta': 'No',
      Location: 'Chicago',
      Manager: '',
      'Met?': '1:1, In Person',
      Organization: '',
      Projects: '',
      Role: 'Architect'
    }, {
      sourceFile: '/tmp/collaborators.csv',
      sourceRow: 2
    }).map((fact) => ({
      column: fact.column,
      filename: fact.filename
    })),
    [
      { column: 'Email', filename: 'email.md' },
      { column: 'Location', filename: 'location.md' },
      { column: 'Met?', filename: 'met-1-1.md' },
      { column: 'Met?', filename: 'met-in-person.md' },
      { column: 'Role', filename: 'role.md' }
    ]
  );
});

test('records split met values with the original source cell value', () => {
  assert.equal(
    personFactsFromRow({
      Name: 'Jane Smith',
      'Met?': '1:1, In Person'
    }, {
      id: '11111111-1111-4111-8111-111111111111',
      sourceFile: '/tmp/collaborators.csv',
      sourceRow: 2
    }).find((fact) => fact.filename === 'met-in-person.md').markdown,
    [
      '---',
      'title: "Met?: In Person"',
      'type: met',
      'id: 11111111-1111-4111-8111-111111111111',
      'source: "Notion Collaborators export"',
      'sourceFile: "collaborators.csv"',
      'sourceRow: 2',
      'sourceColumn: "Met?"',
      'sourceValue: "In Person"',
      'sourceCellValue: "1:1, In Person"',
      '---',
      '',
      'In Person',
      ''
    ].join('\n')
  );
});

test('imports people as contexts containing source-cell facts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-import-people-'));
  const csvPath = path.join(directory, 'people.csv');

  try {
    await writeFile(
      csvPath,
      [
        csvHeader,
        'Jane Smith,Ulta,jane@example.com,No,Chicago,Steve Ma (https://example.com/steve),1:1,EA,Project A (https://example.com/a),Architect',
        'Steve Ma,,,,,,,,,'
      ].join('\n')
    );

    assert.deepEqual(
      await importPeopleCsv(csvPath, { rootDirectory: path.join(directory, 'notes') }),
      {
        facts: 8,
        people: 2,
        peopleDirectory: path.join(directory, 'notes', 'people')
      }
    );
    assert.deepEqual(
      (await readdir(path.join(directory, 'notes', 'people'))).sort(),
      ['jane-smith', 'steve-ma']
    );
    assert.deepEqual(
      (await readdir(path.join(directory, 'notes', 'people', 'jane-smith'))).sort(),
      [
        'company.md',
        'email.md',
        'location.md',
        'manager.md',
        'met-1-1.md',
        'organization.md',
        'projects.md',
        'role.md'
      ]
    );
    assert.match(
      await readFile(path.join(directory, 'notes', 'people', 'jane-smith', 'location.md'), 'utf8'),
      /^---\ntitle: "Location: Chicago"\ntype: location\nid: [0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\nsource: "Notion Collaborators export"\nsourceFile: "people.csv"\nsourceRow: 2\nsourceColumn: Location\nsourceValue: Chicago\n---\n\nChicago\n$/u
    );
    assert.match(
      await readFile(path.join(directory, 'notes', 'people', 'jane-smith', 'manager.md'), 'utf8'),
      /^---\ntitle: "Manager: Steve Ma"\ntype: manager\nid: [0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\nsource: "Notion Collaborators export"\nsourceFile: "people.csv"\nsourceRow: 2\nsourceColumn: Manager\nsourceValue: "Steve Ma \(https:\/\/example\.com\/steve\)"\nrelatedContexts: \["people\/steve-ma"\]\n---\n\n\[Steve Ma\]\(\/people\/steve-ma\)\n$/u
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
