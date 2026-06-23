import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFactMarkdown,
  saveFact,
  timestampForFilename
} from '../src/facts.js';

test('builds fact Markdown with the requested front matter', () => {
  assert.equal(
    buildFactMarkdown('The sky is blue.'),
    '---\ntype: fact\n---\n\nThe sky is blue.\n'
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
