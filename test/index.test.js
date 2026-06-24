import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPagedNoteLines,
  buildTuiLines,
  completeEntry,
  createReadlineCompleter,
  createPromptState,
  filterNotesForLens,
  handleEntry,
  keyDebugLines,
  navigateViewBack,
  navigateViewForward,
  openEditor,
  pageNavigationForKey,
  pageNavigationForNotes,
  refreshEditedFact,
  renderTui,
  visibleFactsForState,
  viewNavigationForKey
} from '../src/index.js';

test('/s switches context without creating a note', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    await mkdir(path.join(notesDirectory, 'my-cool-project'), { recursive: true });

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
      '---\ntitle: "Captured in context."\ntype: fact\n---\n\n\n'
    );
    assert.equal(
      state.model.facts.get(path.join('my-cool-project', files[0])).title,
      'Captured in context.'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('saves typed text as a titled fact without deriving relationships from gaze or mentions', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    await mkdir(path.join(notesDirectory, 'people', 'Steve Ma'), { recursive: true });

    const saveResult = await handleEntry('Talk to @Steve Ma.', state);

    assert.equal(saveResult.action, 'continue');
    const files = await readdir(notesDirectory);
    const noteFile = files.find((file) => path.extname(file) === '.md');
    assert.equal(
      await readFile(path.join(notesDirectory, noteFile), 'utf8'),
      '---\ntitle: "Talk to @Steve Ma."\ntype: fact\n---\n\n\n'
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

test('/ lists commands without saving a note', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });

    assert.deepEqual(await handleEntry('/', state), {
      action: 'continue',
      message: '/s <context> | /l <lens> | /e <item> | /d <item> | /r <item> <context> | /debug keys'
    });
    assert.deepEqual(
      buildTuiLines({
        state,
        notes: [{ type: 'fact', text: 'Existing note.' }],
        rows: 10,
        columns: 80
      }),
      [
        'notes',
        '--------------------------------------------------------------------------------',
        'Commands:',
        '/s <context>',
        '/l <lens>',
        '/e <item>',
        '/d <item>',
        '/r <item> <context>',
        '/debug keys'
      ]
    );
    await assert.rejects(readdir(notesDirectory), { code: 'ENOENT' });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('unknown slash commands show an error and list commands', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });

    assert.deepEqual(await handleEntry('/wat now', state), {
      action: 'continue',
      message: 'unknown command /wat; /s <context> | /l <lens> | /e <item> | /d <item> | /r <item> <context> | /debug keys'
    });
    assert.deepEqual(
      buildTuiLines({
        state,
        notes: [{ type: 'fact', text: 'Existing note.' }],
        rows: 12,
        columns: 80
      }),
      [
        'notes',
        '--------------------------------------------------------------------------------',
        'unknown command /wat',
        '',
        'Commands:',
        '/s <context>',
        '/l <lens>',
        '/e <item>',
        '/d <item>',
        '/r <item> <context>',
        '/debug keys'
      ]
    );
    await assert.rejects(readdir(notesDirectory), { code: 'ENOENT' });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('/debug keys toggles key debugging', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });

    assert.deepEqual(await handleEntry('/debug keys', state), {
      action: 'continue',
      message: 'key debug on'
    });
    assert.equal(state.debugKeys, true);

    assert.deepEqual(await handleEntry('/debug keys', state), {
      action: 'continue',
      message: 'key debug off'
    });
    assert.equal(state.debugKeys, false);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('formats key debug lines', () => {
  assert.deepEqual(
    keyDebugLines('\x1b[A', {
      ctrl: false,
      meta: true,
      name: 'up',
      sequence: '\x1b[A',
      shift: false
    }),
    [
      'Key debug:',
      'value: "\\u001b[A"',
      'value code points: [1b, 5b, 41]',
      'name: "up"',
      'sequence: "\\u001b[A"',
      'sequence code points: [1b, 5b, 41]',
      'ctrl: false',
      'meta: true',
      'shift: false'
    ]
  );
});

