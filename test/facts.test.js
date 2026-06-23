import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFactMarkdown,
  factTextFromMarkdown,
  listContextDirectories,
  listFacts,
  resolveContextDirectory,
  saveFact,
  timestampForFilename
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
          text: 'First fact.'
        },
        {
          filename: '2026-06-23T09-05-07.012-04-00.md',
          path: path.join(directory, '2026-06-23T09-05-07.012-04-00.md'),
          text: 'Second fact.'
        }
      ]
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
