import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFactMarkdown } from '../src/facts.js';
import {
  loadWorkspaceModel,
  refreshContext,
  refreshFact,
  removeFact,
  watchWorkspaceModel
} from '../src/model.js';

test('loads contexts and facts with workspace-relative ids', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-model-'));

  try {
    await mkdir(path.join(directory, 'people', 'alex'), { recursive: true });
    await writeFile(
      path.join(directory, 'people', 'alex', 'follow-up.md'),
      '---\ntitle: Follow up\ntype: task\nrelatedContexts: ["projects/app"]\n---\n\nSend the notes.\n'
    );

    const model = await loadWorkspaceModel({ rootDirectory: directory });

    assert.equal(model.rootPath, directory);
    assert.deepEqual([...model.contexts.keys()].sort(), ['', 'people', 'people/alex']);
    assert.deepEqual(model.contexts.get('').childContextIds, ['people']);
    assert.deepEqual(model.contexts.get('people').childContextIds, ['people/alex']);
    assert.deepEqual(model.contexts.get('people/alex').factIds, ['people/alex/follow-up.md']);
    const fact = model.facts.get('people/alex/follow-up.md');

    assert.match(fact.createdAt, /^\d{4}-\d{2}-\d{2}T/u);
    assert.match(fact.modifiedAt, /^\d{4}-\d{2}-\d{2}T/u);
    assert.match(fact.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    assert.deepEqual(fact, {
      id: 'people/alex/follow-up.md',
      path: path.join(directory, 'people', 'alex', 'follow-up.md'),
      contextId: 'people/alex',
      filename: 'people/alex/follow-up.md',
      createdAt: fact.createdAt,
      modifiedAt: fact.modifiedAt,
      properties: {},
      uuid: fact.uuid,
      relations: ['projects/app'],
      title: 'Follow up',
      type: 'task',
      text: 'Send the notes.'
    });
    assert.match(
      await readFile(path.join(directory, 'people', 'alex', 'follow-up.md'), 'utf8'),
      /^---\ntitle: Follow up\ntype: task\nrelatedContexts: \["projects\/app"\]\nid: [0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\n---\n\nSend the notes\.\n$/u
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('loads front matter properties and modified timestamps', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-model-'));
  const factPath = path.join(directory, 'due.md');
  const modifiedAt = new Date(2026, 5, 24, 9);

  try {
    await writeFile(
      factPath,
      '---\ntitle: Due fact\ntype: todo\ndue: 2026-06-24\npriority: high\n---\n\nDue today.\n'
    );
    await utimes(factPath, modifiedAt, modifiedAt);

    const model = await loadWorkspaceModel({ rootDirectory: directory });
    const fact = model.facts.get('due.md');

    assert.match(fact.createdAt, /^\d{4}-\d{2}-\d{2}T/u);
    assert.deepEqual(fact.properties, {
      due: '2026-06-24',
      priority: 'high'
    });
    assert.equal(fact.modifiedAt, modifiedAt.toISOString());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('loads index markdown as context metadata instead of facts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-model-'));

  try {
    await mkdir(path.join(directory, 'projects', 'gatherbrain'), { recursive: true });
    await writeFile(
      path.join(directory, 'index.md'),
      '---\ntitle: Workspace\ntype: context\nowner: Robin\n---\n\nRoot scope.\n'
    );
    await writeFile(
      path.join(directory, 'projects', 'gatherbrain', 'index.md'),
      '---\ntitle: Gatherbrain\ndefaultLens: current\naliases: [gb]\n---\n\nProject scope.\n'
    );
    await writeFile(
      path.join(directory, 'projects', 'gatherbrain', 'fact.md'),
      buildFactMarkdown('Project fact')
    );

    const model = await loadWorkspaceModel({ rootDirectory: directory });
    const rootContext = model.contexts.get('');
    const projectContext = model.contexts.get('projects/gatherbrain');

    assert.deepEqual([...model.facts.keys()], ['projects/gatherbrain/fact.md']);
    assert.deepEqual(rootContext.factIds, []);
    assert.deepEqual(projectContext.factIds, ['projects/gatherbrain/fact.md']);
    assert.deepEqual(rootContext.metadata, {
      id: 'index.md',
      path: path.join(directory, 'index.md'),
      contextId: '',
      filename: 'index.md',
      aliases: [],
      createdAt: rootContext.metadata.createdAt,
      modifiedAt: rootContext.metadata.modifiedAt,
      properties: {
        owner: 'Robin'
      },
      title: 'Workspace',
      type: 'context',
      text: 'Root scope.'
    });
    assert.deepEqual(projectContext.metadata, {
      id: 'projects/gatherbrain/index.md',
      path: path.join(directory, 'projects', 'gatherbrain', 'index.md'),
      contextId: 'projects/gatherbrain',
      filename: 'projects/gatherbrain/index.md',
      aliases: ['gb'],
      createdAt: projectContext.metadata.createdAt,
      modifiedAt: projectContext.metadata.modifiedAt,
      properties: {
        defaultLens: 'current'
      },
      title: 'Gatherbrain',
      type: 'context',
      text: 'Project scope.'
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('ignores hidden directories when loading model', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-model-'));

  try {
    await mkdir(path.join(directory, '.trash'), { recursive: true });
    await mkdir(path.join(directory, '.gatherbrain'), { recursive: true });
    await mkdir(path.join(directory, '.hidden', 'deep'), { recursive: true });
    await mkdir(path.join(directory, 'visible'), { recursive: true });
    await writeFile(path.join(directory, '.trash', 'trashed.md'), buildFactMarkdown('Trashed'));
    await writeFile(path.join(directory, '.hidden', 'hidden.md'), buildFactMarkdown('Hidden'));
    await writeFile(path.join(directory, 'visible', 'fact.md'), buildFactMarkdown('Visible'));

    const model = await loadWorkspaceModel({ rootDirectory: directory });

    assert.deepEqual([...model.contexts.keys()].sort(), ['', 'visible']);
    assert.deepEqual([...model.facts.keys()], ['visible/fact.md']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects duplicate context directory names case-insensitively', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-model-'));

  try {
    await mkdir(path.join(directory, 'people', 'Redis'), { recursive: true });
    await mkdir(path.join(directory, 'vendors', 'redis'), { recursive: true });

    await assert.rejects(
      loadWorkspaceModel({ rootDirectory: directory }),
      /duplicate context directory name "redis": \/people\/Redis, \/vendors\/redis/u
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('refreshes and removes facts in an existing model', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-model-'));
  const factPath = path.join(directory, 'fact.md');

  try {
    await writeFile(factPath, buildFactMarkdown('Original'));
    const model = await loadWorkspaceModel({ rootDirectory: directory });

    await writeFile(factPath, buildFactMarkdown('Updated', { type: 'task' }));
    await refreshFact(model, factPath);

    assert.equal(model.facts.get('fact.md').title, 'Updated');
    assert.equal(model.facts.get('fact.md').type, 'task');

    removeFact(model, factPath);
    assert.equal(model.facts.has('fact.md'), false);
    assert.deepEqual(model.contexts.get('').factIds, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('refreshes a context by reloading the workspace model', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-model-'));

  try {
    const model = await loadWorkspaceModel({ rootDirectory: directory });
    await mkdir(path.join(directory, 'new-context'), { recursive: true });
    await writeFile(path.join(directory, 'new-context', 'new-fact.md'), buildFactMarkdown('New fact'));

    const refreshedContext = await refreshContext(model, path.join(directory, 'new-context'));

    assert.equal(refreshedContext.id, 'new-context');
    assert.deepEqual(model.contexts.get('new-context').factIds, ['new-context/new-fact.md']);
    assert.equal(model.facts.get('new-context/new-fact.md').title, 'New fact');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('watches model context directories and refreshes after visible changes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-model-'));
  const callbacks = new Map();

  function watchFunction(watchedPath, _options, callback) {
    callbacks.set(watchedPath, callback);

    return {
      close() {
        callbacks.delete(watchedPath);
      },
      on() {}
    };
  }

  try {
    await mkdir(path.join(directory, 'people'), { recursive: true });
    const model = await loadWorkspaceModel({ rootDirectory: directory });
    let changedModel = null;
    const changed = new Promise((resolve, reject) => {
      const watcher = watchWorkspaceModel(model, {
        debounceMs: 0,
        watchFunction,
        onChange(nextModel) {
          changedModel = nextModel;
          watcher.close();
          resolve();
        },
        onError: reject
      });
    });

    assert.equal(callbacks.has(directory), true);
    assert.equal(callbacks.has(path.join(directory, 'people')), true);

    await writeFile(path.join(directory, 'people', 'external.md'), buildFactMarkdown('External'));
    callbacks.get(path.join(directory, 'people'))('rename', 'external.md');
    await changed;

    assert.equal(changedModel, model);
    assert.equal(model.facts.get('people/external.md').title, 'External');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('model watcher ignores hidden directory events', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-model-'));
  const callbacks = new Map();

  function watchFunction(watchedPath, _options, callback) {
    callbacks.set(watchedPath, callback);

    return {
      close() {
        callbacks.delete(watchedPath);
      },
      on() {}
    };
  }

  try {
    const model = await loadWorkspaceModel({ rootDirectory: directory });
    let changeCount = 0;
    const watcher = watchWorkspaceModel(model, {
      debounceMs: 0,
      watchFunction,
      onChange() {
        changeCount += 1;
      }
    });

    callbacks.get(directory)('rename', '.trash/ignored.md');
    await delay(10);
    watcher.close();

    assert.equal(changeCount, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('model watcher adds watchers for newly created contexts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-model-'));
  const callbacks = new Map();

  function watchFunction(watchedPath, _options, callback) {
    callbacks.set(watchedPath, callback);

    return {
      close() {
        callbacks.delete(watchedPath);
      },
      on() {}
    };
  }

  try {
    const model = await loadWorkspaceModel({ rootDirectory: directory });
    let watcher;
    const changed = new Promise((resolve, reject) => {
      watcher = watchWorkspaceModel(model, {
        debounceMs: 0,
        watchFunction,
        onChange() {
          resolve();
        },
        onError: reject
      });
    });

    await mkdir(path.join(directory, 'projects'), { recursive: true });
    callbacks.get(directory)('rename', 'projects');
    await changed;

    assert.equal(model.contexts.has('projects'), true);
    assert.equal(callbacks.has(path.join(directory, 'projects')), true);

    watcher.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
