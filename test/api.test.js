import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addWorkspaceEnumValue,
  contextDirectoryForSwitchReference,
  contextHasHiddenPathPart,
  contextIdForDirectory,
  createContext,
  createFact,
  deleteWorkspaceFact,
  ensureWorkspaceModel,
  referencedFilePathForFact,
  relateWorkspaceFact,
  resolveExistingSwitchContextDirectory,
  setWorkspaceFactProperty,
  setWorkspaceFactType
} from '../src/api.js';
import { enumValues, loadEnumRegistry } from '../src/enums.js';
import { createPromptState } from '../src/index.js';

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
      await readFile(savedFact.path, 'utf8'),
      '---\ntitle: "Call Steve"\ntype: todo\n---\n\nCall Steve\n'
    );
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

    assert.equal(await relateWorkspaceFact(state, fact, 'Steve Ma'), 'people/Steve Ma');
    assert.deepEqual(state.model.facts.get('ask-steve.md').relations, ['people/Steve Ma']);

    await deleteWorkspaceFact(state, fact);
    assert.equal(state.model.facts.has('ask-steve.md'), false);
    assert.equal(
      await readFile(path.join(rootDirectory, '.trash', 'ask-steve.md'), 'utf8'),
      '---\ntitle: "Ask Steve"\ntype: waiting\ndue: 2026-07-04\nrelatedContexts: ["people/Steve Ma"]\n---\n\nAsk Steve\n'
    );
    assert.equal(savedFact.relativePath, path.join('facts', 'ask-steve.md'));
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
