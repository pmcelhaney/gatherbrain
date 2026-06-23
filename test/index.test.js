import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPromptState, handleEntry } from '../src/index.js';

test('/s switches context without creating a note', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });

    const switchResult = await handleEntry('/s my-cool-project', state);

    assert.deepEqual(switchResult, {
      action: 'continue',
      message: 'context my-cool-project'
    });
    assert.equal(
      state.activeNotesDirectory,
      path.join(notesDirectory, 'my-cool-project')
    );
    assert.deepEqual(await readdir(state.activeNotesDirectory), []);

    const saveResult = await handleEntry('Captured in context.', state);

    assert.equal(saveResult.action, 'continue');
    assert.match(
      saveResult.message,
      new RegExp(`^saved ${path.join('notes', 'my-cool-project')}`)
    );

    const files = await readdir(state.activeNotesDirectory);
    assert.equal(files.length, 1);
    assert.equal(
      await readFile(path.join(state.activeNotesDirectory, files[0]), 'utf8'),
      '---\ntype: fact\n---\n\nCaptured in context.\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('/s without a context does not save a note', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });

    const result = await handleEntry('/s', state);

    assert.deepEqual(result, {
      action: 'continue',
      message: 'usage: /s <context>'
    });
    assert.equal(state.activeNotesDirectory, notesDirectory);
    await assert.rejects(readdir(notesDirectory), { code: 'ENOENT' });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});
