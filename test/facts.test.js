import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFactMarkdown,
  factAtIndex,
  factRelationsFromMarkdown,
  factTypeFromMarkdown,
  factTextFromMarkdown,
  listContextDirectories,
  listFacts,
  markdownWithContextLinks,
  markdownWithRelation,
  markdownWithFactType,
  resolveContextDirectory,
  saveFact,
  timestampForFilename,
  updateFactTypeAtIndex
} from '../src/facts.js';

test('builds fact Markdown with the requested front matter', () => {
  assert.equal(
    buildFactMarkdown('The sky is blue.'),
    '---\ntype: fact\n---\n\nThe sky is blue.\n'
  );
});

test('extracts fact text from Markdown front matter', () => {
  assert.equal(
    factTextFromMarkdown('---\ntype: fact\n---\n\nThe sky is blue.\n'),
    'The sky is blue.'
  );
});

test('extracts fact type from Markdown front matter', () => {
  assert.equal(
    factTypeFromMarkdown('---\ntype: task\n---\n\nThe sky is blue.\n'),
    'task'
  );
});

test('extracts fact relations from Markdown front matter', () => {
  assert.deepEqual(
    factRelationsFromMarkdown('---\ntype: fact\nrelations: ["/people/Steve Ma"]\n---\n\nThe sky is blue.\n'),
    ['/people/Steve Ma']
  );
});

test('extracts fact relations from Markdown body links', () => {
  assert.deepEqual(
    factRelationsFromMarkdown('---\ntype: fact\n---\n\nTalk to [Steve Ma](/people/Steve Ma).\n'),
    ['/people/Steve Ma']
  );
});

test('deduplicates front matter and Markdown body link relations', () => {
  assert.deepEqual(
    factRelationsFromMarkdown(
      '---\ntype: fact\nrelations: ["/people/Steve Ma"]\n---\n\nTalk to [Steve Ma](/people/Steve Ma).\n'
    ),
    ['/people/Steve Ma']
  );
});

test('converts context mentions to Markdown links', () => {
  assert.equal(
    markdownWithContextLinks('Talk to @Steve Ma.', {
      contextLinks: [{ folder: 'Steve Ma', name: 'people/Steve Ma' }]
    }),
    'Talk to [Steve Ma](/people/Steve Ma).'
  );
});

test('updates fact type in Markdown front matter', () => {
  assert.equal(
    markdownWithFactType('---\ntype: fact\n---\n\nThe sky is blue.\n', 'task'),
    '---\ntype: task\n---\n\nThe sky is blue.\n'
  );
});

test('adds a relation to Markdown front matter', () => {
  assert.equal(
    markdownWithRelation('---\ntype: fact\n---\n\nThe sky is blue.\n', '/people/Steve Ma'),
    '---\ntype: fact\nrelations: ["/people/Steve Ma"]\n---\n\nThe sky is blue.\n'
  );
});

test('appends a relation to Markdown front matter', () => {
  assert.equal(
    markdownWithRelation(
      '---\ntype: fact\nrelations: ["/people/Ada"]\n---\n\nThe sky is blue.\n',
      '/people/Steve Ma'
    ),
    '---\ntype: fact\nrelations: ["/people/Ada", "/people/Steve Ma"]\n---\n\nThe sky is blue.\n'
  );
});

test('rejects invalid fact types', () => {
  assert.throws(
    () => markdownWithFactType(buildFactMarkdown('The sky is blue.'), 'bad:type'),
    /type must start with a letter/
  );
});

test('formats timestamps as filesystem-safe local time', () => {
  const date = new Date(2026, 5, 23, 9, 4, 7, 12);
  const timestamp = timestampForFilename(date);

  assert.match(
    timestamp,
    /^2026-06-23T09-04-07\.012[+-]\d{2}-\d{2}$/
  );
});

