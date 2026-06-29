import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPagedFactLines,
  buildTuiLines,
  completeEntry,
  createReadlineCompleter,
  createPromptState,
  filterFactsForLensId,
  handleEntry,
  navigateLensBack,
  navigateLensForward,
  openEditor,
  openPath,
  pageNavigationForBody,
  pageNavigationForKey,
  pageNavigationForFacts,
  readClipboard,
  reloadWorkspaceConfig,
  refreshEditedFact,
  restartAppProcess,
  restartEnvForState,
  restartSnapshotForState,
  restartSnapshotFromEnv,
  restorePromptState,
  renderQuestionPrompt,
  renderPromptLine,
  renderTui,
  visibleBodyForState,
  visibleFactsForState,
  lensNavigationForKey
} from '../src/index.js';
import { createCommandRegistry } from '../src/commands.js';
import { createEnumRegistry, enumValues } from '../src/enums.js';
import { filenameBaseForTitle, titleForFactText } from '../src/facts.js';
import { createLensRegistry } from '../src/lenses.js';

function markdownWithoutFactUuid(markdown) {
  return markdown.replace(/^id: [0-9a-f-]+\n/mu, '');
}

async function visibleDirectoryEntries(directory) {
  return (await readdir(directory))
    .filter((entry) => !entry.startsWith('.gatherbrain'))
    .sort();
}

