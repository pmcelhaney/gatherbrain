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
