import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  importPeopleCsv,
  parseCsv,
  personMarkdownFromRow
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

test('builds person Markdown from a Notion export row', () => {
  assert.equal(
    personMarkdownFromRow({
      Name: 'Jane Smith',
      Company: 'Ulta',
      Email: 'jane@example.com',
      'Left Ulta': 'No',
      Location: 'Chicago',
      Manager: 'Steve Ma (https://example.com/steve)',
      'Met?': '1:1',
      Organization: 'EA (https://example.com/ea)',
      Projects: 'Project A (https://example.com/a), Project B (https://example.com/b)',
      Role: 'Architect'
    }),
    [
      '---',
      'title: "Jane Smith"',
      'type: person',
      'company: Ulta',
      'email: "jane@example.com"',
      'leftUlta: No',
      'location: Chicago',
      'manager: "Steve Ma (https://example.com/steve)"',
      'met: "1:1"',
      'organization: "EA (https://example.com/ea)"',
      'projects: "Project A (https://example.com/a), Project B (https://example.com/b)"',
      'role: Architect',
      '---',
      '',
      '- Company: Ulta',
      '- Email: jane@example.com',
      '- Left Ulta: No',
      '- Location: Chicago',
      '- Manager: [Steve Ma](https://example.com/steve)',
      '- Met?: 1:1',
      '- Organization: [EA](https://example.com/ea)',
      '- Projects:',
      '  - [Project A](https://example.com/a)',
      '  - [Project B](https://example.com/b)',
      '- Role: Architect',
      ''
    ].join('\n')
  );
});

test('imports people into the people context', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-import-people-'));
  const csvPath = path.join(directory, 'people.csv');

  try {
    await writeFile(
      csvPath,
      `${csvHeader}\nJane Smith,Ulta,jane@example.com,No,Chicago,Steve Ma (https://example.com/steve),1:1,EA,Project A (https://example.com/a),Architect\n`
    );

    assert.deepEqual(
      await importPeopleCsv(csvPath, { rootDirectory: path.join(directory, 'notes') }),
      {
        peopleDirectory: path.join(directory, 'notes', 'people'),
        written: 1
      }
    );
    assert.equal(
      await readFile(path.join(directory, 'notes', 'people', 'jane-smith.md'), 'utf8'),
      personMarkdownFromRow({
        Name: 'Jane Smith',
        Company: 'Ulta',
        Email: 'jane@example.com',
        'Left Ulta': 'No',
        Location: 'Chicago',
        Manager: 'Steve Ma (https://example.com/steve)',
        'Met?': '1:1',
        Organization: 'EA',
        Projects: 'Project A (https://example.com/a)',
        Role: 'Architect'
      })
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