test(':switch switches context without creating a fact', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(path.join(rootDirectory, 'my-cool-project'), { recursive: true });

    const switchResult = await handleEntry(':switch my-cool-project', state);

    assert.deepEqual(switchResult, {
      action: 'continue',
      message: 'context my-cool-project'
    });
    assert.equal(
      state.currentContextDirectory,
      path.join(rootDirectory, 'my-cool-project')
    );
    assert.deepEqual(await readdir(state.currentContextDirectory), []);

    const saveResult = await handleEntry('Captured in context.', state);

    assert.equal(saveResult.action, 'continue');
    assert.match(
      saveResult.message,
      new RegExp(`^saved ${path.join('facts', 'my-cool-project')}`)
    );

    const files = await readdir(state.currentContextDirectory);
    assert.equal(files.length, 1);
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(state.currentContextDirectory, files[0]), 'utf8')),
      '---\ntitle: "Captured in context."\ntype: fact\n---\n\nCaptured in context.\n'
    );
    assert.equal(
      state.model.facts.get(path.join('my-cool-project', files[0])).title,
      'Captured in context.'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':switch supports unix-like context identifiers', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, 'gatherbrain', 'sandbox', 'child'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'gatherbrain', 'sibling'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'people'), { recursive: true });
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(await handleEntry(':switch gatherbrain/sandbox', state), {
      action: 'continue',
      message: 'context gatherbrain/sandbox'
    });

    assert.deepEqual(await handleEntry(':switch ./child', state), {
      action: 'continue',
      message: 'context gatherbrain/sandbox/child'
    });
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'gatherbrain', 'sandbox', 'child'));

    assert.deepEqual(await handleEntry(':switch ../', state), {
      action: 'continue',
      message: 'context gatherbrain/sandbox'
    });
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'gatherbrain', 'sandbox'));

    assert.deepEqual(await handleEntry(':switch ../sibling', state), {
      action: 'continue',
      message: 'context gatherbrain/sibling'
    });
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'gatherbrain', 'sibling'));

    assert.deepEqual(await handleEntry(':switch /people', state), {
      action: 'continue',
      message: 'context people'
    });
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'people'));

    assert.deepEqual(await handleEntry(':switch /../gatherbrain', state), {
      action: 'continue',
      message: 'context gatherbrain'
    });
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'gatherbrain'));
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':switch creates unix-relative missing contexts', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, 'gatherbrain', 'sandbox'), { recursive: true });
    const state = createPromptState({ appDirectory, rootDirectory });
    await handleEntry(':switch gatherbrain/sandbox', state);

    const newChildDirectory = path.join(rootDirectory, 'gatherbrain', 'sandbox', 'new-child');

    assert.deepEqual(await handleEntry(':switch ./new-child', state), {
      action: 'continue',
      message: `Create ${newChildDirectory}? [y/N]`
    });
    assert.deepEqual(state.pendingContextCreation, {
      context: './new-child',
      directory: newChildDirectory
    });

    assert.deepEqual(await handleEntry('yes', state), {
      action: 'continue',
      message: 'context gatherbrain/sandbox/new-child'
    });
    assert.equal(state.currentContextDirectory, newChildDirectory);
    assert.equal(state.model.contexts.has('gatherbrain/sandbox/new-child'), true);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':switch asks to create a missing context and switches after yes', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    const newAppDirectory = path.join(rootDirectory, 'projects', 'new-app');

    assert.deepEqual(await handleEntry(':switch projects/new-app', state), {
      action: 'continue',
      message: `Create ${newAppDirectory}? [y/N]`
    });
    assert.deepEqual(state.pendingContextCreation, {
      context: 'projects/new-app',
      directory: newAppDirectory
    });
    assert.deepEqual(
      buildTuiLines({
        state,
        facts: [{ type: 'fact', text: 'Existing fact.' }],
        rows: 8,
        columns: 80
      }),
      [
        'facts',
        '--------------------------------------------------------------------------------',
        ' 1. Existing fact.'
      ]
    );
    assert.deepEqual(await completeEntry('Y', state), [['yes'], 'Y']);

    assert.deepEqual(await handleEntry('yes', state), {
      action: 'continue',
      message: 'context projects/new-app'
    });
    assert.equal(state.pendingContextCreation, null);
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'projects', 'new-app'));
    assert.deepEqual(await readdir(path.join(rootDirectory, 'projects')), ['new-app']);
    assert.equal(state.model.contexts.has('projects/new-app'), true);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':switch does not create a missing context after no', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    await handleEntry(':switch projects/new-app', state);

    assert.deepEqual(await handleEntry('no', state), {
      action: 'continue',
      message: 'context projects/new-app not created'
    });
    assert.equal(state.pendingContextCreation, null);
    assert.equal(state.currentContextDirectory, rootDirectory);
    await assert.rejects(readdir(path.join(rootDirectory, 'projects')), { code: 'ENOENT' });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':switch keeps asking after an invalid context creation answer', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    await handleEntry(':switch projects/new-app', state);

    assert.deepEqual(await handleEntry('maybe', state), {
      action: 'continue',
      message: 'please answer yes or no'
    });
    assert.deepEqual(state.pendingContextCreation, {
      context: 'projects/new-app',
      directory: path.join(rootDirectory, 'projects', 'new-app')
    });
    assert.deepEqual(await handleEntry('y', state), {
      action: 'continue',
      message: 'context projects/new-app'
    });
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'projects', 'new-app'));
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':switch refuses to create hidden contexts', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(await handleEntry(':switch .hidden/context', state), {
      action: 'continue',
      message: 'context cannot contain hidden folders'
    });
    assert.equal(state.pendingContextCreation, null);
    await assert.rejects(readdir(rootDirectory), { code: 'ENOENT' });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('saves typed text as a titled fact with linked mentions in the body', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(path.join(rootDirectory, 'people', 'Steve Ma'), { recursive: true });

    const saveResult = await handleEntry('Talk to @Steve Ma.', state);

    assert.equal(saveResult.action, 'continue');
    const files = await readdir(rootDirectory);
    const factFile = files.find((file) => path.extname(file) === '.md');
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(rootDirectory, factFile), 'utf8')),
      '---\ntitle: "Talk to @Steve Ma."\ntype: fact\n---\n\nTalk to [Steve Ma](/people/Steve Ma).\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':new saves a titled fact', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    const saveResult = await handleEntry(':new Follow up with Alex', state);

    assert.equal(saveResult.action, 'continue');
    const files = await readdir(rootDirectory);
    const factFile = files.find((file) => path.extname(file) === '.md');
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(rootDirectory, factFile), 'utf8')),
      '---\ntitle: "Follow up with Alex"\ntype: fact\n---\n\nFollow up with Alex\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('%type saves a fact with the matching type', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(await handleEntry('%todo Get milk', state), {
      action: 'continue',
      message: `saved ${path.join('facts', 'get-milk.md')}`
    });
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(rootDirectory, 'get-milk.md'), 'utf8')),
      '---\ntitle: "Get milk"\ntype: todo\n---\n\nGet milk\n'
    );
    assert.equal(state.model.facts.get('get-milk.md').type, 'todo');
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('%type asks before adding an unknown fact type', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(await handleEntry('%blocked Get milk', state), {
      action: 'continue',
      message: 'Fact type "blocked" is not listed. Add it? [y/N]'
    });
    assert.deepEqual(state.pendingFactTypeConfirmation, {
      factType: 'blocked',
      title: 'Get milk'
    });
    assert.deepEqual(await completeEntry('y', state), [['yes'], 'y']);
    assert.deepEqual(await handleEntry('yes', state), {
      action: 'continue',
      message: `saved ${path.join('facts', 'get-milk.md')}`
    });
    assert.equal(state.pendingFactTypeConfirmation, null);
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(rootDirectory, 'get-milk.md'), 'utf8')),
      '---\ntitle: "Get milk"\ntype: blocked\n---\n\nGet milk\n'
    );
    assert.deepEqual(
      enumValues('factType', state.commandRegistry.enumRegistry),
      ['fact', 'todo', 'waiting', 'in progress', 'done', 'blocked']
    );
    assert.deepEqual(
      JSON.parse(await readFile(path.join(rootDirectory, '.gatherbrain', 'enums.json'), 'utf8')).enums.factType.values,
      ['fact', 'todo', 'waiting', 'in progress', 'done', 'blocked']
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('%type does not create a fact when unknown type confirmation is declined', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    await handleEntry('%blocked Get milk', state);
    assert.deepEqual(await handleEntry('no', state), {
      action: 'continue',
      message: 'fact type blocked not added'
    });
    await assert.rejects(readdir(rootDirectory), { code: 'ENOENT' });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':paste writes clipboard contents and a fact pointing to the file', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const currentContext = path.join(rootDirectory, 'projects', 'gatherbrain');

  try {
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      now: () => new Date(2026, 5, 25, 14, 3, 4, 5),
      readClipboard: async () => 'clipboard contents\nsecond line'
    });
    await mkdir(currentContext, { recursive: true });
    await handleEntry(':switch projects/gatherbrain', state);

    assert.deepEqual(await handleEntry(':paste', state), {
      action: 'continue',
      message: 'Name pasted item? [Pasted 2026-06-25T14-03-04.005-04-00]'
    });
    assert.deepEqual(await handleEntry('', state), {
      action: 'continue',
      message: `pasted ${path.join('facts', 'projects', 'gatherbrain', 'pasted-2026-06-25t14-03-04-005-04-00.txt')} and ${path.join('facts', 'projects', 'gatherbrain', 'pasted-2026-06-25t14-03-04-005-04-00.md')}`
    });
    assert.equal(
      await readFile(path.join(currentContext, 'pasted-2026-06-25t14-03-04-005-04-00.txt'), 'utf8'),
      'clipboard contents\nsecond line'
    );
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(currentContext, 'pasted-2026-06-25t14-03-04-005-04-00.md'), 'utf8')),
      '---\ntitle: "Pasted 2026-06-25T14-03-04.005-04-00"\ntype: fact\nfile: "pasted-2026-06-25t14-03-04-005-04-00.txt"\n---\n\n\n'
    );
    assert.equal(
      state.model.facts.get(path.join('projects', 'gatherbrain', 'pasted-2026-06-25t14-03-04-005-04-00.md')).properties.file,
      'pasted-2026-06-25t14-03-04-005-04-00.txt'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':paste uses a typed prompted name for the companion fact', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const currentContext = path.join(rootDirectory, 'projects', 'gatherbrain');

  try {
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      now: () => new Date(2026, 5, 25, 14, 3, 4, 5),
      readClipboard: async () => 'clipboard contents'
    });
    await mkdir(currentContext, { recursive: true });
    await handleEntry(':switch projects/gatherbrain', state);

    assert.deepEqual(await handleEntry(':paste', state), {
      action: 'continue',
      message: 'Name pasted item? [Pasted 2026-06-25T14-03-04.005-04-00]'
    });
    assert.deepEqual(await handleEntry('Meeting notes', state), {
      action: 'continue',
      message: `pasted ${path.join('facts', 'projects', 'gatherbrain', 'meeting-notes.txt')} and ${path.join('facts', 'projects', 'gatherbrain', 'meeting-notes.md')}`
    });
    assert.equal(
      await readFile(path.join(currentContext, 'meeting-notes.txt'), 'utf8'),
      'clipboard contents'
    );
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(currentContext, 'meeting-notes.md'), 'utf8')),
      '---\ntitle: "Meeting notes"\ntype: fact\nfile: "meeting-notes.txt"\n---\n\n\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':paste truncates long prompted names for generated filenames', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const currentContext = path.join(rootDirectory, 'projects', 'gatherbrain');
  const title = `${'Long pasted item '.repeat(20)}tail`;
  const expectedAssetBase = filenameBaseForTitle(title);
  const expectedFactBase = filenameBaseForTitle(titleForFactText(title));

  try {
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      now: () => new Date(2026, 5, 25, 14, 3, 4, 5),
      readClipboard: async () => 'clipboard contents'
    });
    await mkdir(currentContext, { recursive: true });
    await handleEntry(':switch projects/gatherbrain', state);

    assert.deepEqual(await handleEntry(`:paste ${title}`, state), {
      action: 'continue',
      message: `pasted ${path.join('facts', 'projects', 'gatherbrain', `${expectedAssetBase}.txt`)} and ${path.join('facts', 'projects', 'gatherbrain', `${expectedFactBase}.md`)}`
    });
    assert.equal(expectedAssetBase.length, 120);
    assert.equal(expectedFactBase.length <= 80, true);
    assert.equal(
      await readFile(path.join(currentContext, `${expectedAssetBase}.txt`), 'utf8'),
      'clipboard contents'
    );
    assert.equal(
      (await readFile(path.join(currentContext, `${expectedFactBase}.md`), 'utf8')).includes(`file: "${expectedAssetBase}.txt"`),
      true
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':paste writes clipboard image contents and embeds the image fact', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const currentContext = path.join(rootDirectory, 'projects', 'gatherbrain');
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  try {
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      now: () => new Date(2026, 5, 25, 14, 3, 4, 5),
      readClipboard: async ({ imagePath }) => {
        await writeFile(imagePath, pngBytes);

        return {
          type: 'file',
          extension: '.png',
          filePath: imagePath
        };
      }
    });
    await mkdir(currentContext, { recursive: true });
    await handleEntry(':switch projects/gatherbrain', state);

    assert.deepEqual(await handleEntry(':paste Screenshot', state), {
      action: 'continue',
      message: `pasted ${path.join('facts', 'projects', 'gatherbrain', 'screenshot.png')} and ${path.join('facts', 'projects', 'gatherbrain', 'screenshot.md')}`
    });
    assert.deepEqual(
      await readFile(path.join(currentContext, 'screenshot.png')),
      pngBytes
    );
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(currentContext, 'screenshot.md'), 'utf8')),
      '---\ntitle: Screenshot\ntype: fact\nfile: "screenshot.png"\n---\n\n1. ![screenshot](screenshot.png)\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':plan appends a timebox row and :plan displays the planner', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, 'arb-prep'), { recursive: true });
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      now: () => new Date(2026, 5, 29, 8, 0)
    });

    assert.deepEqual(await handleEntry(':plan 9-12 /arb-prep', state), {
      action: 'continue',
      message: 'planned 9:00-12:00 /arb-prep'
    });
    assert.equal(
      await readFile(path.join(rootDirectory, '.gatherbrain', 'timeboxes', '2026-06-29.tsv'), 'utf8'),
      '/arb-prep\t09:00\t12:00\n'
    );

    assert.deepEqual(await handleEntry(':plan', state), {
      action: 'continue',
      message: 'plan 2026-06-29'
    });
    assert.deepEqual(
      buildTuiLines({
        state,
        rows: 8,
        columns: 80
      }),
      [
        'facts | plan 2026-06-29',
        '--------------------------------------------------------------------------------',
        '         ▶ now  8:00',
        '   8:00  ○  free · 1h',
        '   9:00  ●  /arb-prep · 3h',
        '  12:00  ○  free · 6h',
        '         ╎'
      ]
    );
    assert.deepEqual(
      buildTuiLines({
        state,
        rows: 12,
        columns: 80
      }),
      [
        'facts | plan 2026-06-29',
        '--------------------------------------------------------------------------------',
        '         ▶ now  8:00',
        '   8:00  ○  free · 1h',
        '         ╎',
        '   9:00  ●  /arb-prep · 3h',
        '         │',
        '  12:00  ○  free · 6h',
        '         ╎',
        '         ╎',
        '         ╎'
      ]
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('editing timeboxes keeps the planner view active', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, 'arb-prep'), { recursive: true });
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      now: () => new Date(2026, 5, 29, 9, 20)
    });

    await handleEntry(':plan', state);

    assert.deepEqual(await handleEntry(':plan 9-10 /arb-prep', state), {
      action: 'continue',
      message: 'planned 9:00-10:00 /arb-prep'
    });
    assert.equal(state.temporaryBodyType, 'plan');
    assert.equal(state.pageStartIndex, 0);
    assert.deepEqual(
      buildTuiLines({
        state,
        rows: 6,
        columns: 80
      }),
      [
        'facts | planned 9:00-10:00 /arb-prep',
        '--------------------------------------------------------------------------------',
        '   8:00  ○  free · 1h',
        '   9:00  ●  /arb-prep · 1h',
        '         ▶ now  9:20'
      ]
    );

    assert.deepEqual(await handleEntry(':cancel 9 /arb-prep', state), {
      action: 'continue',
      message: 'cancelled 9:00-10:00 /arb-prep'
    });
    assert.equal(state.temporaryBodyType, 'plan');
    assert.deepEqual(
      buildTuiLines({
        state,
        rows: 6,
        columns: 80
      }),
      [
        'facts | cancelled 9:00-10:00 /arb-prep',
        '--------------------------------------------------------------------------------',
        '   8:00  ○  free · 10h',
        '         ▶ now  9:20',
        '         ╎'
      ]
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':plan asks to create a missing context before adding the timebox', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      now: () => new Date(2026, 5, 29, 9, 20)
    });
    const newContextDirectory = path.join(rootDirectory, 'new-project');

    await handleEntry(':plan', state);
    assert.deepEqual(await handleEntry(':plan 9-10 /new-project', state), {
      action: 'continue',
      message: `Create ${newContextDirectory}? [y/N]`
    });
    assert.deepEqual(state.pendingContextCreation, {
      context: '/new-project',
      directory: newContextDirectory,
      after: {
        type: 'plan_timebox',
        parsedEntry: {
          type: 'plan_timebox',
          context: '/new-project',
          range: {
            start: '09:00',
            end: '10:00',
            startMinutes: 9 * 60,
            endMinutes: 10 * 60,
            isRange: true
          }
        }
      }
    });

    assert.deepEqual(await handleEntry('yes', state), {
      action: 'continue',
      message: 'planned 9:00-10:00 /new-project'
    });
    assert.equal(state.currentContextDirectory, rootDirectory);
    assert.equal(state.model.contexts.has('new-project'), true);
    assert.equal(
      await readFile(path.join(rootDirectory, '.gatherbrain', 'timeboxes', '2026-06-29.tsv'), 'utf8'),
      '/new-project\t09:00\t10:00\n'
    );
    assert.equal(state.temporaryBodyType, 'plan');
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':plan does not add a timebox when missing context creation is declined', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      now: () => new Date(2026, 5, 29, 9, 20)
    });

    await handleEntry(':plan 9-10 /new-project', state);
    assert.deepEqual(await handleEntry('no', state), {
      action: 'continue',
      message: 'context /new-project not created'
    });
    await assert.rejects(
      readFile(path.join(rootDirectory, '.gatherbrain', 'timeboxes', '2026-06-29.tsv'), 'utf8'),
      { code: 'ENOENT' }
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':cancel removes matching timeboxes and prompts for ambiguous matches', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, 'arb-prep'), { recursive: true });
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      now: () => new Date(2026, 5, 29, 9, 20)
    });

    await handleEntry(':plan 9-12 /arb-prep', state);
    await handleEntry(':plan 11-11:30 /arb-prep', state);

    assert.deepEqual(await handleEntry(':cancel 11 /arb-prep', state), {
      action: 'continue',
      message: 'Cancel which timebox? 1. 9:00-12:00 /arb-prep 2. 11:00-11:30 /arb-prep'
    });
    assert.deepEqual(await completeEntry('2', state), [['2'], '2']);
    assert.deepEqual(await handleEntry('2', state), {
      action: 'continue',
      message: 'cancelled 11:00-11:30 /arb-prep'
    });
    assert.equal(
      await readFile(path.join(rootDirectory, '.gatherbrain', 'timeboxes', '2026-06-29.tsv'), 'utf8'),
      '/arb-prep\t09:00\t12:00\n'
    );
    assert.deepEqual(await handleEntry(':cancel 3 /arb-prep', state), {
      action: 'continue',
      message: 'no timebox matches 3:00-3:30 /arb-prep'
    });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':now switches to the context that owns the current time', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, 'arb-prep'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'team-meeting', '2026-06-29'), { recursive: true });
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      now: () => new Date(2026, 5, 29, 14, 15)
    });

    await handleEntry(':plan 9-12 /arb-prep', state);
    await handleEntry(':plan 2-3 /team-meeting/2026-06-29', state);

    assert.deepEqual(await handleEntry(':now', state), {
      action: 'continue',
      message: 'context team-meeting/2026-06-29'
    });
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'team-meeting', '2026-06-29'));

    state.now = () => new Date(2026, 5, 29, 16, 0);
    assert.deepEqual(await handleEntry(':now', state), {
      action: 'continue',
      message: 'context /'
    });
    assert.equal(state.currentContextDirectory, rootDirectory);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':cancel completes only contexts overlapping the supplied time', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, 'arb-prep'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'team-meeting'), { recursive: true });
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      now: () => new Date(2026, 5, 29, 8, 0)
    });

    await handleEntry(':plan 9-12 /arb-prep', state);
    await handleEntry(':plan 2-3 /team-meeting', state);

    assert.deepEqual(await completeEntry(':cancel 11 /a', state), [['/arb-prep'], '/a']);
    assert.deepEqual(await completeEntry(':cancel 11 /t', state), [[], '/t']);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':plan display uses workspace workday settings', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, '.gatherbrain'), { recursive: true });
    await writeFile(
      path.join(rootDirectory, '.gatherbrain', 'settings.json'),
      JSON.stringify({
        settings: {
          workday: {
            start: '09:00',
            end: '10:00'
          }
        }
      })
    );
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      now: () => new Date(2026, 5, 29, 9, 20)
    });

    await handleEntry(':plan', state);

    assert.deepEqual(
      buildTuiLines({
        state,
        includeColor: true,
        rows: 8,
        columns: 80
      }),
      [
        'facts | plan 2026-06-29',
        '--------------------------------------------------------------------------------',
        '\x1b[32m   9:00  ○  free · 1h\x1b[39m',
        '\x1b[32m         ╎\x1b[39m',
        '\x1b[33m         ▶ now  9:20\x1b[39m',
        '\x1b[32m         ╎\x1b[39m',
        '\x1b[32m         ╎\x1b[39m'
      ]
    );

    assert.deepEqual(
      buildTuiLines({
        state,
        rows: 8,
        columns: 80
      }),
      [
        'facts | plan 2026-06-29',
        '--------------------------------------------------------------------------------',
        '   9:00  ○  free · 1h',
        '         ╎',
        '         ▶ now  9:20',
        '         ╎',
        '         ╎'
      ]
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('readClipboard uses osascript for macOS image clipboard contents', async () => {
  const calls = [];
  const clipboardItem = await readClipboard({
    platform: 'darwin',
    imagePath: '/tmp/pasted.png',
    spawnProcess: (command, args, options) => {
      calls.push({ command, args, options });
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => child.emit('exit', 0));

      return child;
    }
  });

  assert.equal(clipboardItem.type, 'file');
  assert.equal(clipboardItem.extension, '.png');
  assert.equal(clipboardItem.filePath, '/tmp/pasted.png');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'osascript');
  assert.equal(calls[0].args.at(-1), '/tmp/pasted.png');
  assert.deepEqual(calls[0].options, {
    stdio: ['ignore', 'pipe', 'pipe']
  });
});

