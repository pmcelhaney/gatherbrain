import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTuiLines,
  completeEntry,
  createReadlineCompleter,
  createPromptState,
  handleEntry,
  renderTui
} from '../src/index.js';

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

test('builds TUI lines with the current context and note contents', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const notesDirectory = path.join(appDirectory, 'notes');
  const state = createPromptState({ appDirectory, notesDirectory });
  state.activeNotesDirectory = path.join(notesDirectory, 'my-cool-project');

  assert.deepEqual(
    buildTuiLines({
      state,
      notes: [
        { text: 'First fact.' },
        { text: 'Second fact.\nwith detail.' }
      ],
      rows: 6,
      columns: 80
    }),
    [
      'Context: my-cool-project',
      '- First fact.',
      '- Second fact.',
      '  with detail.'
    ]
  );
});

test('renders the prompt target on the bottom row', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const notesDirectory = path.join(appDirectory, 'notes');
  const state = createPromptState({ appDirectory, notesDirectory });

  assert.equal(
    renderTui({
      state,
      notes: [],
      rows: 4,
      columns: 40
    }),
    '\x1b[2J\x1b[HContext: notes\nNo notes yet.\x1b[4;1H'
  );
});

test('completes /s context names', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    await mkdir(path.join(notesDirectory, 'my-cool-project'), { recursive: true });
    await mkdir(path.join(notesDirectory, 'other-project'), { recursive: true });
    const state = createPromptState({ appDirectory, notesDirectory });

    assert.deepEqual(
      await completeEntry('/s my', state),
      [['/s my-cool-project'], '/s my']
    );
    assert.deepEqual(
      await completeEntry('/s ', state),
      [['/s my-cool-project', '/s other-project'], '/s ']
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('only completes the /s command', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });

    assert.deepEqual(await completeEntry('/s', state), [['/s '], '/s']);
    assert.deepEqual(await completeEntry('regular note', state), [[], 'regular note']);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('readline completer returns /s completions', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    await mkdir(path.join(notesDirectory, 'my-cool-project'), { recursive: true });
    const state = createPromptState({ appDirectory, notesDirectory });
    const completer = createReadlineCompleter(state);

    assert.deepEqual(await completer('/s my'), [['/s my-cool-project'], '/s my']);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});
