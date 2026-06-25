import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
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
  assert.deepEqual(lensIds(), ['all', 'todo', 'due', 'today', 'current']);
  assert.equal(hasLens('all'), true);
  assert.equal(hasLens('todo'), true);
  assert.equal(hasLens('due'), true);
  assert.equal(hasLens('today'), true);
  assert.equal(hasLens('current'), true);
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

  assert.deepEqual(lensIds(registry), ['all', 'todo', 'due', 'today', 'current']);
  assert.equal(hasLens('all', registry), true);
  assert.equal(hasLens('todo', registry), true);
  assert.equal(hasLens('due', registry), true);
  assert.equal(hasLens('today', registry), true);
  assert.equal(hasLens('current', registry), true);
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
            template: 'facts',
            filter: {
              types: ['todo', 'waiting']
            }
          }
        ]
      })
    );

    const registry = await loadLensRegistry({ rootDirectory: directory });

    assert.deepEqual(lensIds(registry), ['all', 'todo', 'due', 'today', 'current', 'tasks']);
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
          displayRelationDirection: '<',
          displayRelations: ['projects'],
          text: 'Related fact.'
        },
        {
          displayRelationDirection: '>',
          displayRelations: ['app'],
          text: 'Direct fact.'
        }
      ]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('all lens presents newest-created facts first by default', () => {
  const directory = path.join(tmpdir(), 'gatherbrain-lenses');
  const model = {
    rootPath: directory,
    contexts: new Map([
      ['', {
        id: '',
        path: directory,
        name: 'gatherbrain-lenses',
        parentId: null,
        childContextIds: [],
        factIds: ['old.md', 'new.md']
      }]
    ]),
    facts: new Map([
      ['old.md', {
        id: 'old.md',
        path: path.join(directory, 'old.md'),
        contextId: '',
        filename: 'old.md',
        createdAt: '2026-06-24T12:00:00.000Z',
        modifiedAt: '2026-06-24T12:00:00.000Z',
        properties: {},
        title: 'Old',
        type: 'fact',
        text: 'Old.'
      }],
      ['new.md', {
        id: 'new.md',
        path: path.join(directory, 'new.md'),
        contextId: '',
        filename: 'new.md',
        createdAt: '2026-06-25T12:00:00.000Z',
        modifiedAt: '2026-06-25T12:00:00.000Z',
        properties: {},
        title: 'New',
        type: 'fact',
        text: 'New.'
      }]
    ])
  };

  const lensModel = presentLens({
    model,
    state: { currentContextDirectory: directory },
    lensId: 'all'
  });

  assert.deepEqual(
    lensModel.facts.map((fact) => fact.text),
    ['New.', 'Old.']
  );
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
      ['Todo.', 'Fact.']
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('due lens presents facts with due dates that are not done', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-lenses-'));

  try {
    await writeFile(path.join(directory, 'due-todo.md'), '---\ntype: todo\ndue: 2026-06-30\n---\n\nDue todo.\n');
    await writeFile(path.join(directory, 'due-fact.md'), '---\ntype: fact\ndue: 2026-07-01\n---\n\nDue fact.\n');
    await writeFile(path.join(directory, 'done.md'), '---\ntype: done\ndue: 2026-06-24\n---\n\nDone.\n');
    await writeFile(path.join(directory, 'undated.md'), '---\ntype: todo\n---\n\nUndated.\n');

    const model = await loadWorkspaceModel({ rootDirectory: directory });
    const lensModel = presentLens({
      model,
      state: { currentContextDirectory: directory },
      lensId: 'due'
    });

    assert.deepEqual(
      lensModel.facts.map((fact) => fact.text),
      ['Due fact.', 'Due todo.']
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('today lens presents overdue and due-today facts that are not done', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-lenses-'));

  try {
    await writeFile(path.join(directory, 'future.md'), '---\ntype: todo\ndue: 2026-06-25\n---\n\nFuture.\n');
    await writeFile(path.join(directory, 'overdue.md'), '---\ntype: todo\ndue: 2026-06-23\n---\n\nOverdue.\n');
    await writeFile(path.join(directory, 'today.md'), '---\ntype: todo\ndue: 2026-06-24\n---\n\nToday.\n');
    await writeFile(path.join(directory, 'done.md'), '---\ntype: done\ndue: 2026-06-24\n---\n\nDone.\n');

    const model = await loadWorkspaceModel({ rootDirectory: directory });
    const lensModel = presentLens({
      dateToday: new Date(2026, 5, 24, 12),
      model,
      state: { currentContextDirectory: directory },
      lensId: 'today'
    });

    assert.deepEqual(
      lensModel.facts.map((fact) => fact.text),
      ['Today.', 'Overdue.']
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('current lens includes today facts and done items modified today', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-lenses-'));
  const doneTodayPath = path.join(directory, 'done-today.md');
  const doneYesterdayPath = path.join(directory, 'done-yesterday.md');
  const modifiedToday = new Date(2026, 5, 24, 9);
  const modifiedYesterday = new Date(2026, 5, 23, 17);

  try {
    await writeFile(path.join(directory, 'today.md'), '---\ntype: todo\ndue: 2026-06-24\n---\n\nToday.\n');
    await writeFile(doneTodayPath, '---\ntype: done\ndue: 2026-06-20\n---\n\nDone today.\n');
    await writeFile(doneYesterdayPath, '---\ntype: done\ndue: 2026-06-20\n---\n\nDone yesterday.\n');
    await utimes(doneTodayPath, modifiedToday, modifiedToday);
    await utimes(doneYesterdayPath, modifiedYesterday, modifiedYesterday);

    const model = await loadWorkspaceModel({ rootDirectory: directory });
    const lensModel = presentLens({
      dateToday: new Date(2026, 5, 24, 12),
      model,
      state: { currentContextDirectory: directory },
      lensId: 'current'
    });

    assert.deepEqual(
      lensModel.facts.map((fact) => fact.text),
      ['Today.', 'Done today.']
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
      ['Waiting.', 'Todo.']
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('configured lenses can select a body template', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-lenses-'));

  try {
    await writeFile(path.join(directory, 'todo.md'), '---\ntype: todo\n---\n\nTodo.\n');

    const model = await loadWorkspaceModel({ rootDirectory: directory });
    const lensRegistry = createLensRegistry([
      {
        id: 'compact',
        presenter: 'context_facts',
        template: 'compact-facts'
      }
    ]);
    const lensModel = presentLens({
      lensId: 'compact',
      lensRegistry,
      model,
      state: { currentContextDirectory: directory }
    });

    assert.equal(lensModel.body.template, 'compact-facts');
    assert.deepEqual(
      lensModel.facts.map((fact) => fact.text),
      ['Todo.']
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects unsupported lens template names', () => {
  assert.throws(
    () => createLensRegistry([
      {
        id: 'bad',
        presenter: 'context_facts',
        template: '../facts'
      }
    ]),
    /unsupported lens template/
  );
});