test(':new prompts for a missing title', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(await handleEntry(':new', state), {
      action: 'continue',
      message: 'Title?'
    });
    assert.deepEqual(state.pendingCommand, {
      commandName: 'new',
      values: {},
      argument: {
        name: 'title',
        type: 'text',
        consume: 'rest',
        prompt: 'Title?'
      }
    });

    const saveResult = await handleEntry('Prompted capture', state);

    assert.equal(saveResult.action, 'continue');
    assert.equal(state.pendingCommand, null);
    const files = await readdir(rootDirectory);
    const factFile = files.find((file) => path.extname(file) === '.md');
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(rootDirectory, factFile), 'utf8')),
      '---\ntitle: "Prompted capture"\ntype: fact\n---\n\nPrompted capture\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':switch without a context does not save a fact', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    const result = await handleEntry(':switch', state);

    assert.deepEqual(result, {
      action: 'continue',
      message: 'Switch to which context?'
    });
    assert.equal(state.currentContextDirectory, rootDirectory);
    await assert.rejects(readdir(rootDirectory), { code: 'ENOENT' });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('named commands prompt for missing arguments', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(path.join(rootDirectory, 'my-cool-project'), { recursive: true });

    assert.deepEqual(await handleEntry(':switch', state), {
      action: 'continue',
      message: 'Switch to which context?'
    });
    assert.deepEqual(state.pendingCommand, {
      commandName: 'switch',
      values: {},
      argument: {
        name: 'context',
        type: 'context',
        consume: 'rest',
        prompt: 'Switch to which context?'
      }
    });
    assert.deepEqual(await completeEntry('my', state), [['/my-cool-project'], 'my']);
    assert.deepEqual(await handleEntry('my-cool-project', state), {
      action: 'continue',
      message: 'context my-cool-project'
    });
    assert.equal(state.pendingCommand, null);
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'my-cool-project'));
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('uses custom command registry for completion and execution', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const commandRegistry = createCommandRegistry([
    {
      name: 'jump',
      action: 'switch_context',
      arguments: [
        {
          name: 'context',
          type: 'context',
          consume: 'rest',
          prompt: 'Jump where?'
        }
      ]
    }
  ]);

  try {
    const state = createPromptState({ appDirectory, commandRegistry, rootDirectory });
    await mkdir(path.join(rootDirectory, 'my-cool-project'), { recursive: true });

    assert.deepEqual(await completeEntry(':', state), [[':jump '], ':']);
    assert.deepEqual(await handleEntry(':jump', state), {
      action: 'continue',
      message: 'Jump where?'
    });
    assert.deepEqual(await handleEntry('my-cool-project', state), {
      action: 'continue',
      message: 'context my-cool-project'
    });
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'my-cool-project'));
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('completes enum command arguments', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const commandRegistry = createCommandRegistry([
    {
      name: 'mark',
      action: 'set_fact_type',
      arguments: [
        {
          name: 'type',
          type: 'enum',
          enum: 'status',
          prompt: 'Set which status?'
        },
        {
          name: 'item',
          type: 'fact',
          prompt: 'Mark which fact?'
        }
      ]
    }
  ], {
    enumRegistry: createEnumRegistry({
      status: {
        values: ['todo', 'waiting']
      }
    })
  });

  try {
    const state = createPromptState({ appDirectory, commandRegistry, rootDirectory });

    assert.deepEqual(await completeEntry(':mark t', state), [['todo'], 't']);
    assert.deepEqual(await handleEntry(':mark', state), {
      action: 'continue',
      message: 'Set which status?'
    });
    assert.deepEqual(await completeEntry('w', state), [['waiting'], 'w']);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('keeps prompted commands active after invalid arguments', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const commandRegistry = createCommandRegistry([
    {
      name: 'mark',
      action: 'set_fact_type',
      arguments: [
        {
          name: 'type',
          type: 'enum',
          enum: 'status',
          prompt: 'Set which status?'
        },
        {
          name: 'item',
          type: 'fact',
          prompt: 'Mark which fact?'
        }
      ]
    }
  ], {
    enumRegistry: createEnumRegistry({
      status: {
        values: ['todo', 'waiting']
      }
    })
  });

  try {
    const state = createPromptState({ appDirectory, commandRegistry, rootDirectory });
    assert.deepEqual(await handleEntry(':mark', state), {
      action: 'continue',
      message: 'Set which status?'
    });

    assert.deepEqual(await handleEntry('done', state), {
      action: 'continue',
      message: 'usage: :mark <type> <item>. Set which status?'
    });
    assert.deepEqual(state.pendingCommand, {
      commandName: 'mark',
      registry: commandRegistry,
      values: {},
      argument: {
        name: 'type',
        type: 'enum',
        enum: 'status',
        prompt: 'Set which status?'
      }
    });
    assert.deepEqual(await completeEntry('w', state), [['waiting'], 'w']);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':help lists commands without saving a fact', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(await handleEntry(':help', state), {
      action: 'continue',
      message: ':switch <context> | :peek <context> | :clear-peek | :lens <lens> | :new <title> | :edit <item> | :open [item] | :delete <item> | :relate <item> <context> | :move <item> <context> | :type <item> <type> | :due <item> <value> | :paste <title> | :plan <range> <context> | :cancel <range> <context> | :now | :restart'
    });
    assert.deepEqual(
      buildTuiLines({
        state,
        facts: [{ type: 'fact', text: 'Existing fact.' }],
        rows: 19,
        columns: 80
      }),
      [
        'facts',
        '--------------------------------------------------------------------------------',
        'Commands:',
        ':switch <context>',
        ':peek <context>',
        ':clear-peek',
        ':lens <lens>',
        ':new <title>',
        ':edit <item>',
        ':open [item]',
        ':delete <item>',
        ':relate <item> <context>',
        ':move <item> <context>',
        ':type <item> <type>',
        ':due <item> <value>',
        ':paste <title>',
        ':plan <range> <context>',
        ':cancel <range> <context>'
      ]
    );
    await assert.rejects(readdir(rootDirectory), { code: 'ENOENT' });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('slash commands show a colon command usage error', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(await handleEntry('/wat now', state), {
      action: 'continue',
      message: 'slash shortcuts are no longer supported; use colon commands'
    });
    assert.deepEqual(
      buildTuiLines({
        state,
        facts: [{ type: 'fact', text: 'Existing fact.' }],
        rows: 15,
        columns: 80
      }),
      [
        'facts | slash shortcuts are no longer supported; use colon commands',
        '--------------------------------------------------------------------------------',
        ' 1. Existing fact.'
      ]
    );
    await assert.rejects(readdir(rootDirectory), { code: 'ENOENT' });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':restart returns a restart action with restorable state', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    state.currentContextDirectory = path.join(rootDirectory, 'projects', 'gatherbrain');
    state.peekContextDirectory = path.join(rootDirectory, 'people', 'Alex');
    state.currentLensId = 'today';
    state.peekLensId = 'todo';
    state.pageStartIndex = 5;
    state.lensBackStack = [{
      currentLensId: 'all',
      currentContextDirectory: rootDirectory
    }];
    state.lensForwardStack = [{
      currentLensId: 'todo',
      currentContextDirectory: path.join(rootDirectory, 'people')
    }];

    assert.deepEqual(await handleEntry(':restart', state), {
      action: 'restart',
      snapshot: {
        currentContextId: 'projects/gatherbrain',
        peekContextId: 'people/Alex',
        peekLensId: 'todo',
        currentLensId: 'today',
        lensBackStack: [{
          currentLensId: 'all',
          currentContextId: ''
        }],
        lensForwardStack: [{
          currentLensId: 'todo',
          currentContextId: 'people'
        }],
        pageStartIndex: 5
      }
    });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('restores restart state for existing contexts and lenses', () => {
  const rootDirectory = path.join(tmpdir(), 'gatherbrain-app', 'facts');
  const state = createPromptState({
    rootDirectory,
    lensRegistry: createLensRegistry([
      { id: 'all', presenter: 'context_facts' },
      { id: 'today', presenter: 'today_facts' },
      { id: 'todo', presenter: 'context_facts' }
    ]),
    model: {
      rootPath: rootDirectory,
      contexts: new Map([
        ['', { id: '', path: rootDirectory }],
        ['projects/gatherbrain', { id: 'projects/gatherbrain', path: path.join(rootDirectory, 'projects', 'gatherbrain') }],
        ['people/Alex', { id: 'people/Alex', path: path.join(rootDirectory, 'people', 'Alex') }],
        ['people', { id: 'people', path: path.join(rootDirectory, 'people') }]
      ]),
      facts: new Map()
    }
  });
  const snapshot = {
    currentContextId: 'projects/gatherbrain',
    peekContextId: 'people/Alex',
    peekLensId: 'todo',
    currentLensId: 'today',
    lensBackStack: [{ currentLensId: 'all', currentContextId: '' }],
    lensForwardStack: [{ currentLensId: 'todo', currentContextId: 'people' }],
    pageStartIndex: 7
  };

  restorePromptState(state, snapshot);

  assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'projects', 'gatherbrain'));
  assert.equal(state.peekContextDirectory, path.join(rootDirectory, 'people', 'Alex'));
  assert.equal(state.peekLensId, 'todo');
  assert.equal(state.currentLensId, 'today');
  assert.equal(state.pageStartIndex, 7);
  assert.deepEqual(state.lensBackStack, [{
    currentLensId: 'all',
    currentContextDirectory: rootDirectory
  }]);
  assert.deepEqual(state.lensForwardStack, [{
    currentLensId: 'todo',
    currentContextDirectory: path.join(rootDirectory, 'people')
  }]);
});

test('restart env serializes and parses restart snapshots', () => {
  const rootDirectory = path.join(tmpdir(), 'gatherbrain-app', 'facts');
  const state = createPromptState({ rootDirectory });
  state.currentLensId = 'today';
  const env = restartEnvForState(state, { EXISTING: '1' });
  const snapshot = restartSnapshotFromEnv(env);

  assert.equal(env.EXISTING, '1');
  assert.deepEqual(snapshot, restartSnapshotForState(state));
  assert.equal(restartSnapshotFromEnv({ GATHERBRAIN_RESTORE: '{bad json' }), null);
});

test('restart process waits for the replacement app to exit', async () => {
  const calls = [];
  const child = new EventEmitter();
  let resolved = false;
  const restartPromise = restartAppProcess({
    env: { GATHERBRAIN_RESTORE: '{}' },
    nodePath: '/node',
    args: ['/app/index.js', '/workspace'],
    spawnProcess: (command, args, options) => {
      calls.push({ command, args, options });
      return child;
    }
  }).then(() => {
    resolved = true;
  });

  await Promise.resolve();
  assert.equal(resolved, false);
  child.emit('exit', 0);
  await restartPromise;
  assert.equal(resolved, true);
  assert.deepEqual(calls, [{
    command: '/node',
    args: ['/app/index.js', '/workspace'],
    options: {
      env: { GATHERBRAIN_RESTORE: '{}' },
      stdio: 'inherit'
    }
  }]);
});

test('uses a supplied root directory as the workspace', () => {
  const rootDirectory = path.join(tmpdir(), 'gatherbrain-workspace');
  const state = createPromptState({ rootDirectory });

  assert.equal(state.rootDirectory, rootDirectory);
  assert.equal(state.currentContextDirectory, rootDirectory);
});

test('builds TUI lines with the current context and fact contents', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });
  state.currentContextDirectory = path.join(rootDirectory, 'my-cool-project');

  assert.deepEqual(
    buildTuiLines({
      state,
      facts: [
        { type: 'fact', text: 'First fact.' },
        { type: 'task', text: 'Second fact.\nwith detail.' }
      ],
      rows: 6,
      columns: 80
    }),
    [
      'my-cool-project',
      '--------------------------------------------------------------------------------',
      ' 2. First fact.',
      ' 1. task Second fact.',
      '    with detail.'
    ]
  );
});

