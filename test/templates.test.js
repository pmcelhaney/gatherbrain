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
        { number: ' 1', numberPrefix: ' 1.', numberSuffix: '[1]', type: '', display: 'First fact.', body: 'First fact. [1]' },
        {
          number: ' 2',
          numberPrefix: ' 2.',
          numberSuffix: '[2]',
          deletedMarker: '[deleted]',
          type: 'task',
          due: 'Friday',
          displaySeparator: true,
          display: 'Second fact.',
          body: 'Second fact. [2]'
        }
      ],
      hasFacts: true,
      includeColor: false
    }),
    ' 1. First fact.\n 2. [deleted] task Friday Second fact.'
  );
});

test('default facts template prefers body over title', () => {
  assert.equal(
    renderTemplate('facts', {
      emptyText: 'No facts yet.',
      facts: [
        { number: ' 1', numberPrefix: ' 1.', numberSuffix: '[1]', type: '', display: 'Title fallback', title: 'Title fallback', body: 'Body first. [1]' }
      ],
      hasFacts: true,
      includeColor: false
    }),
    ' 1. Title fallback'
  );
});

test('renders template lines', () => {
  assert.deepEqual(
    renderTemplateLines('facts', {
      emptyText: 'No facts yet.',
      facts: [
        { number: ' 1', numberPrefix: ' 1.', numberSuffix: '[1]', type: '', display: 'First fact.', body: 'First fact. [1]' },
        {
          number: ' 2',
          numberPrefix: ' 2.',
          numberSuffix: '[2]',
          type: 'task',
          displaySeparator: true,
          display: 'Second fact.',
          body: 'Second fact. [2]'
        }
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
        {
          number: ' 1',
          numberPrefix: '\x1b[2m 1.\x1b[22m',
          numberSuffix: '[1]',
          type: 'task',
          due: 'Friday',
          displaySeparator: true,
          display: 'Second fact.',
          body: `Second fact. \x1b[2m[1]\x1b[22m`
        }
      ],
      hasFacts: true,
      includeColor: true
    }),
    '\x1b[2m 1.\x1b[22m \x1b[36mtask\x1b[39m \x1b[35mFriday\x1b[39m Second fact.'
  );
});

test('renders child context source names in default facts template', () => {
  assert.equal(
    renderTemplate('facts', {
      emptyText: 'No facts yet.',
      facts: [
        {
          number: ' 1',
          numberPrefix: '\x1b[2m 1.\x1b[22m',
          numberSuffix: '[1]',
          type: '',
          sourceContext: 'people/Steve Ma/reports',
          sourceContextShort: 'reports',
          display: 'Child fact.',
          body: `Child fact. \x1b[2m[1]\x1b[22m`
        }
      ],
      hasFacts: true,
      includeColor: true
    }),
    '\x1b[2m 1.\x1b[22m \x1b[34mreports\x1b[39m Child fact.'
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
          { number: ' 1', numberSuffix: '[1]', type: '', body: 'First fact. [1]' }
        ],
        hasFacts: true,
        includeColor: false
      }, {
        rootDirectory
      }),
      ' 1|First fact. [1]'
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
          { number: ' 1', numberPrefix: ' 1.', numberSuffix: '[1]', type: '', display: 'First fact.', body: 'First fact. [1]' }
        ],
        hasFacts: true,
        includeColor: false
      }, {
        rootDirectory
      }),
      'LOCAL First fact. [1]'
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
