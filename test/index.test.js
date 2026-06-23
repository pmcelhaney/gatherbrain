import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
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
  openEditor,
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
        { type: 'fact', text: 'First fact.' },
        { type: 'task', text: 'Second fact.\nwith detail.' }
      ],
      rows: 6,
      columns: 80
    }),
    [
      'Context: my-cool-project',
      '1. First fact.',
      '2. task Second fact.',
      '        with detail.'
    ]
  );
});

test('colors non-fact note types in the TUI', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const notesDirectory = path.join(appDirectory, 'notes');
  const state = createPromptState({ appDirectory, notesDirectory });

  assert.equal(
    renderTui({
      state,
      notes: [
        { type: 'fact', text: 'First fact.' },
        { type: 'task', text: 'Second fact.' }
      ],
      rows: 5,
      columns: 80
    }),
    '\x1b[2J\x1b[HContext: notes\n1. First fact.\n2. \x1b[36mtask\x1b[39m Second fact.\x1b[5;1H'
  );
});

test('type command changes a listed item type', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    await mkdir(notesDirectory, { recursive: true });
    await writeFile(
      path.join(notesDirectory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );
    await writeFile(
      path.join(notesDirectory, '2026-06-23T09-05-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nSecond fact.\n'
    );
    await writeFile(
      path.join(notesDirectory, '2026-06-23T09-06-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nThird fact.\n'
    );

    const result = await handleEntry(':foo 3', state);
    const files = await readdir(notesDirectory);
    const thirdNote = await readFile(path.join(notesDirectory, files.sort()[2]), 'utf8');

    assert.deepEqual(result, {
      action: 'continue',
      message: 'set item 3 type to foo'
    });
    assert.equal(
      thirdNote,
      '---\ntype: foo\n---\n\nThird fact.\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('type command reports missing item', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });

    assert.deepEqual(
      await handleEntry(':foo 3', state),
      {
        action: 'continue',
        message: 'item 3 does not exist'
      }
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('/e command returns an edit action for a listed item', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');
  const secondNotePath = path.join(notesDirectory, '2026-06-23T09-05-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    await mkdir(notesDirectory, { recursive: true });
    await writeFile(
      path.join(notesDirectory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );
    await writeFile(
      secondNotePath,
      '---\ntype: fact\n---\n\nSecond fact.\n'
    );

    assert.deepEqual(
      await handleEntry('/e 2', state),
      {
        action: 'edit',
        filePath: secondNotePath,
        itemNumber: 2
      }
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('/e command reports missing item', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });

    assert.deepEqual(
      await handleEntry('/e 3', state),
      {
        action: 'continue',
        message: 'item 3 does not exist'
      }
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('opens a note in the configured editor', async () => {
  const calls = [];
  const child = new EventEmitter();

  const editorPromise = openEditor('/tmp/note.md', {
    editor: 'test-editor',
    spawnProcess: (command, args, options) => {
      calls.push({ command, args, options });
      return child;
    }
  });

  child.emit('exit', 0);
  await editorPromise;

  assert.deepEqual(calls, [
    {
      command: 'test-editor',
      args: ['/tmp/note.md'],
      options: {
        shell: true,
        stdio: 'inherit'
      }
    }
  ]);
});

test('reports missing EDITOR when opening a note', async () => {
  await assert.rejects(
    openEditor('/tmp/note.md', { editor: '' }),
    /EDITOR is not set/
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