test('builds TUI lines from a body view model', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      body: {
        type: 'facts',
        template: 'facts',
        facts: [
          { type: 'fact', text: 'First fact.' },
          { type: 'task', text: 'Second fact.' }
        ]
      },
      rows: 5,
      columns: 80
    }),
    [
      'facts',
      '--------------------------------------------------------------------------------',
      ' 2. First fact.',
      ' 1. task Second fact.'
    ]
  );
});

test('builds TUI lines with body text before titles', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      facts: [
        { type: 'fact', title: 'Title first', text: 'Body fallback.' },
        { type: 'fact', text: 'No title body.' }
      ],
      rows: 5,
      columns: 80
    }),
    [
      'facts',
      '--------------------------------------------------------------------------------',
      ' 2. Body fallback.',
      ' 1. No title body.'
    ]
  );
});

test('builds TUI lines with a workspace-local body template', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, '.gatherbrain', 'templates'), { recursive: true });
    await writeFile(
      path.join(rootDirectory, '.gatherbrain', 'templates', 'compact.hbs'),
      '{{#each facts}}{{number}}|{{body}}{{#unless @last}}\n{{/unless}}{{/each}}'
    );
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(
      buildTuiLines({
        state,
        body: {
          type: 'facts',
          template: 'compact',
          facts: [{ type: 'fact', title: 'First fact', text: 'First fact.' }]
        },
        rows: 5,
        columns: 80
      }),
      [
        'facts',
        '--------------------------------------------------------------------------------',
        ' 1|First fact. [1]'
      ]
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('wraps fact lines and indents continuations by four spaces', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      facts: [
        { type: 'fact', text: 'This is a long fact body.' },
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
      'facts',
      '---------------',
      '10. This is a',
      '    long fact',
      '    body.'
    ]
  );
});

test('wraps long words only when no word boundary fits', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      facts: [{ type: 'fact', text: 'supercalifragilistic' }],
      rows: 10,
      columns: 15
    }),
    [
      'facts',
      '---------------',
      ' 1. supercalifr',
      '    agilistic'
    ]
  );
});

test('paginates by complete items and shows an ellipsis', () => {
  assert.deepEqual(
    buildPagedFactLines({
      facts: [
        { type: 'fact', text: 'First item wraps.' },
        { type: 'fact', text: 'Second item wraps.' },
        { type: 'fact', text: 'Third item.' }
      ],
      rows: 5,
      columns: 12
    }),
    {
      lines: [
        ' 3. First',
        '    item',
        '    wraps.',
        '...'
      ],
      nextPageStartIndex: 1,
      previousPageStartIndex: null
    }
  );
});

test('navigates fact pages', () => {
  const facts = [
    { type: 'fact', text: 'First item wraps.' },
    { type: 'fact', text: 'Second item wraps.' },
    { type: 'fact', text: 'Third item.' }
  ];

  assert.deepEqual(
    pageNavigationForFacts({
      facts,
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
    pageNavigationForFacts({
      facts,
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

test('navigates body pages', () => {
  assert.deepEqual(
    pageNavigationForBody({
      body: {
        type: 'facts',
        template: 'facts',
        facts: [
          { type: 'fact', text: 'First item wraps.' },
          { type: 'fact', text: 'Second item wraps.' },
          { type: 'fact', text: 'Third item.' }
        ]
      },
      rows: 5,
      columns: 12
    }),
    {
      nextPageStartIndex: 1,
      previousPageStartIndex: null
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

test('colors non-fact fact types in the TUI', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });
  state.now = () => new Date(2026, 5, 24, 12);

  assert.equal(
    renderTui({
      state,
      facts: [
        { type: 'fact', text: 'First fact.' },
        { type: 'task', properties: { due: '2026-06-26' }, text: 'Second fact.' }
      ],
      rows: 5,
      columns: 80
    }),
    '\x1b[2J\x1b[Hfacts\n--------------------------------------------------------------------------------\n\x1b[2m 2.\x1b[22m First fact.\n\x1b[2m 1.\x1b[22m \x1b[36mtask\x1b[39m \x1b[35mFriday\x1b[39m Second fact.\x1b[5;1H'
  );
});

test('renders Markdown links without syntax in the TUI', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      facts: [
        { type: 'fact', text: 'Talk to [Steve Ma](/people/Steve Ma).' }
      ],
      rows: 5,
      columns: 80
    }),
    [
      'facts',
      '--------------------------------------------------------------------------------',
      ' 1. Talk to Steve Ma.'
    ]
  );
});

test('renders Markdown image links as filenames in the TUI', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      facts: [
        { type: 'fact', text: '1. ![test](test.png)' }
      ],
      rows: 5,
      columns: 80
    }),
    [
      'facts',
      '--------------------------------------------------------------------------------',
      ' 1. 1. test.png'
    ]
  );
});

test('colors Markdown link labels in the TUI', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });

  assert.equal(
    renderTui({
      state,
      facts: [
        { type: 'fact', text: 'Talk to [Steve Ma](/people/Steve Ma).' }
      ],
      rows: 4,
      columns: 80
    }),
    '\x1b[2J\x1b[Hfacts\n--------------------------------------------------------------------------------\n\x1b[2m 1.\x1b[22m Talk to \x1b[34mSteve Ma\x1b[39m.\x1b[4;1H'
  );
});

test('renders linked body text before title text in the TUI', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });

  assert.equal(
    renderTui({
      state,
      facts: [
        {
          title: 'Title fallback',
          type: 'fact',
          text: 'Talk to [Steve Ma](/people/Steve Ma).'
        }
      ],
      rows: 4,
      columns: 80
    }),
    '\x1b[2J\x1b[Hfacts\n--------------------------------------------------------------------------------\n\x1b[2m 1.\x1b[22m Talk to \x1b[34mSteve Ma\x1b[39m.\x1b[4;1H'
  );
});

test('shows related folder names after related facts', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      facts: [
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
      'facts',
      '--------------------------------------------------------------------------------',
      ' 1. Related fact. <Steve Ma, gatherbrain'
    ]
  );
});

test('colors related folder names in the TUI', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });

  assert.equal(
    renderTui({
      state,
      facts: [
        {
          displayRelations: ['Steve Ma'],
          type: 'fact',
          text: 'Related fact.'
        }
      ],
      rows: 4,
      columns: 80
    }),
    '\x1b[2J\x1b[Hfacts\n--------------------------------------------------------------------------------\n\x1b[2m 1.\x1b[22m Related fact. \x1b[35m<Steve Ma\x1b[39m\x1b[4;1H'
  );
});

test('shows outbound relation names after direct facts', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      facts: [
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
      'facts',
      '--------------------------------------------------------------------------------',
      ' 1. Direct fact. >Steve Ma, gatherbrain'
    ]
  );
});

test('does not show outbound relation names already shown as Markdown links', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });

  assert.deepEqual(
    buildTuiLines({
      state,
      facts: [
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
      'facts',
      '--------------------------------------------------------------------------------',
      ' 1. Talk to Steve Ma'
    ]
  );
});

