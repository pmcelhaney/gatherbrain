import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderTemplate,
  renderTemplateLines
} from '../src/templates.js';

test('renders default facts template', () => {
  assert.equal(
    renderTemplate('facts', {
      lines: [' 1. First fact.', ' 2. Second fact.']
    }),
    ' 1. First fact.\n 2. Second fact.'
  );
});

test('renders template lines', () => {
  assert.deepEqual(
    renderTemplateLines('facts', {
      lines: [' 1. First fact.', ' 2. Second fact.']
    }),
    [' 1. First fact.', ' 2. Second fact.']
  );
});

test('rejects unsupported template names', () => {
  assert.throws(
    () => renderTemplate('../facts', { lines: [] }),
    /unsupported template/
  );
});