test('uses a supplied root directory as the workspace', () => {
  const rootDirectory = path.join(tmpdir(), 'gatherbrain-workspace');
  const state = createPromptState({ rootDirectory });

  assert.equal(state.notesDirectory, rootDirectory);
  assert.equal(state.activeNotesDirectory, rootDirectory);
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
      'my-cool-project',
      '--------------------------------------------------------------------------------',
      ' 1. First fact.',
      ' 2. task Second fact.',
      '    with detail.'
    ]
  );
});

test('wraps note lines and indents continuations by four spaces', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const notesDirectory = path.join(appDirectory, 'notes');
  const state = createPromptState({ appDirectory, notesDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      notes: [
        { type: 'fact', text: 'This is a long note body.' },
        { type: 'fact', text: 'Tenth item.' },
        { type: 'fact', text: 'Third item.' },
        { type: 'fact', text: 'Fourth item.' },
        { type: 'fact', text: 'Fifth item.' },
        { type: 'fact', text: 'Sixth item.' },
        { type: 'fact', text: 'Seventh item.' },
        { type: 'fact', text: 'Eighth item.' },
        { type: 'fact', text: 'Ninth item.' },
        { type: 'fact', text: 'Tenth item.' }
      ],
      rows: 20,
      columns: 15
    }).slice(0, 5),
    [
      'notes',
      '---------------',
      ' 1. This is a',
      '    long note',
      '    body.'
    ]
  );
});

test('wraps long words only when no word boundary fits', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const notesDirectory = path.join(appDirectory, 'notes');
  const state = createPromptState({ appDirectory, notesDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      notes: [{ type: 'fact', text: 'supercalifragilistic' }],
      rows: 10,
      columns: 15
    }),
    [
      'notes',
      '---------------',
      ' 1. supercalifr',
      '    agilistic'
    ]
  );
});

test('paginates by complete items and shows an ellipsis', () => {
  assert.deepEqual(
    buildPagedNoteLines({
      notes: [
        { type: 'fact', text: 'First item wraps.' },
        { type: 'fact', text: 'Second item wraps.' },
        { type: 'fact', text: 'Third item.' }
      ],
      rows: 5,
      columns: 12
    }),
    {
      lines: [
        ' 1. First',
        '    item',
        '    wraps.',
        '...'
      ],
      nextPageStartIndex: 1,
      previousPageStartIndex: null
    }
  );
});

test('navigates note pages', () => {
  const notes = [
    { type: 'fact', text: 'First item wraps.' },
    { type: 'fact', text: 'Second item wraps.' },
    { type: 'fact', text: 'Third item.' }
  ];

  assert.deepEqual(
    pageNavigationForNotes({
      notes,
      pageStartIndex: 0,
      rows: 4,
      columns: 12
    }),
    {
      nextPageStartIndex: 1,
      previousPageStartIndex: null
    }
  );
  assert.deepEqual(
    pageNavigationForNotes({
      notes,
      pageStartIndex: 1,
      rows: 4,
      columns: 12
    }),
    {
      nextPageStartIndex: 2,
      previousPageStartIndex: 0
    }
  );
});