test('filters facts for the todo lens', () => {
  assert.deepEqual(
    filterFactsForLensId([
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
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });
  state.currentLensId = 'todo';

  assert.deepEqual(
    buildTuiLines({
      state,
      facts: [{ type: 'todo', text: 'Do this.' }],
      rows: 4,
      columns: 80
    }),
    [
      'facts | todo',
      '--------------------------------------------------------------------------------',
      ' 1. todo Do this.'
    ]
  );
});

test(':lens switches lenses', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(await handleEntry(':lens todo', state), {
      action: 'continue',
      message: 'lens todo'
    });
    assert.equal(state.currentLensId, 'todo');
    assert.deepEqual(await handleEntry(':lens all', state), {
      action: 'continue',
      message: 'lens all'
    });
    assert.equal(state.currentLensId, 'all');
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':lens switches the peek lens without changing the current context lens', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(path.join(rootDirectory, 'people', 'Alex'), { recursive: true });

    assert.deepEqual(await handleEntry(':lens todo', state), {
      action: 'continue',
      message: 'lens todo'
    });
    assert.equal(state.currentLensId, 'todo');
    assert.equal(state.peekLensId, 'all');

    assert.deepEqual(await handleEntry(':peek people/Alex', state), {
      action: 'continue',
      message: 'peek people/Alex'
    });
    assert.deepEqual(await handleEntry(':lens today', state), {
      action: 'continue',
      message: 'lens today'
    });
    assert.equal(state.currentLensId, 'todo');
    assert.equal(state.peekLensId, 'today');
    assert.equal(state.currentContextDirectory, rootDirectory);
    assert.equal(state.peekContextDirectory, path.join(rootDirectory, 'people', 'Alex'));
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('lens history navigates context and lens changes', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(path.join(rootDirectory, 'gatherbrain'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'people'), { recursive: true });

    await handleEntry(':switch gatherbrain', state);
    await handleEntry(':lens todo', state);
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'gatherbrain'));
    assert.equal(state.currentLensId, 'todo');

    assert.equal(navigateLensBack(state), true);
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'gatherbrain'));
    assert.equal(state.currentLensId, 'all');

    assert.equal(navigateLensBack(state), true);
    assert.equal(state.currentContextDirectory, rootDirectory);
    assert.equal(state.currentLensId, 'all');

    assert.equal(navigateLensForward(state), true);
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'gatherbrain'));
    assert.equal(state.currentLensId, 'all');

    await handleEntry(':switch people', state);
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'people'));
    assert.equal(navigateLensForward(state), false);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('maps alt-arrow keys to lens navigation directions', () => {
  assert.equal(lensNavigationForKey({ meta: true, name: 'left' }), 'back');
  assert.equal(lensNavigationForKey({ meta: true, name: 'right' }), 'forward');
  assert.equal(lensNavigationForKey({ sequence: '\x1b[1;3D' }), 'back');
  assert.equal(lensNavigationForKey({ sequence: '\x1bb' }), 'back');
  assert.equal(lensNavigationForKey({ sequence: '\x1b[1;3C' }), 'forward');
  assert.equal(lensNavigationForKey({ sequence: '\x1bf' }), 'forward');
  assert.equal(lensNavigationForKey({ name: 'escape', sequence: '\x1b' }), null);
  assert.equal(lensNavigationForKey({ name: 'pagedown' }), null);
});

