import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderTemplate,
  renderTemplateLines
} from '../src/templates.js';

test('renders default facts template', () => {
  assert.equal(
    renderTemplate('facts', {
      emptyText: 'No facts yet.',
      facts: [
        { number: ' 1', type: '', body: 'First fact.' },
        { number: ' 2', type: 'task', body: 'Second fact.' }
      ],
      hasFacts: true,
      includeColor: false
    }),
    ' 1. First fact.\n 2. task Second fact.'
  );
});

test('default facts template prefers body over title', () => {
  assert.equal(
    renderTemplate('facts', {
      emptyText: 'No facts yet.',
      facts: [
        { number: ' 1', type: '', title: 'Title fallback', body: 'Body first.' }
      ],
      hasFacts: true,
      includeColor: false
    }),
    ' 1. Body first.'
  );
});

test('renders template lines', () => {
  assert.deepEqual(
    renderTemplateLines('facts', {
      emptyText: 'No facts yet.',
      facts: [
        { number: ' 1', type: '', body: 'First fact.' },
        { number: ' 2', type: 'task', body: 'Second fact.' }
      ],
      hasFacts: true,
      includeColor: false
    }),
    [' 1. First fact.', ' 2. task Second fact.']
  );
});

test('supports color filters in templates', () => {
  assert.equal(
    renderTemplate('facts', {
      emptyText: 'No facts yet.',
      facts: [
        { number: ' 1', type: 'task', body: 'Second fact.' }
      ],
      hasFacts: true,
      includeColor: true
    }),
    ' 1. \x1b[36mtask\x1b[39m Second fact.'
  );
});

test('renders child context source names in default facts template', () => {
  assert.equal(
    renderTemplate('facts', {
      emptyText: 'No facts yet.',
      facts: [
        {
          number: ' 1',
          type: '',
          sourceContext: 'people/Steve Ma/reports',
          sourceContextShort: 'reports',
          body: 'Child fact.'
        }
      ],
      hasFacts: true,
      includeColor: true
    }),
    ' 1. \x1b[34mreports\x1b[39m Child fact.'
  );
});

test('renders empty facts template', () => {
  assert.deepEqual(
    renderTemplateLines('facts', {
      emptyText: 'No facts yet.',
      facts: [],
      hasFacts: false,
      includeColor: false
    }),
    ['No facts yet.']
  );
});

test('renders workspace-local templates', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-templates-'));

  try {
    await mkdir(path.join(rootDirectory, '.gatherbrain', 'templates'), { recursive: true });
    await writeFile(
      path.join(rootDirectory, '.gatherbrain', 'templates', 'compact.hbs'),
      '{{#each facts}}{{number}}|{{body}}{{#unless @last}}\n{{/unless}}{{/each}}'
    );

    assert.equal(
      renderTemplate('compact', {
        emptyText: 'No facts yet.',
        facts: [
          { number: ' 1', type: '', body: 'First fact.' }
        ],
        hasFacts: true,
        includeColor: false
      }, {
        rootDirectory
      }),
      ' 1|First fact.'
    );
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test('workspace-local templates override default templates', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-templates-'));

  try {
    await mkdir(path.join(rootDirectory, '.gatherbrain', 'templates'), { recursive: true });
    await writeFile(
      path.join(rootDirectory, '.gatherbrain', 'templates', 'facts.hbs'),
      '{{#if hasFacts}}LOCAL {{#each facts}}{{body}}{{/each}}{{else}}{{emptyText}}{{/if}}'
    );

    assert.equal(
      renderTemplate('facts', {
        emptyText: 'No facts yet.',
        facts: [
          { number: ' 1', type: '', body: 'First fact.' }
        ],
        hasFacts: true,
        includeColor: false
      }, {
        rootDirectory
      }),
      'LOCAL First fact.'
    );
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test('rejects unsupported template names', () => {
  assert.throws(
    () => renderTemplate('../facts', {
      emptyText: 'No facts yet.',
      facts: [],
      hasFacts: false,
      includeColor: false
    }),
    /unsupported template/
  );
});
