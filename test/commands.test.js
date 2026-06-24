import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commandHelp,
  commandHelpText,
  parseEntry
} from '../src/commands.js';

test('lists built-in command help', () => {
  assert.deepEqual(commandHelp(), [
    '/s <context>',
    '/g <context>',
    '/l <lens>',
    '/e <item>',
    '/d <item>',
    '/r <item> <context>',
    '/debug keys'
  ]);
  assert.equal(
    commandHelpText(),
    '/s <context> | /g <context> | /l <lens> | /e <item> | /d <item> | /r <item> <context> | /debug keys'
  );
});

test('parses control entries', () => {
  assert.deepEqual(parseEntry(''), { type: 'empty' });
  assert.deepEqual(parseEntry('   '), { type: 'empty' });
  assert.deepEqual(parseEntry(':q'), { type: 'quit' });
  assert.deepEqual(parseEntry('/'), { type: 'help' });
  assert.deepEqual(parseEntry('/debug keys'), { type: 'debug_keys' });
});

test('parses context and lens commands', () => {
  assert.deepEqual(parseEntry('/s people/alex'), {
    context: 'people/alex',
    type: 'switch_context'
  });
  assert.deepEqual(parseEntry('/s'), {
    message: 'usage: /s <context>',
    type: 'usage_error'
  });
  assert.deepEqual(parseEntry('/g people/alex'), {
    context: 'people/alex',
    type: 'change_gaze'
  });
  assert.deepEqual(parseEntry('/g'), {
    type: 'clear_gaze'
  });
  assert.deepEqual(parseEntry('/l todo'), {
    type: 'switch_lens',
    lens: 'todo'
  });
  assert.deepEqual(parseEntry('/l'), {
    message: 'usage: /l <lens>',
    type: 'usage_error'
  });
});

test('parses fact commands', () => {
  assert.deepEqual(parseEntry('/e 2'), {
    itemNumber: 2,
    type: 'edit_fact'
  });
  assert.deepEqual(parseEntry('/d 3'), {
    itemNumber: 3,
    type: 'delete_fact'
  });
  assert.deepEqual(parseEntry('/r 4 people/alex'), {
    contextReference: 'people/alex',
    itemNumber: 4,
    type: 'relate_fact'
  });
  assert.deepEqual(parseEntry('/r 4'), {
    message: 'usage: /r <item> <context>',
    type: 'usage_error'
  });
  assert.deepEqual(parseEntry(':done 5'), {
    factType: 'done',
    itemNumber: 5,
    type: 'set_fact_type'
  });
});

test('parses unknown commands and fact creation', () => {
  assert.deepEqual(parseEntry('/wat now'), {
    commandName: '/wat',
    type: 'unknown_command'
  });
  assert.deepEqual(parseEntry('Capture this fact.'), {
    title: 'Capture this fact.',
    type: 'create_fact'
  });
});