test(':lens reports unknown lenses', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(await handleEntry(':lens someday', state), {
      action: 'continue',
      message: 'unknown lens someday'
    });
    assert.equal(state.currentLensId, 'all');
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':peek changes peek without changing the current context', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const currentContext = path.join(rootDirectory, 'projects', 'gatherbrain');
  const peekContext = path.join(rootDirectory, 'people', 'Alex');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(currentContext, { recursive: true });
    await mkdir(peekContext, { recursive: true });
    await writeFile(
      path.join(currentContext, 'current.md'),
      '---\ntype: fact\n---\n\nCurrent context fact.\n'
    );
    await writeFile(
      path.join(peekContext, 'peek.md'),
      '---\ntype: fact\n---\n\nPeek context fact.\n'
    );

    assert.deepEqual(await handleEntry(':switch projects/gatherbrain', state), {
      action: 'continue',
      message: 'context projects/gatherbrain'
    });
    assert.deepEqual(await handleEntry(':peek people/Alex', state), {
      action: 'continue',
      message: 'peek people/Alex'
    });
    assert.equal(state.currentContextDirectory, currentContext);
    assert.equal(state.peekContextDirectory, peekContext);
    assert.deepEqual(
      (await visibleFactsForState(state)).map((fact) => fact.text),
      ['Peek context fact.']
    );
    const body = await visibleBodyForState(state);

    assert.equal(body.type, 'facts');
    assert.equal(body.template, 'facts');
    assert.deepEqual(
      body.facts.map((fact) => fact.text),
      ['Peek context fact.']
    );
    assert.deepEqual(
      buildTuiLines({
        state,
        body,
        rows: 4,
        columns: 80
      }),
      [
        'projects/gatherbrain -> people/Alex',
        '--------------------------------------------------------------------------------',
        ' 1. Peek context fact.'
      ]
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('saving while peeking creates in the current context and relates to peek', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const currentContext = path.join(rootDirectory, 'projects', 'gatherbrain');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(currentContext, { recursive: true });
    await mkdir(path.join(rootDirectory, 'people', 'Alex'), { recursive: true });

    await handleEntry(':switch projects/gatherbrain', state);
    await handleEntry(':peek people/Alex', state);
    assert.deepEqual(await handleEntry('Follow up with Alex', state), {
      action: 'continue',
      message: `saved ${path.join('facts', 'projects', 'gatherbrain', 'follow-up-with-alex.md')}`
    });

    assert.deepEqual(
      await readdir(currentContext),
      ['follow-up-with-alex.md']
    );
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(currentContext, 'follow-up-with-alex.md'), 'utf8')),
      '---\ntitle: "Follow up with Alex"\ntype: fact\nrelatedContexts: ["people/Alex"]\n---\n\nFollow up with Alex\n'
    );
    assert.deepEqual(
      (await visibleFactsForState(state)).map((fact) => ({
        displayRelationDirection: fact.displayRelationDirection,
        displayRelations: fact.displayRelations,
        text: fact.text
      })),
      [
        {
          displayRelationDirection: '<',
          displayRelations: ['gatherbrain'],
          text: 'Follow up with Alex'
        }
      ]
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':switch clears peek', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(path.join(rootDirectory, 'projects', 'gatherbrain'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'people', 'Alex'), { recursive: true });

    await handleEntry(':peek people/Alex', state);
    assert.equal(state.peekContextDirectory, path.join(rootDirectory, 'people', 'Alex'));
    await handleEntry(':switch projects/gatherbrain', state);
    assert.equal(state.currentContextDirectory, path.join(rootDirectory, 'projects', 'gatherbrain'));
    assert.equal(state.peekContextDirectory, null);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':peek clears peek', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(path.join(rootDirectory, 'people', 'Alex'), { recursive: true });

    await handleEntry(':peek people/Alex', state);
    assert.equal(state.peekContextDirectory, path.join(rootDirectory, 'people', 'Alex'));
    assert.deepEqual(await handleEntry(':clear-peek', state), {
      action: 'continue',
      message: 'peek cleared'
    });
    assert.equal(state.peekContextDirectory, null);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('type command changes a listed item type', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(rootDirectory, { recursive: true });
    await writeFile(
      path.join(rootDirectory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );
    await writeFile(
      path.join(rootDirectory, '2026-06-23T09-05-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nSecond fact.\n'
    );
    await writeFile(
      path.join(rootDirectory, '2026-06-23T09-06-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nThird fact.\n'
    );

    const result = await handleEntry(':type 1 foo', state);
    const files = (await readdir(rootDirectory)).filter((file) => path.extname(file) === '.md');
    const firstFact = markdownWithoutFactUuid(await readFile(path.join(rootDirectory, files.sort()[0]), 'utf8'));

    assert.deepEqual(result, {
      action: 'continue',
      message: 'set item 1 type to foo'
    });
    assert.equal(
      firstFact,
      '---\ntype: foo\n---\n\nFirst fact.\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('type command targets the active lens list', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const waitingPath = path.join(rootDirectory, '2026-06-23T09-05-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    state.currentLensId = 'todo';
    await mkdir(rootDirectory, { recursive: true });
    await writeFile(
      path.join(rootDirectory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );
    await writeFile(
      path.join(rootDirectory, '2026-06-23T09-05-07.012-04-00.md'),
      '---\ntype: waiting\n---\n\nWaiting item.\n'
    );
    await writeFile(
      path.join(rootDirectory, '2026-06-23T09-06-07.012-04-00.md'),
      '---\ntype: todo\n---\n\nTodo item.\n'
    );

    assert.deepEqual(await handleEntry(':type 2 done', state), {
      action: 'continue',
      message: 'set item 2 type to done'
    });
    assert.equal(
      state.model.facts.get(path.basename(waitingPath)).type,
      'done'
    );
    assert.equal(
      markdownWithoutFactUuid(await readFile(waitingPath, 'utf8')),
      '---\ntype: done\n---\n\nWaiting item.\n'
    );
    assert.deepEqual(
      (await visibleFactsForState(state)).map((fact) => ({
        keptInView: fact.keptInView ?? false,
        text: fact.text,
        type: fact.type
      })),
      [
        { keptInView: false, text: 'Todo item.', type: 'todo' },
        { keptInView: true, text: 'Waiting item.', type: 'done' },
        { keptInView: false, text: 'First fact.', type: 'fact' }
      ]
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('typed fact type shorthand changes a listed item type', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const secondFactPath = path.join(rootDirectory, 'second-fact.md');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(rootDirectory, { recursive: true });
    await writeFile(
      path.join(rootDirectory, 'first-fact.md'),
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );
    await writeFile(
      secondFactPath,
      '---\ntype: waiting\n---\n\nSecond fact.\n'
    );

    assert.deepEqual(await handleEntry('.done 2', state), {
      action: 'continue',
      message: 'set item 2 type to done'
    });
    assert.equal(
      markdownWithoutFactUuid(await readFile(secondFactPath, 'utf8')),
      '---\ntype: done\n---\n\nSecond fact.\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('commands show source folders for facts related to the active context', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const contextDirectory = path.join(rootDirectory, 'people', 'Steve Ma');
  const relatedPath = path.join(rootDirectory, 'projects', '2026-06-23T09-05-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    state.currentContextDirectory = contextDirectory;
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
      path.join(rootDirectory, 'projects', '2026-06-23T09-06-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nUnrelated fact.\n'
    );

    const visibleFacts = await visibleFactsForState(state);

    assert.deepEqual(
      visibleFacts.map((fact) => ({
        displayRelations: fact.displayRelations,
        text: fact.text
      })),
      [
        { displayRelations: ['projects'], text: 'Related fact.' },
        { displayRelations: undefined, text: 'Direct fact.' }
      ]
    );
    assert.deepEqual(
      buildTuiLines({
        state,
        facts: visibleFacts,
        rows: 5,
        columns: 80
      }),
      [
        'people/Steve Ma',
        '--------------------------------------------------------------------------------',
        ' 2. Related fact. <projects',
        ' 1. Direct fact.'
      ]
    );
    assert.deepEqual(await handleEntry(':type 2 todo', state), {
      action: 'continue',
      message: 'set item 2 type to todo'
    });
    assert.equal(
      markdownWithoutFactUuid(await readFile(relatedPath, 'utf8')),
      '---\ntype: todo\nrelatedContexts: ["people/Steve Ma"]\n---\n\nRelated fact.\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('commands show outbound relations for direct facts in the active context', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const contextDirectory = path.join(rootDirectory, 'gatherbrain');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    state.currentContextDirectory = contextDirectory;
    await mkdir(path.join(rootDirectory, 'people', 'Steve Ma'), { recursive: true });
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
        facts: visibleFacts,
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
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(
      await handleEntry(':type 3 foo', state),
      {
        action: 'continue',
        message: 'item 3 does not exist'
      }
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('due command sets a normalized due date property', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const factPath = path.join(rootDirectory, '2026-06-23T09-05-07.012-04-00.md');
  const commandRegistry = createCommandRegistry([
    {
      name: 'due',
      action: 'set_fact_property',
      property: 'due',
      arguments: [
        {
          name: 'item',
          type: 'fact',
          prompt: 'Set due date on which fact?'
        },
        {
          name: 'value',
          type: 'date',
          prompt: 'Due when?'
        }
      ]
    }
  ], {
    dateToday: new Date(2026, 5, 24, 12)
  });

  try {
    await mkdir(rootDirectory, { recursive: true });
    await writeFile(factPath, '---\ntype: fact\n---\n\nExisting fact.\n');
    const state = createPromptState({ appDirectory, commandRegistry, rootDirectory });

    assert.deepEqual(await handleEntry(':due 1 today', state), {
      action: 'continue',
      message: 'set item 1 due to 2026-06-24'
    });
    assert.equal(
      markdownWithoutFactUuid(await readFile(factPath, 'utf8')),
      '---\ntype: fact\ndue: 2026-06-24\n---\n\nExisting fact.\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('item update shorthand applies type due date and relations', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const factPath = path.join(rootDirectory, 'follow-up.md');
  const commandRegistry = createCommandRegistry(undefined, {
    dateToday: new Date(2026, 5, 24, 12)
  });

  try {
    await mkdir(path.join(rootDirectory, 'people', 'steve-ma'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'people', 'john-do'), { recursive: true });
    await writeFile(factPath, '---\ntype: fact\n---\n\nFollow up.\n');
    const state = createPromptState({ appDirectory, commandRegistry, rootDirectory });

    assert.deepEqual(await handleEntry('1 todo today /people/steve-ma /people/john-do', state), {
      action: 'continue',
      message: 'updated item 1'
    });
    assert.equal(
      markdownWithoutFactUuid(await readFile(factPath, 'utf8')),
      '---\ntype: todo\ndue: 2026-06-24\nrelatedContexts: ["people/steve-ma", "people/john-do"]\n---\n\nFollow up.\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('item update shorthand validates before mutating', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const factPath = path.join(rootDirectory, 'follow-up.md');

  try {
    await mkdir(rootDirectory, { recursive: true });
    await writeFile(factPath, '---\ntype: fact\n---\n\nFollow up.\n');
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(await handleEntry('1 done /missing', state), {
      action: 'continue',
      message: 'context /missing does not exist'
    });
    assert.equal(
      markdownWithoutFactUuid(await readFile(factPath, 'utf8')),
      '---\ntype: fact\n---\n\nFollow up.\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('item update shorthand keeps item visible when it leaves the lens', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    state.currentLensId = 'todo';
    await mkdir(rootDirectory, { recursive: true });
    await writeFile(path.join(rootDirectory, 'first.md'), '---\ntype: fact\n---\n\nFirst.\n');
    await writeFile(path.join(rootDirectory, 'second.md'), '---\ntype: waiting\n---\n\nSecond.\n');

    assert.deepEqual(await handleEntry('1 done', state), {
      action: 'continue',
      message: 'updated item 1'
    });
    assert.deepEqual(
      (await visibleFactsForState(state)).map((fact) => ({
        keptInView: fact.keptInView ?? false,
        text: fact.text,
        type: fact.type
      })),
      [
        { keptInView: false, text: 'Second.', type: 'waiting' },
        { keptInView: true, text: 'First.', type: 'done' }
      ]
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':edit command returns an edit action for a listed item', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const firstFactPath = path.join(rootDirectory, '2026-06-23T09-04-07.012-04-00.md');
  const secondFactPath = path.join(rootDirectory, '2026-06-23T09-05-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(rootDirectory, { recursive: true });
    await writeFile(
      firstFactPath,
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );
    await writeFile(
      secondFactPath,
      '---\ntype: fact\n---\n\nSecond fact.\n'
    );

    assert.deepEqual(
      await handleEntry(':edit 2', state),
      {
        action: 'edit',
        filePath: secondFactPath,
        itemLabel: '2',
        itemNumber: 2
      }
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':edit command targets the active lens list', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const waitingPath = path.join(rootDirectory, '2026-06-23T09-05-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    state.currentLensId = 'todo';
    await mkdir(rootDirectory, { recursive: true });
    await writeFile(
      path.join(rootDirectory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );
    await writeFile(
      path.join(rootDirectory, '2026-06-23T09-05-07.012-04-00.md'),
      '---\ntype: waiting\n---\n\nWaiting item.\n'
    );
    await writeFile(
      path.join(rootDirectory, '2026-06-23T09-06-07.012-04-00.md'),
      '---\ntype: todo\n---\n\nTodo item.\n'
    );

    assert.deepEqual(await handleEntry(':edit 2', state), {
      action: 'edit',
      filePath: waitingPath,
      itemLabel: '2',
      itemNumber: 2
    });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':edit command reports missing item', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(
      await handleEntry(':edit 3', state),
      {
        action: 'continue',
        message: 'item 3 does not exist'
      }
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':open without an item opens the current context directory', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const openedPaths = [];

  try {
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      openPath: async (filePath) => openedPaths.push(filePath)
    });
    await mkdir(path.join(rootDirectory, 'projects', 'gatherbrain'), { recursive: true });
    await handleEntry(':switch projects/gatherbrain', state);

    assert.deepEqual(await handleEntry(':open', state), {
      action: 'continue',
      message: `opened ${path.join('facts', 'projects', 'gatherbrain')}`
    });
    assert.deepEqual(openedPaths, [path.join(rootDirectory, 'projects', 'gatherbrain')]);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':open with an item opens the referenced file', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const openedPaths = [];

  try {
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      openPath: async (filePath) => openedPaths.push(filePath)
    });
    await mkdir(rootDirectory, { recursive: true });
    await writeFile(path.join(rootDirectory, 'pasted.txt'), 'Pasted content.');
    await writeFile(
      path.join(rootDirectory, 'pasted.md'),
      '---\ntitle: Pasted\ntype: fact\nfile: pasted.txt\n---\n\n'
    );

    assert.deepEqual(await handleEntry(':open 1', state), {
      action: 'continue',
      message: 'opened item 1 file'
    });
    assert.deepEqual(openedPaths, [path.join(rootDirectory, 'pasted.txt')]);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':open reports facts without referenced files', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(rootDirectory, { recursive: true });
    await writeFile(
      path.join(rootDirectory, 'fact.md'),
      '---\ntitle: Fact\ntype: fact\n---\n\n'
    );

    assert.deepEqual(await handleEntry(':open 1', state), {
      action: 'continue',
      message: 'item 1 does not reference a file'
    });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':delete command trashes a listed item', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const firstFactPath = path.join(rootDirectory, '2026-06-23T09-04-07.012-04-00.md');
  const secondFactPath = path.join(rootDirectory, '2026-06-23T09-05-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(rootDirectory, { recursive: true });
    await writeFile(
      firstFactPath,
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );
    await writeFile(
      secondFactPath,
      '---\ntype: fact\n---\n\nSecond fact.\n'
    );

    assert.deepEqual(await handleEntry(':delete 1', state), {
      action: 'continue',
      message: 'trashed item 1'
    });
    assert.deepEqual(await visibleDirectoryEntries(rootDirectory), [
      '.trash',
      path.basename(secondFactPath)
    ]);
    await assert.rejects(readFile(firstFactPath, 'utf8'), { code: 'ENOENT' });
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(rootDirectory, '.trash', path.basename(firstFactPath)), 'utf8')),
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );
    assert.deepEqual(
      (await visibleFactsForState(state)).map((fact) => fact.text),
      ['Second fact.', 'First fact.']
    );
    assert.deepEqual(
      (await visibleFactsForState(state)).map((fact) => fact.keptInView ?? false),
      [false, true]
    );
    assert.deepEqual(
      (await visibleFactsForState(state)).map((fact) => fact.deletedInView ?? false),
      [false, true]
    );
    assert.equal(state.model.facts.has(path.basename(firstFactPath)), false);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('item numbers stay stable after deleting a visible item', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(rootDirectory, { recursive: true });
    await writeFile(
      path.join(rootDirectory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );
    await writeFile(
      path.join(rootDirectory, '2026-06-23T09-05-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nSecond fact.\n'
    );
    await writeFile(
      path.join(rootDirectory, '2026-06-23T09-06-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nThird fact.\n'
    );

    assert.deepEqual(
      buildTuiLines({
        state,
        body: await visibleBodyForState(state),
        rows: 6,
        columns: 80
      }),
    [
      'facts',
      '--------------------------------------------------------------------------------',
      ' 3. Third fact.',
      ' 2. Second fact.',
      ' 1. First fact.'
    ]
    );
    assert.deepEqual(await handleEntry(':delete 2', state), {
      action: 'continue',
      message: 'trashed item 2'
    });
    assert.deepEqual(
      buildTuiLines({
        state,
        body: await visibleBodyForState(state),
        rows: 6,
        columns: 80
      }),
    [
      'facts',
      '--------------------------------------------------------------------------------',
      ' 3. Third fact.',
      ' 2. [deleted] Second fact.',
      ' 1. First fact.'
    ]
    );
    assert.match(
    renderTui({
      state,
      body: await visibleBodyForState(state),
      rows: 6,
      columns: 80
    }),
    /\x1b\[2m\x1b\[2m 2\.\x1b\[22m \[deleted\] Second fact\.\x1b\[22m/u
  );
    await handleEntry(':lens todo', state);
    assert.deepEqual(
      (await visibleFactsForState(state)).map((fact) => fact.text),
      ['Third fact.', 'First fact.']
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':delete command targets the active lens list', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const factPath = path.join(rootDirectory, '2026-06-23T09-04-07.012-04-00.md');
  const waitingPath = path.join(rootDirectory, '2026-06-23T09-05-07.012-04-00.md');
  const todoPath = path.join(rootDirectory, '2026-06-23T09-06-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    state.currentLensId = 'todo';
    await mkdir(rootDirectory, { recursive: true });
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

    assert.deepEqual(await handleEntry(':delete 2', state), {
      action: 'continue',
      message: 'trashed item 2'
    });
    assert.deepEqual(await visibleDirectoryEntries(rootDirectory), [
      '.trash',
      path.basename(factPath),
      path.basename(todoPath)
    ]);
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(rootDirectory, '.trash', path.basename(waitingPath)), 'utf8')),
      '---\ntype: waiting\n---\n\nWaiting item.\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':delete command reports missing item', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(
      await handleEntry(':delete 3', state),
      {
        action: 'continue',
        message: 'item 3 does not exist'
      }
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':relate command relates a listed item to a context', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const factPath = path.join(rootDirectory, '2026-06-23T09-04-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(path.join(rootDirectory, 'people', 'Steve Ma'), { recursive: true });
    await writeFile(
      factPath,
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );

    assert.deepEqual(await handleEntry(':relate 1 Steve Ma', state), {
      action: 'continue',
      message: 'related item 1 to people/Steve Ma'
    });
    assert.equal(
      markdownWithoutFactUuid(await readFile(factPath, 'utf8')),
      '---\ntype: fact\nrelatedContexts: ["people/Steve Ma"]\n---\n\nFirst fact.\n'
    );
    assert.deepEqual(
      state.model.facts.get(path.basename(factPath)).relations,
      ['people/Steve Ma']
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('named relate prompts for item and context', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const factPath = path.join(rootDirectory, '2026-06-23T09-04-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(path.join(rootDirectory, 'people', 'Steve Ma'), { recursive: true });
    await writeFile(
      factPath,
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );

    assert.deepEqual(await handleEntry(':relate', state), {
      action: 'continue',
      message: 'Relate which fact?'
    });
    assert.deepEqual(await handleEntry('1', state), {
      action: 'continue',
      message: 'Relate it to which context?'
    });
    assert.deepEqual(await completeEntry('Steve', state), [['/people/Steve Ma'], 'Steve']);
    assert.deepEqual(await handleEntry('Steve Ma', state), {
      action: 'continue',
      message: 'related item 1 to people/Steve Ma'
    });
    assert.equal(
      markdownWithoutFactUuid(await readFile(factPath, 'utf8')),
      '---\ntype: fact\nrelatedContexts: ["people/Steve Ma"]\n---\n\nFirst fact.\n'
    );
    assert.equal(state.pendingCommand, null);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':relate command accepts full context paths', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const factPath = path.join(rootDirectory, '2026-06-23T09-04-07.012-04-00.md');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(path.join(rootDirectory, 'people', 'Steve Ma'), { recursive: true });
    await writeFile(
      factPath,
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );

    assert.deepEqual(await handleEntry(':relate 1 /people/Steve Ma', state), {
      action: 'continue',
      message: 'related item 1 to people/Steve Ma'
    });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':move command moves a listed item to a context', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const sourceContext = path.join(rootDirectory, 'projects');
  const targetContext = path.join(rootDirectory, 'people', 'Steve Ma');
  const factPath = path.join(sourceContext, 'follow-up.md');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(sourceContext, { recursive: true });
    await mkdir(targetContext, { recursive: true });
    state.currentContextDirectory = sourceContext;
    await writeFile(
      factPath,
      '---\ntitle: "Follow up"\ntype: todo\n---\n\nFollow up\n'
    );

    assert.deepEqual(await handleEntry(':move 1 /people/Steve Ma', state), {
      action: 'continue',
      message: 'moved item 1 to people/Steve Ma'
    });
    assert.equal(state.model.facts.has('projects/follow-up.md'), false);
    assert.equal(state.model.facts.get('people/Steve Ma/follow-up.md').contextId, 'people/Steve Ma');
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(targetContext, 'follow-up.md'), 'utf8')),
      '---\ntitle: "Follow up"\ntype: todo\nrelatedContexts: ["projects"]\n---\n\nFollow up\n'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':relate command reports ambiguous context names', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(path.join(rootDirectory, 'people', 'Steve Ma'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'vendors', 'Steve Ma'), { recursive: true });
    await writeFile(
      path.join(rootDirectory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nFirst fact.\n'
    );

    assert.deepEqual(await handleEntry(':relate 1 Steve Ma', state), {
      action: 'continue',
      message: 'context Steve Ma is ambiguous'
    });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test(':relate command reports missing context usage', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(await handleEntry(':relate 1', state), {
      action: 'continue',
      message: 'Relate it to which context?'
    });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('opens a fact in the configured editor', async () => {
  const calls = [];
  const child = new EventEmitter();

  const editorPromise = openEditor('/tmp/fact.md', {
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
      args: ['/tmp/fact.md'],
      options: {
        shell: true,
        stdio: 'inherit'
      }
    }
  ]);
});

test('reports missing EDITOR when opening a fact', async () => {
  await assert.rejects(
    openEditor('/tmp/fact.md', { editor: '' }),
    /EDITOR is not set/
  );
});

test('opens a path with the platform opener', async () => {
  const calls = [];
  const child = new EventEmitter();
  child.unref = () => calls.push({ unref: true });

  const openPromise = openPath('/tmp/pasted.png', {
    platform: 'darwin',
    spawnProcess: (command, args, options) => {
      calls.push({ command, args, options });
      return child;
    }
  });

  child.emit('spawn');
  await openPromise;

  assert.deepEqual(calls, [
    {
      command: 'open',
      args: ['/tmp/pasted.png'],
      options: {
        stdio: 'ignore',
        detached: true
      }
    },
    { unref: true }
  ]);
});

test('refreshes the model after an edited fact changes on disk', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const factPath = path.join(rootDirectory, 'fact.md');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(rootDirectory, { recursive: true });
    await writeFile(factPath, '---\ntitle: Before\ntype: fact\n---\n\nBefore body.\n');
    assert.equal((await visibleFactsForState(state))[0].text, 'Before body.');

    await writeFile(factPath, '---\ntitle: After\ntype: task\n---\n\nAfter body.\n');
    await refreshEditedFact(state, factPath);

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
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });

  assert.equal(
    renderTui({
      state,
      facts: [],
      rows: 4,
      columns: 40
    }),
    '\x1b[2J\x1b[Hfacts\n----------------------------------------\nNo facts yet.\x1b[4;1H'
  );
});

test('highlights the item number at the start of the prompt', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });

  assert.equal(
    renderTui({
      state,
      facts: [{ text: 'Follow up.' }],
      rows: 4,
      columns: 40,
      promptLine: '1'
    }),
    '\x1b[2J\x1b[Hfacts\n----------------------------------------\n\x1b[7m\x1b[2m 1.\x1b[22m Follow up.\x1b[27m\x1b[4;1H'
  );
});

test('previews item update shorthand on the highlighted item', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const commandRegistry = createCommandRegistry(undefined, {
    dateToday: new Date(2026, 5, 24, 12)
  });
  const state = createPromptState({ appDirectory, commandRegistry, rootDirectory });
  state.dateToday = new Date(2026, 5, 24, 12);

  assert.equal(
    renderTui({
      state,
      facts: [{ text: 'Follow up.', type: 'todo' }],
      rows: 4,
      columns: 40,
      promptLine: '1 waiting today'
    }),
    '\x1b[2J\x1b[Hfacts\n----------------------------------------\n\x1b[7m\x1b[2m 1.\x1b[22m \x1b[36mwaiting\x1b[39m \x1b[35mtoday\x1b[39m Follow up.\x1b[27m\x1b[4;1H'
  );
});

test('renders peek mode with a screen background color', () => {
  const appDirectory = path.join(tmpdir(), 'gatherbrain-app');
  const rootDirectory = path.join(appDirectory, 'facts');
  const state = createPromptState({ appDirectory, rootDirectory });
  state.peekContextDirectory = path.join(rootDirectory, 'people', 'Alex');

  assert.equal(
    renderTui({
      state,
      facts: [],
      rows: 4,
      columns: 40
    }),
    '\x1b[48;5;234m\x1b[2J\x1b[Hfacts -> people/Alex\n----------------------------------------\nNo facts yet.\x1b[4;1H\x1b[0m'
  );
});

test('renders command mode prompt line with background color', () => {
  assert.equal(
    renderPromptLine(':switch', { includeAnsi: true }),
    '\x1b[48;5;236m> :switch\x1b[K\x1b[0m'
  );
  assert.equal(
    renderPromptLine('my-context', {
      includeAnsi: true,
      state: {
        pendingCommand: {
          commandName: 'switch'
        }
      }
    }),
    '\x1b[48;5;236m> my-context\x1b[K\x1b[0m'
  );
  assert.equal(
    renderPromptLine('yes', {
      includeAnsi: true,
      state: {
        pendingContextCreation: {
          context: 'missing',
          directory: '/tmp/missing'
        }
      }
    }),
    '\x1b[48;5;236m> yes\x1b[K\x1b[0m'
  );
  assert.equal(
    renderQuestionPrompt({
      includeAnsi: true,
      state: {
        pendingContextCreation: {
          context: 'missing',
          directory: '/tmp/missing'
        },
        statusMessage: 'Create /tmp/missing? [y/N]'
      }
    }),
    '\x1b[48;5;236mCreate /tmp/missing? [y/N] > \x1b[K\x1b[0m'
  );
});

test('renders normal prompt line without background color', () => {
  assert.equal(
    renderPromptLine('new fact', { includeAnsi: true }),
    '> new fact'
  );
  assert.equal(
    renderPromptLine(':switch', { includeAnsi: false }),
    '> :switch'
  );
});

test('completes :switch context names', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, 'alpha', 'deep-project', 'child'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'alpha', 'sibling-project'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'my-cool-project'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'other-project'), { recursive: true });
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(
      await completeEntry(':switch my', state),
      [['/my-cool-project'], 'my']
    );
    assert.deepEqual(
      await completeEntry(':SWITCH MY', state),
      [['/my-cool-project'], 'MY']
    );
    assert.deepEqual(
      await completeEntry(':switch deep', state),
      [['/alpha/deep-project', '/alpha/deep-project/child'], 'deep']
    );
    assert.deepEqual(
      await completeEntry(':switch ', state),
      [['/alpha', '/alpha/deep-project', '/alpha/deep-project/child', '/alpha/sibling-project', '/my-cool-project', '/other-project'], '']
    );
    assert.deepEqual(
      await completeEntry(':switch /my', state),
      [['/my-cool-project'], '/my']
    );
    assert.deepEqual(
      await completeEntry(':switch /MY', state),
      [['/my-cool-project'], '/MY']
    );

    await handleEntry(':switch alpha/deep-project', state);

    assert.deepEqual(
      await completeEntry(':switch ../s', state),
      [['/alpha/sibling-project'], '../s']
    );
    assert.deepEqual(
      await completeEntry(':switch ../S', state),
      [['/alpha/sibling-project'], '../S']
    );
    assert.deepEqual(
      await completeEntry(':switch ./c', state),
      [['/alpha/deep-project/child'], './c']
    );
    assert.deepEqual(
      await completeEntry(':switch ./C', state),
      [['/alpha/deep-project/child'], './C']
    );
    assert.deepEqual(
      await completeEntry(':switch /other', state),
      [['/other-project'], '/other']
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('completes :peek context names', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, 'people', 'Alex'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'people', 'Mike Sisto'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'projects', 'gatherbrain'), { recursive: true });
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(
      await completeEntry(':peek Al', state),
      [['/people/Alex'], 'Al']
    );
    assert.deepEqual(
      await completeEntry(':peek al', state),
      [['/people/Alex'], 'al']
    );
    assert.deepEqual(
      await completeEntry(':peek sis', state),
      [['/people/Mike Sisto'], 'sis']
    );
    assert.deepEqual(
      await completeEntry(':peek ', state),
      [['/people', '/people/Alex', '/people/Mike Sisto', '/projects', '/projects/gatherbrain'], '']
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('completes :relate context folder names', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, 'people', 'Mike Sisto'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'people', 'Sis Project'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'people', 'Steve Ma'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'projects', 'gatherbrain'), { recursive: true });
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(
      await completeEntry(':relate 1 Steve', state),
      [['/people/Steve Ma'], 'Steve']
    );
    assert.deepEqual(
      await completeEntry(':relate 1 steve', state),
      [['/people/Steve Ma'], 'steve']
    );
    assert.deepEqual(
      await completeEntry(':relate 1 sis', state),
      [['/people/Sis Project', '/people/Mike Sisto'], 'sis']
    );
    assert.deepEqual(
      await completeEntry(':relate 1 /people/S', state),
      [['/people/Sis Project', '/people/Steve Ma'], '/people/S']
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('completes context mentions in fact text', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, 'people', 'Mike Sisto'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'people', 'Sis Project'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'people', 'Steve Ma'), { recursive: true });
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(
      await completeEntry('Talk to @St', state),
      [['@/people/Steve Ma'], '@St']
    );
    assert.deepEqual(
      await completeEntry('Talk to @st', state),
      [['@/people/Steve Ma'], '@st']
    );
    assert.deepEqual(
      await completeEntry('Talk to @sis', state),
      [['@/people/Sis Project', '@/people/Mike Sisto'], '@sis']
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('does not complete slash commands', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(await completeEntry('/s', state), [[], '/s']);
    assert.deepEqual(await completeEntry('/g', state), [[], '/g']);
    assert.deepEqual(await completeEntry('regular fact', state), [[], 'regular fact']);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('completes colon command names', async () => {
  const state = createPromptState({
    appDirectory: path.join(tmpdir(), 'gatherbrain-app'),
    rootDirectory: path.join(tmpdir(), 'gatherbrain-app', 'facts')
  });

  assert.deepEqual(await completeEntry(':sw', state), [[':switch '], ':sw']);
  assert.deepEqual(await completeEntry(':SW', state), [[':switch '], ':SW']);
  assert.deepEqual(
    await completeEntry(':', state),
    [[
      ':switch ',
      ':peek ',
      ':clear-peek ',
      ':lens ',
      ':new ',
      ':edit ',
      ':open ',
      ':delete ',
      ':relate ',
      ':move ',
      ':type ',
      ':due ',
      ':paste ',
      ':plan ',
      ':cancel ',
      ':now ',
      ':restart '
    ], ':']
  );
});

test('completes named command arguments', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, 'people', 'Steve Ma'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'projects', 'gatherbrain'), { recursive: true });
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(
      await completeEntry(':switch gather', state),
      [['/projects/gatherbrain'], 'gather']
    );
    assert.deepEqual(
      await completeEntry(':peek Steve', state),
      [['/people/Steve Ma'], 'Steve']
    );
    assert.deepEqual(
      await completeEntry(':plan 9 gather', state),
      [['/projects/gatherbrain'], 'gather']
    );
    assert.deepEqual(
      await completeEntry(':relate 1 /people/S', state),
      [['/people/Steve Ma'], '/people/S']
    );
    assert.deepEqual(
      await completeEntry(':move 1 /people/S', state),
      [['/people/Steve Ma'], '/people/S']
    );
    assert.deepEqual(
      await completeEntry('1 d', state),
      [['done'], 'd']
    );
    assert.deepEqual(
      await completeEntry('1 to', state),
      [['todo', 'today', 'tomorrow'], 'to']
    );
    assert.deepEqual(
      await completeEntry('1 /people/S', state),
      [['/people/Steve Ma'], '/people/S']
    );
    assert.deepEqual(
      await completeEntry(':lens t', state),
      [['todo', 'today'], 't']
    );
    assert.deepEqual(
      await completeEntry(':LENS T', state),
      [['todo', 'today'], 'T']
    );
    assert.deepEqual(
      await completeEntry(':type 1 wa', state),
      [['waiting'], 'wa']
    );
    assert.deepEqual(
      await completeEntry(':type 1 WA', state),
      [['waiting'], 'WA']
    );
    assert.deepEqual(
      await completeEntry('.', state),
      [['.fact ', '.todo ', '.waiting ', '.in progress ', '.done '], '.']
    );
    assert.deepEqual(
      await completeEntry('.d', state),
      [['.done '], '.d']
    );
    assert.deepEqual(
      await completeEntry('%', state),
      [['%fact ', '%todo ', '%waiting ', '%in progress ', '%done '], '%']
    );
    assert.deepEqual(
      await completeEntry('%t', state),
      [['%todo '], '%t']
    );
    assert.deepEqual(
      await completeEntry('%in', state),
      [['%in progress '], '%in']
    );

    state.lensRegistry = createLensRegistry([
      {
        id: 'tasks',
        presenter: 'context_facts',
        filter: {
          types: ['todo']
        }
      }
    ]);
    assert.deepEqual(
      await completeEntry(':lens ta', state),
      [['tasks'], 'ta']
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('completes fact arguments by visible fact title', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await handleEntry('Call Steve', state);
    await handleEntry('Email Alex', state);
    await handleEntry('Steve Call', state);
    await handleEntry('Feed the cat', state);

    assert.deepEqual(
      await completeEntry(':edit Cal', state),
      [['Call Steve', 'Steve Call'], 'Cal']
    );
    assert.deepEqual(
      await completeEntry(':edit Ste', state),
      [['Steve Call', 'Call Steve'], 'Ste']
    );
    assert.deepEqual(
      await completeEntry(':edit cal', state),
      [['Call Steve', 'Steve Call'], 'cal']
    );
    assert.deepEqual(
      await completeEntry(':delete Email', state),
      [['Email Alex'], 'Email']
    );
    assert.deepEqual(
      await completeEntry(':delete feed the', state),
      [['Feed the cat'], 'feed the']
    );
    assert.deepEqual(
      await completeEntry(':type Cal', state),
      [['Call Steve', 'Steve Call'], 'Cal']
    );
    assert.deepEqual(
      await completeEntry(':type Feed the', state),
      [['Feed the cat'], 'Feed the']
    );
    assert.deepEqual(
      await completeEntry(':type Call Steve in', state),
      [['in progress'], 'in']
    );
    assert.deepEqual(
      await completeEntry(':due Call Steve to', state),
      [['today', 'tomorrow'], 'to']
    );
    assert.deepEqual(
      await completeEntry('.done Cal', state),
      [['Call Steve', 'Steve Call'], 'Cal']
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('completes prompted fact arguments by visible fact title', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await handleEntry('Call Steve', state);
    await handleEntry('Email Alex', state);

    assert.deepEqual(await handleEntry(':edit', state), {
      action: 'continue',
      message: 'Edit which fact?'
    });
    assert.deepEqual(
      await completeEntry('Email', state),
      [['Email Alex'], 'Email']
    );
    assert.deepEqual(
      await completeEntry('email', state),
      [['Email Alex'], 'email']
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('executes commands with fact titles completed as final arguments', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await handleEntry('Call Steve', state);

    assert.deepEqual(await handleEntry(':type Call Steve task', state), {
      action: 'continue',
      message: 'set item Call Steve type to task'
    });
    assert.deepEqual(
      (await visibleFactsForState(state)).map((fact) => ({
        title: fact.title,
        type: fact.type
      })),
      [
        {
          title: 'Call Steve',
          type: 'task'
        }
      ]
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('readline completer returns :switch completions', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, 'my-cool-project'), { recursive: true });
    const state = createPromptState({ appDirectory, rootDirectory });
    const completer = createReadlineCompleter(state);

    assert.deepEqual(await completer(':switch my'), [['/my-cool-project'], 'my']);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('reloads workspace command and lens configuration', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, '.gatherbrain'), { recursive: true });
    const state = createPromptState({ appDirectory, rootDirectory });

    assert.deepEqual(await completeEntry(':ju', state), [[], ':ju']);

    await writeFile(
      path.join(rootDirectory, '.gatherbrain', 'commands.json'),
      JSON.stringify({
        commands: [
          {
            name: 'jump',
            action: 'switch_context',
            arguments: [
              {
                name: 'context',
                type: 'context',
                consume: 'rest',
                prompt: 'Jump where?'
              }
            ]
          }
        ]
      })
    );
    await writeFile(
      path.join(rootDirectory, '.gatherbrain', 'lenses.json'),
      JSON.stringify({
        lenses: [
          {
            id: 'tasks',
            presenter: 'context_facts',
            template: 'facts',
            filter: {
              types: ['todo']
            }
          }
        ]
      })
    );

    await reloadWorkspaceConfig(state);

    assert.deepEqual(await completeEntry(':ju', state), [[':jump '], ':ju']);
    assert.deepEqual(await completeEntry(':lens ta', state), [['tasks'], 'ta']);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('reloads workspace-local templates', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-app-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    await mkdir(path.join(rootDirectory, '.gatherbrain', 'templates'), { recursive: true });
    const templatePath = path.join(rootDirectory, '.gatherbrain', 'templates', 'compact.hbs');
    const state = createPromptState({ appDirectory, rootDirectory });
    const body = {
      type: 'facts',
      template: 'compact',
      facts: [{ type: 'fact', title: 'First fact', text: 'First fact.' }]
    };

    await writeFile(templatePath, '{{#each facts}}OLD {{body}}{{/each}}');
    assert.deepEqual(
      buildTuiLines({ state, body, rows: 5, columns: 80 }).at(2),
      'OLD First fact. [1]'
    );

    await writeFile(templatePath, '{{#each facts}}NEW {{body}}{{/each}}');
    await reloadWorkspaceConfig(state);

    assert.deepEqual(
      buildTuiLines({ state, body, rows: 5, columns: 80 }).at(2),
      'NEW First fact. [1]'
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});