test('maps page and alt-arrow keys to page navigation directions', () => {
  assert.equal(pageNavigationForKey({ name: 'pagedown' }), 'down');
  assert.equal(pageNavigationForKey({ name: 'pageup' }), 'up');
  assert.equal(pageNavigationForKey({ meta: true, name: 'down' }), 'down');
  assert.equal(pageNavigationForKey({ meta: true, name: 'up' }), 'up');
  assert.equal(pageNavigationForKey({ sequence: '\x1b[1;3B' }), 'down');
  assert.equal(pageNavigationForKey({ sequence: '\x1b[3B' }), 'down');
  assert.equal(pageNavigationForKey({ ctrl: true, name: 'down', sequence: '\x1b[1;5B' }), 'down');
  assert.equal(pageNavigationForKey({ sequence: '\x1b[1;5B' }), 'down');
  assert.equal(pageNavigationForKey({ sequence: '\x1b[5B' }), 'down');
  assert.equal(pageNavigationForKey({ sequence: '\x1b[1;9B' }), 'down');
  assert.equal(pageNavigationForKey({ sequence: '\x1b[9B' }), 'down');
  assert.equal(pageNavigationForKey({ sequence: '\x1b\x1b[B' }), 'down');
  assert.equal(pageNavigationForKey({ sequence: '\x1b[1;3A' }), 'up');
  assert.equal(pageNavigationForKey({ sequence: '\x1b[3A' }), 'up');
  assert.equal(pageNavigationForKey({ ctrl: true, name: 'up', sequence: '\x1b[1;5A' }), 'up');
  assert.equal(pageNavigationForKey({ sequence: '\x1b[1;5A' }), 'up');
  assert.equal(pageNavigationForKey({ sequence: '\x1b[5A' }), 'up');
  assert.equal(pageNavigationForKey({ sequence: '\x1b[1;9A' }), 'up');
  assert.equal(pageNavigationForKey({ sequence: '\x1b[9A' }), 'up');
  assert.equal(pageNavigationForKey({ sequence: '\x1b\x1b[A' }), 'up');
  assert.equal(pageNavigationForKey({ name: 'down' }), null);
  assert.equal(pageNavigationForKey({ name: 'left', meta: true }), null);
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
    '\x1b[2J\x1b[Hnotes\n--------------------------------------------------------------------------------\n 1. First fact.\n 2. \x1b[36mtask\x1b[39m Second fact.\x1b[5;1H'
  );
});

test('renders Markdown links without syntax in the TUI', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const notesDirectory = path.join(appDirectory, 'notes');
  const state = createPromptState({ appDirectory, notesDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      notes: [
        { type: 'fact', text: 'Talk to [Steve Ma](/people/Steve Ma).' }
      ],
      rows: 5,
      columns: 80
    }),
    [
      'notes',
      '--------------------------------------------------------------------------------',
      ' 1. Talk to Steve Ma.'
    ]
  );
});

test('colors Markdown link labels in the TUI', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const notesDirectory = path.join(appDirectory, 'notes');
  const state = createPromptState({ appDirectory, notesDirectory });

  assert.equal(
    renderTui({
      state,
      notes: [
        { type: 'fact', text: 'Talk to [Steve Ma](/people/Steve Ma).' }
      ],
      rows: 4,
      columns: 80
    }),
    '\x1b[2J\x1b[Hnotes\n--------------------------------------------------------------------------------\n 1. Talk to \x1b[34mSteve Ma\x1b[39m.\x1b[4;1H'
  );
});

test('shows related folder names after related notes', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const notesDirectory = path.join(appDirectory, 'notes');
  const state = createPromptState({ appDirectory, notesDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      notes: [
        {
          displayRelations: ['Steve Ma', 'gatherbrain'],
          type: 'fact',
          text: 'Related fact.'
        }
      ],
      rows: 5,
      columns: 80
    }),
    [
      'notes',
      '--------------------------------------------------------------------------------',
      ' 1. Related fact. <Steve Ma, gatherbrain'
    ]
  );
});

test('colors related folder names in the TUI', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const notesDirectory = path.join(appDirectory, 'notes');
  const state = createPromptState({ appDirectory, notesDirectory });

  assert.equal(
    renderTui({
      state,
      notes: [
        {
          displayRelations: ['Steve Ma'],
          type: 'fact',
          text: 'Related fact.'
        }
      ],
      rows: 4,
      columns: 80
    }),
    '\x1b[2J\x1b[Hnotes\n--------------------------------------------------------------------------------\n 1. Related fact. \x1b[35m<Steve Ma\x1b[39m\x1b[4;1H'
  );
});

test('shows outbound relation names after direct notes', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const notesDirectory = path.join(appDirectory, 'notes');
  const state = createPromptState({ appDirectory, notesDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      notes: [
        {
          displayRelationDirection: '>',
          displayRelations: ['Steve Ma', 'gatherbrain'],
          type: 'fact',
          text: 'Direct fact.'
        }
      ],
      rows: 5,
      columns: 80
    }),
    [
      'notes',
      '--------------------------------------------------------------------------------',
      ' 1. Direct fact. >Steve Ma, gatherbrain'
    ]
  );
});

