import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commandArguments,
  commandNames,
  commandHelp,
  commandHelpText,
  continuePromptedCommand,
  loadCommandRegistry,
  parseEntry,
  shortcutHelp
} from '../src/commands.js';

test('lists built-in command help', () => {
  assert.deepEqual(commandHelp(), [
    ':switch <context>',
    ':gaze <context>',
    ':clear-gaze',
    ':lens <lens>',
    ':edit <item>',
    ':delete <item>',
    ':relate <item> <context>',
    ':type <type> <item>'
  ]);
  assert.equal(
    commandHelpText(),
    ':switch <context> | :gaze <context> | :clear-gaze | :lens <lens> | :edit <item> | :delete <item> | :relate <item> <context> | :type <type> <item>'
  );
  assert.deepEqual(commandNames(), [
    'switch',
    'gaze',
    'clear-gaze',
    'lens',
    'edit',
    'delete',
    'relate',
    'type'
  ]);
  assert.deepEqual(shortcutHelp(), [
    '/s <context>',
    '/g <context>',
    '/l <lens>',
    '/e <item>',
    '/d <item>',
    '/r <item> <context>',
    '/debug keys'
  ]);
  assert.deepEqual(commandArguments('relate'), [
    { name: 'item', type: 'fact', prompt: 'Relate which fact?' },
    { name: 'context', type: 'context', consume: 'rest', prompt: 'Relate it to which context?' }
  ]);
  assert.equal(commandArguments('missing'), null);
});

test('parses control entries', () => {
  assert.deepEqual(parseEntry(''), { type: 'empty' });
  assert.deepEqual(parseEntry('   '), { type: 'empty' });
  assert.deepEqual(parseEntry(':q'), { type: 'quit' });
  assert.deepEqual(parseEntry('/'), { type: 'help' });
  assert.deepEqual(parseEntry(':help'), { type: 'help' });
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
  assert.deepEqual(parseEntry(':switch people/alex'), {
    context: 'people/alex',
    type: 'switch_context'
  });
  assert.deepEqual(parseEntry(':switch'), {
    type: 'prompt_command_argument',
    commandName: 'switch',
    values: {},
    argument: {
      name: 'context',
      type: 'context',
      consume: 'rest',
      prompt: 'Switch to which context?'
    },
    prompt: 'Switch to which context?'
  });
  assert.deepEqual(parseEntry(':gaze people/alex'), {
    context: 'people/alex',
    type: 'change_gaze'
  });
  assert.deepEqual(parseEntry(':clear-gaze'), {
    type: 'clear_gaze'
  });
  assert.deepEqual(parseEntry(':lens todo'), {
    lens: 'todo',
    type: 'switch_lens'
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
  assert.deepEqual(parseEntry(':edit 2'), {
    itemNumber: 2,
    type: 'edit_fact'
  });
  assert.deepEqual(parseEntry(':delete 3'), {
    itemNumber: 3,
    type: 'delete_fact'
  });
  assert.deepEqual(parseEntry(':relate 4 people/alex'), {
    contextReference: 'people/alex',
    itemNumber: 4,
    type: 'relate_fact'
  });
  assert.deepEqual(parseEntry(':type done 5'), {
    factType: 'done',
    itemNumber: 5,
    type: 'set_fact_type'
  });
  assert.deepEqual(parseEntry(':type done'), {
    type: 'prompt_command_argument',
    commandName: 'type',
    values: { type: 'done' },
    argument: {
      name: 'item',
      type: 'fact',
      prompt: 'Change which fact?'
    },
    prompt: 'Change which fact?'
  });
  assert.deepEqual(parseEntry(':type bad:type 5'), {
    message: 'usage: :type <type> <item>',
    type: 'usage_error'
  });
  assert.deepEqual(parseEntry(':edit 2 extra'), {
    message: 'usage: :edit <item>',
    type: 'usage_error'
  });
});

test('continues prompted commands', () => {
  const pendingType = parseEntry(':type done');

  assert.deepEqual(continuePromptedCommand(pendingType, '5'), {
    factType: 'done',
    itemNumber: 5,
    type: 'set_fact_type'
  });
  assert.deepEqual(continuePromptedCommand(parseEntry(':relate'), '4'), {
    type: 'prompt_command_argument',
    commandName: 'relate',
    values: { item: 4 },
    argument: {
      name: 'context',
      type: 'context',
      consume: 'rest',
      prompt: 'Relate it to which context?'
    },
    prompt: 'Relate it to which context?'
  });
  assert.deepEqual(continuePromptedCommand(continuePromptedCommand(parseEntry(':relate'), '4'), 'people/alex'), {
    contextReference: 'people/alex',
    itemNumber: 4,
    type: 'relate_fact'
  });
  assert.deepEqual(continuePromptedCommand(parseEntry(':edit'), 'nope'), {
    message: 'usage: :edit <item>',
    type: 'usage_error'
  });
});

test('loads workspace command definitions from config', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-commands-'));

  try {
    await mkdir(path.join(rootDirectory, '.gatherbrain'), { recursive: true });
    await writeFile(
      path.join(rootDirectory, '.gatherbrain', 'commands.json'),
      JSON.stringify({
        commands: [
          {
            name: 'jump',
            action: 'switch_context',
            arguments: [
              {
                name: 'context',
                type: 'context',
                consume: 'rest',
                prompt: 'Jump where?'
              }
            ]
          }
        ]
      })
    );

    const registry = await loadCommandRegistry({ rootDirectory });

    assert.deepEqual(commandNames(registry), ['jump']);
    assert.deepEqual(commandHelp(registry), [':jump <context>']);
    assert.deepEqual(parseEntry(':jump people/alex', registry), {
      context: 'people/alex',
      type: 'switch_context'
    });
    assert.deepEqual(parseEntry(':jump', registry), {
      type: 'prompt_command_argument',
      commandName: 'jump',
      values: {},
      argument: {
        name: 'context',
        type: 'context',
        consume: 'rest',
        prompt: 'Jump where?'
      },
      prompt: 'Jump where?'
    });
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test('parses unknown commands and fact creation', () => {
  assert.deepEqual(parseEntry('/wat now'), {
    commandName: '/wat',
    type: 'unknown_command'
  });
  assert.deepEqual(parseEntry(':wat now'), {
    commandName: ':wat',
    type: 'unknown_command'
  });
  assert.deepEqual(parseEntry(':done 5'), {
    commandName: ':done',
    type: 'unknown_command'
  });
  assert.deepEqual(parseEntry('Capture this fact.'), {
    title: 'Capture this fact.',
    type: 'create_fact'
  });
});
