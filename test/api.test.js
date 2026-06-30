import { access, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addWorkspaceEnumValue,
  allFacts,
  contextDirectoryForSwitchReference,
  contextHasHiddenPathPart,
  contextIdForDirectory,
  contextMetadata,
  createContext,
  createFact,
  currentFacts,
  deleteWorkspaceFact,
  dueFacts,
  ensureWorkspaceModel,
  factsByType,
  factsInContext,
  moveWorkspaceFact,
  referencedFilePathForFact,
  recentFacts,
  relatedFacts,
  relateWorkspaceFact,
  resolveExistingSwitchContextDirectory,
  setWorkspaceFactProperty,
  setWorkspaceFactType,
  todayFacts,
  visibleFacts
} from '../src/api.js';
import { enumValues, loadEnumRegistry } from '../src/enums.js';
import { eventLogFilePath } from '../src/events.js';
import { createPromptState } from '../src/index.js';

function factIds(facts) {
  return facts.map((fact) => fact.id);
}

function markdownWithoutFactUuid(markdown) {
  return markdown.replace(/^id: [0-9a-f-]+\n/mu, '');
}

test('creates facts and refreshes the workspace model', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-api-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    const savedFact = await createFact(state, {
      title: 'Call Steve',
      type: 'todo'
    });

    assert.deepEqual(savedFact, {
      path: path.join(rootDirectory, 'call-steve.md'),
      relativePath: path.join('facts', 'call-steve.md')
    });
    assert.equal(
      markdownWithoutFactUuid(await readFile(savedFact.path, 'utf8')),
      '---\ntitle: "Call Steve"\ntype: todo\n---\n\nCall Steve\n'
    );
    assert.match(state.model.facts.get('call-steve.md').uuid, /^[0-9a-f-]{36}$/u);
    assert.equal(state.model.facts.get('call-steve.md').type, 'todo');
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('creates contexts and resolves unix-like switch references', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-api-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await createContext(state, path.join(rootDirectory, 'projects', 'gatherbrain'));
    state.currentContextDirectory = path.join(rootDirectory, 'projects', 'gatherbrain');

    assert.equal(
      contextIdForDirectory(state, state.currentContextDirectory),
      'projects/gatherbrain'
    );
    assert.equal(
      contextDirectoryForSwitchReference('../people', state),
      path.join(rootDirectory, 'projects', 'people')
    );

    await createContext(state, path.join(rootDirectory, 'projects', 'people'));
    assert.equal(
      await resolveExistingSwitchContextDirectory('../people', state),
      path.join(rootDirectory, 'projects', 'people')
    );
    assert.equal(contextHasHiddenPathPart(path.join(rootDirectory, '.hidden'), state), true);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('does not create contexts with duplicate directory names', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-api-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await createContext(state, path.join(rootDirectory, 'people', 'Redis'));

    await assert.rejects(
      createContext(state, path.join(rootDirectory, 'vendors', 'redis')),
      /context directory name redis already exists at \/people\/Redis/u
    );
    await assert.rejects(access(path.join(rootDirectory, 'vendors')), { code: 'ENOENT' });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('mutates facts through the workspace API', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-api-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(path.join(rootDirectory, 'people', 'Steve Ma'), { recursive: true });
    await ensureWorkspaceModel(state);
    const savedFact = await createFact(state, {
      title: 'Ask Steve',
      type: 'fact'
    });
    const fact = state.model.facts.get('ask-steve.md');

    await setWorkspaceFactType(state, fact, 'waiting');
    await setWorkspaceFactProperty(state, fact, 'due', '2026-07-04');
    assert.equal(state.model.facts.get('ask-steve.md').type, 'waiting');
    assert.equal(state.model.facts.get('ask-steve.md').properties.due, '2026-07-04');

    assert.equal(await relateWorkspaceFact(state, fact, 'steve ma'), 'people/Steve Ma');
    assert.deepEqual(state.model.facts.get('ask-steve.md').relations, ['people/Steve Ma']);

    await deleteWorkspaceFact(state, fact);
    assert.equal(state.model.facts.has('ask-steve.md'), false);
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(rootDirectory, '.trash', 'ask-steve.md'), 'utf8')),
      '---\ntitle: "Ask Steve"\ntype: waiting\ndue: 2026-07-04\nrelatedContexts: ["people/Steve Ma"]\n---\n\nAsk Steve\n'
    );
    assert.equal(savedFact.relativePath, path.join('facts', 'ask-steve.md'));
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('moves facts through the workspace API and relates them to their source context', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-api-'));
  const rootDirectory = path.join(appDirectory, 'facts');
  const sourceContext = path.join(rootDirectory, 'source');
  const targetContext = path.join(rootDirectory, 'target');
  const factPath = path.join(sourceContext, 'ask-steve.md');

  try {
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      now: () => new Date('2026-06-27T13:14:15.016Z')
    });
    await mkdir(sourceContext, { recursive: true });
    await mkdir(targetContext, { recursive: true });
    await writeFile(
      factPath,
      '---\ntitle: "Ask Steve"\ntype: todo\n---\n\nAsk Steve\n'
    );
    await ensureWorkspaceModel(state);

    const fact = state.model.facts.get('source/ask-steve.md');
    const moved = await moveWorkspaceFact(state, fact, '/target');

    assert.equal(moved.toContextId, 'target');
    assert.equal(moved.path, path.join(targetContext, 'ask-steve.md'));
    assert.equal(state.model.facts.has('source/ask-steve.md'), false);
    assert.equal(state.model.facts.get('target/ask-steve.md').contextId, 'target');
    assert.deepEqual(state.model.facts.get('target/ask-steve.md').relations, ['source']);
    assert.equal(
      markdownWithoutFactUuid(await readFile(path.join(targetContext, 'ask-steve.md'), 'utf8')),
      '---\ntitle: "Ask Steve"\ntype: todo\nrelatedContexts: ["source"]\n---\n\nAsk Steve\n'
    );
    const eventRows = (await readFile(eventLogFilePath(rootDirectory, '2026-06-27'), 'utf8'))
      .trimEnd()
      .split('\n');
    const [timestamp, event, metadata] = eventRows.at(-1).split('\t');

    assert.equal(timestamp, '2026-06-27T13:14:15.016Z');
    assert.equal(event, 'fact.moved');
    assert.deepEqual(JSON.parse(metadata), {
      factId: 'source/ask-steve.md',
      newFactId: 'target/ask-steve.md',
      uuid: state.model.facts.get('target/ask-steve.md').uuid,
      fromContextId: 'source',
      toContextId: 'target',
      fromPath: factPath,
      toPath: path.join(targetContext, 'ask-steve.md')
    });
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('resolves referenced files and appends workspace enum values', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-api-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(rootDirectory, { recursive: true });
    const factPath = path.join(rootDirectory, 'pasted.md');
    await writeFile(
      factPath,
      '---\ntitle: Pasted\ntype: fact\nfile: pasted.png\n---\n\n'
    );
    state.model = await ensureWorkspaceModel(state);
    const fact = state.model.facts.get('pasted.md');

    assert.equal(referencedFilePathForFact(fact, '1'), path.join(rootDirectory, 'pasted.png'));
    assert.equal(await addWorkspaceEnumValue(state, 'factType', 'blocked'), 'blocked');

    const registry = await loadEnumRegistry({ rootDirectory });
    assert.deepEqual(enumValues('factType', registry), ['fact', 'todo', 'waiting', 'in progress', 'done', 'blocked']);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('reads facts from the workspace model for LLM-friendly queries', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-api-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(path.join(rootDirectory, 'projects', 'gatherbrain', 'child'), { recursive: true });
    await mkdir(path.join(rootDirectory, 'people', 'Steve Ma'), { recursive: true });
    await writeFile(
      path.join(rootDirectory, 'projects', 'gatherbrain', 'todo.md'),
      '---\ntitle: Todo\ntype: todo\ndue: 2026-06-26\n---\n\nTodo\n'
    );
    await writeFile(
      path.join(rootDirectory, 'projects', 'gatherbrain', 'child', 'done.md'),
      '---\ntitle: Done\ntype: done\ndue: 2026-06-20\n---\n\nDone\n'
    );
    await writeFile(
      path.join(rootDirectory, 'people', 'Steve Ma', 'waiting.md'),
      '---\ntitle: Waiting\ntype: waiting\nrelatedContexts: ["projects/gatherbrain"]\n---\n\nWaiting\n'
    );
    await writeFile(
      path.join(rootDirectory, 'people', 'Steve Ma', 'fact.md'),
      '---\ntitle: Person Fact\ntype: fact\n---\n\nPerson Fact\n'
    );
    await utimes(
      path.join(rootDirectory, 'projects', 'gatherbrain', 'child', 'done.md'),
      new Date('2026-06-26T12:00:00Z'),
      new Date('2026-06-26T12:00:00Z')
    );
    await ensureWorkspaceModel(state);
    state.currentContextDirectory = path.join(rootDirectory, 'projects', 'gatherbrain');
    state.currentLensId = 'todo';

    assert.deepEqual(
      factIds(await factsInContext(state, { contextId: 'projects/gatherbrain' })).sort(),
      [
        'projects/gatherbrain/child/done.md',
        'projects/gatherbrain/todo.md'
      ]
    );
    assert.deepEqual(
      factIds(await relatedFacts(state, 'projects/gatherbrain')),
      ['people/Steve Ma/waiting.md']
    );
    assert.deepEqual(
      factIds(await factsByType(state, ['todo', 'waiting'])).sort(),
      [
        'people/Steve Ma/waiting.md',
        'projects/gatherbrain/todo.md'
      ]
    );
    assert.equal((await allFacts(state)).length, 4);
    assert.equal((await recentFacts(state, { limit: 2 })).length, 2);
    assert.deepEqual(
      factIds(await dueFacts(state, {
        contextId: 'projects/gatherbrain',
        includeRelated: true
      })).sort(),
      ['projects/gatherbrain/todo.md']
    );
    assert.deepEqual(
      factIds(await todayFacts(state, {
        contextId: 'projects/gatherbrain',
        includeRelated: true,
        today: new Date('2026-06-26T09:00:00Z')
      })),
      ['projects/gatherbrain/todo.md']
    );
    assert.deepEqual(
      factIds(await currentFacts(state, {
        contextId: 'projects/gatherbrain',
        today: new Date('2026-06-26T09:00:00Z')
      })).sort(),
      [
        'projects/gatherbrain/child/done.md',
        'projects/gatherbrain/todo.md'
      ]
    );
    assert.deepEqual(
      factIds(await visibleFacts(state)).sort(),
      [
        'people/Steve Ma/waiting.md',
        'projects/gatherbrain/todo.md'
      ]
    );
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});

test('reads context metadata through the workspace API', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-api-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({ appDirectory, rootDirectory });
    await mkdir(path.join(rootDirectory, 'projects', 'gatherbrain'), { recursive: true });
    await writeFile(
      path.join(rootDirectory, 'projects', 'gatherbrain', 'index.md'),
      '---\ntitle: Gatherbrain\ndefaultLens: current\n---\n\nProject scope.\n'
    );
    await ensureWorkspaceModel(state);
    const metadata = await contextMetadata(state, 'projects/gatherbrain');

    assert.deepEqual(metadata, {
      id: 'projects/gatherbrain/index.md',
      path: path.join(rootDirectory, 'projects', 'gatherbrain', 'index.md'),
      contextId: 'projects/gatherbrain',
      filename: 'projects/gatherbrain/index.md',
      aliases: [],
      createdAt: metadata.createdAt,
      modifiedAt: metadata.modifiedAt,
      properties: {
        defaultLens: 'current'
      },
      title: 'Gatherbrain',
      type: 'context',
      text: 'Project scope.'
    });
    assert.equal(await contextMetadata(state, 'missing'), null);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});
