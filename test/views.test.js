import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkspaceModel } from '../src/model.js';
import {
  defaultViewId,
  filterFactsForView,
  hasView,
  presentView,
  viewIds
} from '../src/views.js';

test('exposes built-in view ids', () => {
  assert.equal(defaultViewId, 'all');
  assert.deepEqual(viewIds(), ['all', 'todo']);
  assert.equal(hasView('all'), true);
  assert.equal(hasView('todo'), true);
  assert.equal(hasView('missing'), false);
});

test('filters facts for the todo view', () => {
  assert.deepEqual(
    filterFactsForView([
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

test('all view presents direct and related facts for the active context', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-views-'));
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
    const viewModel = presentView({
      model,
      state: { currentContextDirectory: activeContext },
      viewId: 'all'
    });

    assert.deepEqual(
      viewModel.facts.map((fact) => ({
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

test('todo view presents only todo-compatible facts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-views-'));

  try {
    await writeFile(path.join(directory, 'fact.md'), '---\ntype: fact\n---\n\nFact.\n');
    await writeFile(path.join(directory, 'todo.md'), '---\ntype: todo\n---\n\nTodo.\n');
    await writeFile(path.join(directory, 'done.md'), '---\ntype: done\n---\n\nDone.\n');

    const model = await loadWorkspaceModel({ rootDirectory: directory });
    const viewModel = presentView({
      model,
      state: { currentContextDirectory: directory },
      viewId: 'todo'
    });

    assert.deepEqual(
      viewModel.facts.map((fact) => fact.text),
      ['Fact.', 'Todo.']
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