test('does not show outbound relation names already shown as Markdown links', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const notesDirectory = path.join(appDirectory, 'notes');
  const state = createPromptState({ appDirectory, notesDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      notes: [
        {
          displayRelationDirection: '>',
          displayRelations: ['Steve Ma'],
          relations: ['/people/Steve Ma'],
          type: 'fact',
          text: 'Talk to [Steve Ma](/people/Steve Ma)'
        }
      ],
      rows: 5,
      columns: 80
    }),
    [
      'notes',
      '--------------------------------------------------------------------------------',
      ' 1. Talk to Steve Ma'
    ]
  );
});

test('filters notes for the todo lens', () => {
  assert.deepEqual(
    filterNotesForLens([
      { type: 'fact', text: 'Ignore me.' },
      { type: 'todo', text: 'Do this.' },
      { type: 'waiting', text: 'Waiting on this.' },
      { type: 'in progress', text: 'Doing this.' }
    ], 'todo'),
    [
      { type: 'fact', text: 'Ignore me.' },
      { type: 'todo', text: 'Do this.' },
      { type: 'waiting', text: 'Waiting on this.' },
      { type: 'in progress', text: 'Doing this.' }
    ]
  );
});

test('shows the active lens in the TUI header', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const notesDirectory = path.join(appDirectory, 'notes');
  const state = createPromptState({ appDirectory, notesDirectory });
  state.activeLens = 'todo';

  assert.deepEqual(
    buildTuiLines({
      state,
      notes: [{ type: 'todo', text: 'Do this.' }],
      rows: 4,
      columns: 80
    }),
    [
      'notes | todo',
      '--------------------------------------------------------------------------------',
      ' 1. todo Do this.'
    ]
  );
});

test('/l switches lenses', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });

    assert.deepEqual(await handleEntry('/l todo', state), {
      action: 'continue',
      message: 'lens todo'
    });
    assert.equal(state.activeLens, 'todo');
    assert.deepEqual(await handleEntry('/l all', state), {
      action: 'continue',
      message: 'lens all'
    });
    assert.equal(state.activeLens, 'all');
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('view history navigates context and lens changes', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    await mkdir(path.join(notesDirectory, 'gatherbrain'), { recursive: true });
    await mkdir(path.join(notesDirectory, 'people'), { recursive: true });

    await handleEntry('/s gatherbrain', state);
    await handleEntry('/l todo', state);
    assert.equal(state.activeNotesDirectory, path.join(notesDirectory, 'gatherbrain'));
    assert.equal(state.activeLens, 'todo');

    assert.equal(navigateViewBack(state), true);
    assert.equal(state.activeNotesDirectory, path.join(notesDirectory, 'gatherbrain'));
    assert.equal(state.activeLens, 'all');

    assert.equal(navigateViewBack(state), true);
    assert.equal(state.activeNotesDirectory, notesDirectory);
    assert.equal(state.activeLens, 'all');

    assert.equal(navigateViewForward(state), true);
    assert.equal(state.activeNotesDirectory, path.join(notesDirectory, 'gatherbrain'));
    assert.equal(state.activeLens, 'all');

    await handleEntry('/s people', state);
    assert.equal(state.activeNotesDirectory, path.join(notesDirectory, 'people'));
    assert.equal(navigateViewForward(state), false);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('maps alt-arrow keys to view navigation directions', () => {
  assert.equal(viewNavigationForKey({ meta: true, name: 'left' }), 'back');
  assert.equal(viewNavigationForKey({ meta: true, name: 'right' }), 'forward');
  assert.equal(viewNavigationForKey({ sequence: '\x1b[1;3D' }), 'back');
  assert.equal(viewNavigationForKey({ sequence: '\x1bb' }), 'back');
  assert.equal(viewNavigationForKey({ sequence: '\x1b[1;3C' }), 'forward');
  assert.equal(viewNavigationForKey({ sequence: '\x1bf' }), 'forward');
  assert.equal(viewNavigationForKey({ name: 'escape', sequence: '\x1b' }), null);
  assert.equal(viewNavigationForKey({ name: 'pagedown' }), null);
});

test('/l reports unknown lenses', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });

    assert.deepEqual(await handleEntry('/l someday', state), {
      action: 'continue',
      message: 'unknown lens someday'
    });
    assert.equal(state.activeLens, 'all');
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
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