test('saves a fact to a timestamp-named Markdown file', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    const savedPath = await saveFact('Captured from the prompt.', {
      notesDirectory: directory,
      now: () => new Date(2026, 5, 23, 9, 4, 7, 12)
    });

    assert.equal(path.extname(savedPath), '.md');
    assert.match(path.basename(savedPath), /^2026-06-23T09-04-07\.012[+-]\d{2}-\d{2}\.md$/);
    assert.equal(
      await readFile(savedPath, 'utf8'),
      '---\ntype: fact\n---\n\nCaptured from the prompt.\n'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('resolves context directories inside the notes directory', () => {
  const notesDirectory = path.join(tmpdir(), 'gatherbrain-notes');
  const contextDirectory = resolveContextDirectory('my-cool-project', {
    notesDirectory
  });

  assert.equal(contextDirectory, path.join(notesDirectory, 'my-cool-project'));
});

test('rejects context directories outside the notes directory', () => {
  const notesDirectory = path.join(tmpdir(), 'gatherbrain-notes');

  assert.throws(
    () => resolveContextDirectory('../outside', { notesDirectory }),
    /context must be a folder inside notesDirectory/
  );
});

test('lists facts in a notes directory', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    await writeFile(
      path.join(directory, '2026-06-23T09-04-07.012-04-00.md'),
      buildFactMarkdown('First fact.')
    );
    await writeFile(
      path.join(directory, '2026-06-23T09-05-07.012-04-00.md'),
      buildFactMarkdown('Second fact.')
    );
    await writeFile(path.join(directory, 'ignored.txt'), 'Not a note.');

    assert.deepEqual(
      await listFacts({ notesDirectory: directory }),
      [
        {
          filename: '2026-06-23T09-04-07.012-04-00.md',
          path: path.join(directory, '2026-06-23T09-04-07.012-04-00.md'),
          type: 'fact',
          text: 'First fact.'
        },
        {
          filename: '2026-06-23T09-05-07.012-04-00.md',
          path: path.join(directory, '2026-06-23T09-05-07.012-04-00.md'),
          type: 'fact',
          text: 'Second fact.'
        }
      ]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('lists facts in nested notes directories', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    await mkdir(path.join(directory, 'project'), { recursive: true });
    await writeFile(
      path.join(directory, '2026-06-23T09-05-07.012-04-00.md'),
      buildFactMarkdown('Second fact.')
    );
    await writeFile(
      path.join(directory, 'project', '2026-06-23T09-04-07.012-04-00.md'),
      buildFactMarkdown('First fact.')
    );

    assert.deepEqual(
      (await listFacts({ notesDirectory: directory })).map((fact) => ({
        filename: fact.filename,
        text: fact.text
      })),
      [
        {
          filename: path.join('project', '2026-06-23T09-04-07.012-04-00.md'),
          text: 'First fact.'
        },
        {
          filename: '2026-06-23T09-05-07.012-04-00.md',
          text: 'Second fact.'
        }
      ]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('lists fact relations', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    await writeFile(
      path.join(directory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\nrelations: ["/people/Steve Ma"]\n---\n\nFirst fact.\n'
    );

    assert.deepEqual(
      (await listFacts({ notesDirectory: directory })).map((fact) => fact.relations),
      [['/people/Steve Ma']]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('lists fact relations from Markdown body links', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    await writeFile(
      path.join(directory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nTalk to [Steve Ma](/people/Steve Ma).\n'
    );

    assert.deepEqual(
      (await listFacts({ notesDirectory: directory })).map((fact) => fact.relations),
      [['/people/Steve Ma']]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('updates a fact type by one-based index', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));
  const targetPath = path.join(directory, '2026-06-23T09-05-07.012-04-00.md');

  try {
    await writeFile(
      path.join(directory, '2026-06-23T09-04-07.012-04-00.md'),
      buildFactMarkdown('First fact.')
    );
    await writeFile(targetPath, buildFactMarkdown('Second fact.'));

    assert.equal(
      (await updateFactTypeAtIndex({
        index: 2,
        notesDirectory: directory,
        type: 'task'
      })).type,
      'task'
    );
    assert.equal(
      await readFile(targetPath, 'utf8'),
      '---\ntype: task\n---\n\nSecond fact.\n'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('gets a fact by one-based index', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    await writeFile(
      path.join(directory, '2026-06-23T09-04-07.012-04-00.md'),
      buildFactMarkdown('First fact.')
    );
    await writeFile(
      path.join(directory, '2026-06-23T09-05-07.012-04-00.md'),
      buildFactMarkdown('Second fact.')
    );

    assert.equal(
      (await factAtIndex({
        index: 2,
        notesDirectory: directory
      })).text,
      'Second fact.'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('lists context directories recursively', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    await mkdir(path.join(directory, 'alpha', 'deep'), { recursive: true });
    await mkdir(path.join(directory, 'beta'), { recursive: true });
    await writeFile(path.join(directory, '2026-06-23T09-04-07.012-04-00.md'), 'A note.');

    assert.deepEqual(
      await listContextDirectories({ notesDirectory: directory }),
      [
        'alpha',
        'alpha/deep',
        'beta'
      ]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
