import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkspaceModel } from '../src/model.js';
import {
  createLensRegistry,
  defaultLensId,
  filterFactsForLens,
  hasLens,
  loadLensRegistry,
  presentLens,
  lensIds
} from '../src/lenses.js';

test('exposes built-in lens ids', () => {
  assert.equal(defaultLensId, 'all');
  assert.deepEqual(lensIds(), ['all', 'todo']);
  assert.equal(hasLens('all'), true);
  assert.equal(hasLens('todo'), true);
  assert.equal(hasLens('missing'), false);
});

test('filters facts for the todo lens', () => {
  assert.deepEqual(
    filterFactsForLens([
      { type: 'fact', text: 'Fact' },
      { type: 'todo', text: 'Todo' },
      { type: 'waiting', text: 'Waiting' },
      { type: 'in progress', text: 'Doing' },
      { type: 'done', text: 'Done' }
    ], 'todo'),
    [
      { type: 'fact', text: 'Fact' },
      { type: 'todo', text: 'Todo' },
      { type: 'waiting', text: 'Waiting' },
      { type: 'in progress', text: 'Doing' }
    ]
  );
});

test('loads default lens definitions', async () => {
  const registry = await loadLensRegistry();

  assert.deepEqual(lensIds(registry), ['all', 'todo']);
  assert.equal(hasLens('all', registry), true);
  assert.equal(hasLens('todo', registry), true);
});

test('loads workspace lens definitions over defaults', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-lenses-'));

  try {
    await mkdir(path.join(directory, '.gatherbrain'), { recursive: true });
    await writeFile(
      path.join(directory, '.gatherbrain', 'lenses.json'),
      JSON.stringify({
        lenses: [
          {
            id: 'tasks',
            presenter: 'context_facts',
            filter: {
              types: ['todo', 'waiting']
            }
          }
        ]
      })
    );

    const registry = await loadLensRegistry({ rootDirectory: directory });

    assert.deepEqual(lensIds(registry), ['all', 'todo', 'tasks']);
    assert.equal(hasLens('tasks', registry), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('all lens presents direct and related facts for the active context', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-lenses-'));
  const activeContext = path.join(directory, 'people', 'Steve Ma');
  const relatedPath = path.join(directory, 'projects', 'related.md');

  try {
    await mkdir(activeContext, { recursive: true });
    await mkdir(path.dirname(relatedPath), { recursive: true });
    await writeFile(
      path.join(activeContext, 'direct.md'),
      '---\ntype: fact\nrelatedContexts: ["projects/app"]\n---\n\nDirect fact.\n'
    );
    await writeFile(
      relatedPath,
      '---\ntype: fact\nrelatedContexts: ["people/Steve Ma"]\n---\n\nRelated fact.\n'
    );
    await writeFile(
      path.join(directory, 'projects', 'unrelated.md'),
      '---\ntype: fact\n---\n\nUnrelated fact.\n'
    );

    const model = await loadWorkspaceModel({ rootDirectory: directory });
    const lensModel = presentLens({
      model,
      state: { currentContextDirectory: activeContext },
      lensId: 'all'
    });

    assert.deepEqual(lensModel.body, {
      type: 'facts',
      template: 'facts',
      facts: lensModel.facts
    });
    assert.deepEqual(
      lensModel.facts.map((fact) => ({
        displayRelationDirection: fact.displayRelationDirection,
        displayRelations: fact.displayRelations,
        text: fact.text
      })),
      [
        {
          displayRelationDirection: '>',
          displayRelations: ['app'],
          text: 'Direct fact.'
        },
        {
          displayRelationDirection: '<',
          displayRelations: ['projects'],
          text: 'Related fact.'
        }
      ]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('todo lens presents only todo-compatible facts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-lenses-'));

  try {
    await writeFile(path.join(directory, 'fact.md'), '---\ntype: fact\n---\n\nFact.\n');
    await writeFile(path.join(directory, 'todo.md'), '---\ntype: todo\n---\n\nTodo.\n');
    await writeFile(path.join(directory, 'done.md'), '---\ntype: done\n---\n\nDone.\n');

    const model = await loadWorkspaceModel({ rootDirectory: directory });
    const lensModel = presentLens({
      model,
      state: { currentContextDirectory: directory },
      lensId: 'todo'
    });

    assert.deepEqual(
      lensModel.facts.map((fact) => fact.text),
      ['Fact.', 'Todo.']
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('configured lens filters by front matter type', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-lenses-'));

  try {
    await writeFile(path.join(directory, 'todo.md'), '---\ntype: todo\n---\n\nTodo.\n');
    await writeFile(path.join(directory, 'waiting.md'), '---\ntype: waiting\n---\n\nWaiting.\n');
    await writeFile(path.join(directory, 'done.md'), '---\ntype: done\n---\n\nDone.\n');

    const model = await loadWorkspaceModel({ rootDirectory: directory });
    const lensRegistry = createLensRegistry([
      {
        id: 'tasks',
        presenter: 'context_facts',
        filter: {
          types: ['todo', 'waiting']
        }
      }
    ]);
    const lensModel = presentLens({
      lensId: 'tasks',
      lensRegistry,
      model,
      state: { currentContextDirectory: directory }
    });

    assert.deepEqual(
      lensModel.facts.map((fact) => fact.text),
      ['Todo.', 'Waiting.']
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