test('type command targets the active lens list', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');
  const waitingPath = path.join(notesDirectory, '2026-06-23T09-05-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    state.activeLens = 'todo';
    await mkdir(notesDirectory, { recursive: true });
    await writeFile(
      path.join(notesDirectory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );
    await writeFile(
      path.join(notesDirectory, '2026-06-23T09-05-07.012-04-00.md'),
      '---\ntype: waiting\n---\n\nWaiting item.\n'
    );
    await writeFile(
      path.join(notesDirectory, '2026-06-23T09-06-07.012-04-00.md'),
      '---\ntype: todo\n---\n\nTodo item.\n'
    );

    assert.deepEqual(await handleEntry(':done 2', state), {
      action: 'continue',
      message: 'set item 2 type to done'
    });
    assert.equal(
      state.model.facts.get(path.basename(waitingPath)).type,
      'done'
    );
    assert.equal(
      await readFile(waitingPath, 'utf8'),
      '---\ntype: done\n---\n\nWaiting item.\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('commands show source folders for notes related to the active context', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');
  const contextDirectory = path.join(notesDirectory, 'people', 'Steve Ma');
  const relatedPath = path.join(notesDirectory, 'projects', '2026-06-23T09-05-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    state.activeNotesDirectory = contextDirectory;
    await mkdir(contextDirectory, { recursive: true });
    await mkdir(path.dirname(relatedPath), { recursive: true });
    await writeFile(
      path.join(contextDirectory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nDirect fact.\n'
    );
    await writeFile(
      relatedPath,
      '---\ntype: fact\nrelatedContexts: ["people/Steve Ma"]\n---\n\nRelated fact.\n'
    );
    await writeFile(
      path.join(notesDirectory, 'projects', '2026-06-23T09-06-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nUnrelated fact.\n'
    );

    const visibleFacts = await visibleFactsForState(state);

    assert.deepEqual(
      visibleFacts.map((fact) => ({
        displayRelations: fact.displayRelations,
        text: fact.text
      })),
      [
        { displayRelations: undefined, text: 'Direct fact.' },
        { displayRelations: ['projects'], text: 'Related fact.' }
      ]
    );
    assert.deepEqual(
      buildTuiLines({
        state,
        notes: visibleFacts,
        rows: 5,
        columns: 80
      }),
      [
        'people/Steve Ma',
        '--------------------------------------------------------------------------------',
        ' 1. Direct fact.',
        ' 2. Related fact. <projects'
      ]
    );
    assert.deepEqual(await handleEntry(':todo 2', state), {
      action: 'continue',
      message: 'set item 2 type to todo'
    });
    assert.equal(
      await readFile(relatedPath, 'utf8'),
      '---\ntype: todo\nrelatedContexts: ["people/Steve Ma"]\n---\n\nRelated fact.\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('commands show outbound relations for direct notes in the active context', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');
  const contextDirectory = path.join(notesDirectory, 'gatherbrain');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    state.activeNotesDirectory = contextDirectory;
    await mkdir(path.join(notesDirectory, 'people', 'Steve Ma'), { recursive: true });
    await mkdir(contextDirectory, { recursive: true });
    await writeFile(
      path.join(contextDirectory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: done\nrelatedContexts: ["people/Steve Ma"]\n---\n\nTurn the app into a TUI.\n'
    );

    const visibleFacts = await visibleFactsForState(state);

    assert.deepEqual(
      visibleFacts.map((fact) => ({
        displayRelationDirection: fact.displayRelationDirection,
        displayRelations: fact.displayRelations,
        text: fact.text,
        type: fact.type
      })),
      [
        {
          displayRelationDirection: '>',
          displayRelations: ['Steve Ma'],
          text: 'Turn the app into a TUI.',
          type: 'done'
        }
      ]
    );
    assert.deepEqual(
      buildTuiLines({
        state,
        notes: visibleFacts,
        rows: 5,
        columns: 80
      }),
      [
        'gatherbrain',
        '--------------------------------------------------------------------------------',
        ' 1. done Turn the app into a TUI. >Steve Ma'
      ]
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

test('/e command targets the active lens list', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');
  const waitingPath = path.join(notesDirectory, '2026-06-23T09-05-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    state.activeLens = 'todo';
    await mkdir(notesDirectory, { recursive: true });
    await writeFile(
      path.join(notesDirectory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );
    await writeFile(
      path.join(notesDirectory, '2026-06-23T09-05-07.012-04-00.md'),
      '---\ntype: waiting\n---\n\nWaiting item.\n'
    );
    await writeFile(
      path.join(notesDirectory, '2026-06-23T09-06-07.012-04-00.md'),
      '---\ntype: todo\n---\n\nTodo item.\n'
    );

    assert.deepEqual(await handleEntry('/e 2', state), {
      action: 'edit',
      filePath: waitingPath,
      itemNumber: 2
    });
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

test('/d command trashes a listed item', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');
  const firstNotePath = path.join(notesDirectory, '2026-06-23T09-04-07.012-04-00.md');
  const secondNotePath = path.join(notesDirectory, '2026-06-23T09-05-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    await mkdir(notesDirectory, { recursive: true });
    await writeFile(
      firstNotePath,
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );
    await writeFile(
      secondNotePath,
      '---\ntype: fact\n---\n\nSecond fact.\n'
    );

    assert.deepEqual(await handleEntry('/d 2', state), {
      action: 'continue',
      message: 'trashed item 2'
    });
    assert.deepEqual((await readdir(notesDirectory)).sort(), [
      '.trash',
      path.basename(firstNotePath)
    ]);
    await assert.rejects(readFile(secondNotePath, 'utf8'), { code: 'ENOENT' });
    assert.equal(
      await readFile(path.join(notesDirectory, '.trash', path.basename(secondNotePath)), 'utf8'),
      '---\ntype: fact\n---\n\nSecond fact.\n'
    );
    assert.deepEqual(
      (await visibleFactsForState(state)).map((fact) => fact.text),
      ['First fact.']
    );
    assert.equal(state.model.facts.has(path.basename(secondNotePath)), false);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('/d command targets the active lens list', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');
  const factPath = path.join(notesDirectory, '2026-06-23T09-04-07.012-04-00.md');
  const waitingPath = path.join(notesDirectory, '2026-06-23T09-05-07.012-04-00.md');
  const todoPath = path.join(notesDirectory, '2026-06-23T09-06-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    state.activeLens = 'todo';
    await mkdir(notesDirectory, { recursive: true });
    await writeFile(
      factPath,
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );
    await writeFile(
      waitingPath,
      '---\ntype: waiting\n---\n\nWaiting item.\n'
    );
    await writeFile(
      todoPath,
      '---\ntype: todo\n---\n\nTodo item.\n'
    );

    assert.deepEqual(await handleEntry('/d 2', state), {
      action: 'continue',
      message: 'trashed item 2'
    });
    assert.deepEqual((await readdir(notesDirectory)).sort(), [
      '.trash',
      path.basename(factPath),
      path.basename(todoPath)
    ]);
    assert.equal(
      await readFile(path.join(notesDirectory, '.trash', path.basename(waitingPath)), 'utf8'),
      '---\ntype: waiting\n---\n\nWaiting item.\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('/d command reports missing item', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });

    assert.deepEqual(
      await handleEntry('/d 3', state),
      {
        action: 'continue',
        message: 'item 3 does not exist'
      }
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('/r command relates a listed item to a context', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');
  const notePath = path.join(notesDirectory, '2026-06-23T09-04-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    await mkdir(path.join(notesDirectory, 'people', 'Steve Ma'), { recursive: true });
    await writeFile(
      notePath,
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );

    assert.deepEqual(await handleEntry('/r 1 Steve Ma', state), {
      action: 'continue',
      message: 'related item 1 to people/Steve Ma'
    });
    assert.equal(
      await readFile(notePath, 'utf8'),
      '---\ntype: fact\nrelatedContexts: ["people/Steve Ma"]\n---\n\nFirst fact.\n'
    );
    assert.deepEqual(
      state.model.facts.get(path.basename(notePath)).relations,
      ['people/Steve Ma']
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('/r command accepts full context paths', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');
  const notePath = path.join(notesDirectory, '2026-06-23T09-04-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    await mkdir(path.join(notesDirectory, 'people', 'Steve Ma'), { recursive: true });
    await writeFile(
      notePath,
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );

    assert.deepEqual(await handleEntry('/r 1 /people/Steve Ma', state), {
      action: 'continue',
      message: 'related item 1 to people/Steve Ma'
    });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('/r command reports ambiguous context names', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    await mkdir(path.join(notesDirectory, 'people', 'Steve Ma'), { recursive: true });
    await mkdir(path.join(notesDirectory, 'vendors', 'Steve Ma'), { recursive: true });
    await writeFile(
      path.join(notesDirectory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );

    assert.deepEqual(await handleEntry('/r 1 Steve Ma', state), {
      action: 'continue',
      message: 'context Steve Ma is ambiguous'
    });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('/r command reports missing context usage', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });

    assert.deepEqual(await handleEntry('/r 1', state), {
      action: 'continue',
      message: 'usage: /r <item> <context>'
    });
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

test('refreshes the model after an edited fact changes on disk', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');
  const notePath = path.join(notesDirectory, 'fact.md');

  try {
    const state = createPromptState({ appDirectory, notesDirectory });
    await mkdir(notesDirectory, { recursive: true });
    await writeFile(notePath, '---\ntitle: Before\ntype: fact\n---\n\nBefore body.\n');
    assert.equal((await visibleFactsForState(state))[0].text, 'Before body.');

    await writeFile(notePath, '---\ntitle: After\ntype: task\n---\n\nAfter body.\n');
    await refreshEditedFact(state, notePath);

    assert.deepEqual(
      (await visibleFactsForState(state)).map((fact) => ({
        text: fact.text,
        title: fact.title,
        type: fact.type
      })),
      [{ text: 'After body.', title: 'After', type: 'task' }]
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
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
    '\x1b[2J\x1b[Hnotes\n----------------------------------------\nNo notes yet.\x1b[4;1H'
  );
});

test('completes /s context names', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    await mkdir(path.join(notesDirectory, 'alpha', 'deep-project'), { recursive: true });
    await mkdir(path.join(notesDirectory, 'my-cool-project'), { recursive: true });
    await mkdir(path.join(notesDirectory, 'other-project'), { recursive: true });
    const state = createPromptState({ appDirectory, notesDirectory });

    assert.deepEqual(
      await completeEntry('/s my', state),
      [['my-cool-project'], 'my']
    );
    assert.deepEqual(
      await completeEntry('/s deep', state),
      [['alpha/deep-project'], 'deep']
    );
    assert.deepEqual(
      await completeEntry('/s ', state),
      [['alpha', 'alpha/deep-project', 'my-cool-project', 'other-project'], '']
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('completes /r context folder names', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    await mkdir(path.join(notesDirectory, 'people', 'Steve Ma'), { recursive: true });
    await mkdir(path.join(notesDirectory, 'projects', 'gatherbrain'), { recursive: true });
    const state = createPromptState({ appDirectory, notesDirectory });

    assert.deepEqual(
      await completeEntry('/r 1 Steve', state),
      [['Steve Ma'], 'Steve']
    );
    assert.deepEqual(
      await completeEntry('/r 1 /people/S', state),
      [['/people/Steve Ma'], '/people/S']
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('completes context mentions in note text', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const notesDirectory = path.join(appDirectory, 'notes');

  try {
    await mkdir(path.join(notesDirectory, 'people', 'Steve Ma'), { recursive: true });
    const state = createPromptState({ appDirectory, notesDirectory });

    assert.deepEqual(
      await completeEntry('Talk to @St', state),
      [['@Steve Ma'], '@St']
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

    assert.deepEqual(await completer('/s my'), [['my-cool-project'], 'my']);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});
