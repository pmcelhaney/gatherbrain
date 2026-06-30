import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commandArgumentValues,
  commandArguments,
  commandNames,
  commandHelp,
  commandHelpText,
  continuePromptedCommand,
  createCommandRegistry,
  loadCommandRegistry,
  parseEntry
} from '../src/commands.js';
import { createEnumRegistry } from '../src/enums.js';

test('lists built-in command help', () => {
  assert.deepEqual(commandHelp(), [
    ':switch <context>',
    ':peek <context>',
    ':clear-peek',
    ':new-session <name>',
    ':lens <lens>',
    ':search <query>',
    ':proper-nouns',
    '<item> :edit',
    ':open | <item> :open',
    '<item> :delete',
    '<item> :move <context>',
    '<item> :gather',
    ':paste <title>',
    ':plan <range> <context>',
    ':cancel <range> <context>',
    ':now',
    ':restart'
  ]);
  assert.equal(
    commandHelpText(),
    ':switch <context> | :peek <context> | :clear-peek | :new-session <name> | :lens <lens> | :search <query> | :proper-nouns | <item> :edit | :open | <item> :open | <item> :delete | <item> :move <context> | <item> :gather | :paste <title> | :plan <range> <context> | :cancel <range> <context> | :now | :restart'
  );
  assert.deepEqual(commandNames(), [
    'switch',
    'peek',
    'clear-peek',
    'new-session',
    'lens',
    'search',
    'proper-nouns',
    'edit',
    'open',
    'delete',
    'move',
    'gather',
    'paste',
    'plan',
    'cancel',
    'now',
    'restart'
  ]);
  assert.deepEqual(commandArguments('move'), [
    { name: 'item', type: 'fact', prompt: 'Move which fact?' },
    { name: 'context', type: 'context', consume: 'rest', prompt: 'Move it to which context?' }
  ]);
  assert.deepEqual(commandArguments('gather'), [
    { name: 'item', type: 'fact', prompt: 'Gather which fact?' }
  ]);
  assert.equal(commandArguments('new'), null);
  assert.deepEqual(commandArguments('paste'), [
    { name: 'title', type: 'text', consume: 'rest', prompt: 'Name pasted item?' }
  ]);
  assert.deepEqual(commandArguments('plan'), [
    { name: 'range', type: 'timeRange', prompt: 'Plan what time?' },
    { name: 'context', type: 'context', consume: 'rest', prompt: 'Plan which context?' }
  ]);
  assert.deepEqual(commandArguments('cancel'), [
    { name: 'range', type: 'timeRange', prompt: 'Cancel what time?' },
    { name: 'context', type: 'context', consume: 'rest', prompt: 'Cancel which context?' }
  ]);
  assert.equal(commandArguments('missing'), null);
});

test('parses control entries', () => {
  assert.deepEqual(parseEntry(''), { type: 'empty' });
  assert.deepEqual(parseEntry('   '), { type: 'empty' });
  assert.deepEqual(parseEntry(':q'), { type: 'quit' });
  assert.deepEqual(parseEntry('/'), {
    type: 'prompt_command_argument',
    commandName: 'search',
    values: {},
    argument: { name: 'query', type: 'text', consume: 'rest', prompt: 'Search for what?' },
    prompt: 'Search for what?'
  });
  assert.deepEqual(parseEntry(':help'), { type: 'help' });
  assert.deepEqual(parseEntry(':restart'), { type: 'restart_app' });
  assert.deepEqual(parseEntry(':now'), { type: 'switch_to_current_timebox' });
  assert.deepEqual(parseEntry(':paste'), {
    type: 'prompt_command_argument',
    commandName: 'paste',
    values: {},
    argument: { name: 'title', type: 'text', consume: 'rest', prompt: 'Name pasted item?' },
    prompt: 'Name pasted item?'
  });
  assert.deepEqual(parseEntry(':paste Project notes'), {
    type: 'paste_clipboard',
    title: 'Project notes'
  });
  assert.deepEqual(parseEntry(':open'), { type: 'open_reference' });
  assert.deepEqual(parseEntry(':plan'), { type: 'show_plan' });
  assert.deepEqual(parseEntry(':proper-nouns'), { type: 'list_proper_nouns' });
});

test('parses planner commands', () => {
  assert.deepEqual(parseEntry(':plan 9 /arb-prep'), {
    type: 'plan_timebox',
    range: {
      start: '09:00',
      end: '09:30',
      startMinutes: 540,
      endMinutes: 570,
      isRange: false
    },
    context: '/arb-prep'
  });
  assert.deepEqual(parseEntry(':plan 1:30-3 /arb/meetings/2026-06-29'), {
    type: 'plan_timebox',
    range: {
      start: '13:30',
      end: '15:00',
      startMinutes: 810,
      endMinutes: 900,
      isRange: true
    },
    context: '/arb/meetings/2026-06-29'
  });
  assert.deepEqual(parseEntry(':cancel 11-11:30 /arb/meetings/2026-06-29'), {
    type: 'cancel_timebox',
    range: {
      start: '11:00',
      end: '11:30',
      startMinutes: 660,
      endMinutes: 690,
      isRange: true
    },
    context: '/arb/meetings/2026-06-29'
  });
  assert.deepEqual(parseEntry(':plan noon /arb-prep'), {
    message: 'usage: :plan <range> <context>',
    type: 'usage_error'
  });
});

test('parses context and lens commands', () => {
  assert.deepEqual(parseEntry(':switch people/alex'), {
    context: 'people/alex',
    type: 'switch_context'
  });
  assert.deepEqual(parseEntry(':SWITCH people/alex'), {
    context: 'people/alex',
    type: 'switch_context'
  });
  assert.deepEqual(parseEntry(':peek people/alex'), {
    context: 'people/alex',
    type: 'change_peek'
  });
  assert.deepEqual(parseEntry(':clear-peek'), {
    type: 'clear_peek'
  });
  assert.deepEqual(parseEntry(':new-session ARB standup'), {
    name: 'ARB standup',
    type: 'new_session'
  });
  assert.deepEqual(parseEntry(':new-session'), {
    type: 'prompt_command_argument',
    commandName: 'new-session',
    values: {},
    argument: {
      name: 'name',
      type: 'text',
      consume: 'rest',
      prompt: 'Name session?'
    },
    prompt: 'Name session?'
  });
  assert.deepEqual(parseEntry(':lens todo'), {
    type: 'switch_lens',
    lens: 'todo'
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
  assert.deepEqual(parseEntry(':peek people/alex'), {
    context: 'people/alex',
    type: 'change_peek'
  });
  assert.deepEqual(parseEntry(':clear-peek'), {
    type: 'clear_peek'
  });
  assert.deepEqual(parseEntry(':lens todo'), {
    lens: 'todo',
    type: 'switch_lens'
  });
  assert.deepEqual(parseEntry(':lens'), {
    type: 'prompt_command_argument',
    commandName: 'lens',
    values: {},
    argument: {
      name: 'lens',
      type: 'lens',
      prompt: 'Use which lens?'
    },
    prompt: 'Use which lens?'
  });
});

test('parses fact commands', () => {
  const dateRegistry = createCommandRegistry(undefined, {
    dateToday: new Date(2026, 5, 24, 12)
  });

  assert.deepEqual(parseEntry('Call Steve -- todo today /people/steve-ma', dateRegistry), {
    title: 'Call Steve',
    operations: [
      { factType: 'todo', type: 'set_fact_type' },
      { property: 'due', type: 'set_fact_property', value: '2026-06-24' },
      { contextReference: '/people/steve-ma', type: 'relate_fact' }
    ],
    type: 'create_fact'
  });
  assert.deepEqual(parseEntry('Call Steve -- today', dateRegistry), {
    title: 'Call Steve',
    operations: [
      { property: 'due', type: 'set_fact_property', value: '2026-06-24' }
    ],
    type: 'create_fact'
  });
  assert.deepEqual(parseEntry('%literal text'), {
    title: '%literal text',
    type: 'create_fact'
  });
  assert.deepEqual(parseEntry(':new'), {
    type: 'unknown_command',
    commandName: ':new'
  });
  assert.deepEqual(parseEntry('2 :edit'), {
    itemNumber: 2,
    type: 'edit_fact'
  });
  assert.deepEqual(parseEntry('2 :open'), {
    itemNumber: 2,
    type: 'open_reference'
  });
  assert.deepEqual(parseEntry(':open Pasted file'), {
    itemTitle: 'Pasted file',
    type: 'open_reference'
  });
  assert.deepEqual(parseEntry('3 :delete'), {
    itemNumber: 3,
    type: 'delete_fact'
  });
  assert.deepEqual(parseEntry('4 :move people/alex'), {
    contextReference: 'people/alex',
    itemNumber: 4,
    type: 'move_fact'
  });
  assert.deepEqual(parseEntry('4 :move /people/Steve\\ Ma'), {
    contextReference: '/people/Steve Ma',
    itemNumber: 4,
    type: 'move_fact'
  });
  assert.deepEqual(parseEntry('5 :gather'), {
    itemNumber: 5,
    type: 'gather_fact'
  });
  assert.deepEqual(parseEntry('11 13 14 :gather'), {
    itemNumbers: [11, 13, 14],
    type: 'gather_fact'
  });
  assert.deepEqual(parseEntry('1 2 :move people/alex'), {
    contextReference: 'people/alex',
    itemNumbers: [1, 2],
    type: 'move_fact'
  });
  assert.deepEqual(parseEntry('1 2 :delete'), {
    itemNumbers: [1, 2],
    type: 'delete_fact'
  });
  assert.deepEqual(parseEntry('14 done'), {
    itemNumber: 14,
    operations: [
      { factType: 'done', type: 'set_fact_type' }
    ],
    type: 'update_fact_shorthand'
  });
  assert.deepEqual(parseEntry('1 3 4 done'), {
    itemNumbers: [1, 3, 4],
    operations: [
      { factType: 'done', type: 'set_fact_type' }
    ],
    type: 'update_fact_shorthand'
  });
  assert.deepEqual(parseEntry('17 todo today', dateRegistry), {
    itemNumber: 17,
    operations: [
      { factType: 'todo', type: 'set_fact_type' },
      { property: 'due', type: 'set_fact_property', value: '2026-06-24' }
    ],
    type: 'update_fact_shorthand'
  });
  assert.deepEqual(parseEntry('1 3 tomorrow', dateRegistry), {
    itemNumbers: [1, 3],
    operations: [
      { property: 'due', type: 'set_fact_property', value: '2026-06-25' }
    ],
    type: 'update_fact_shorthand'
  });
  assert.deepEqual(parseEntry('35 waiting /people/steve-ma /people/john-do'), {
    itemNumber: 35,
    operations: [
      { factType: 'waiting', type: 'set_fact_type' },
      { contextReference: '/people/steve-ma', type: 'relate_fact' },
      { contextReference: '/people/john-do', type: 'relate_fact' }
    ],
    type: 'update_fact_shorthand'
  });
  assert.deepEqual(parseEntry('1 /people/Steve Ma'), {
    itemNumber: 1,
    operations: [
      { contextReference: '/people/Steve Ma', type: 'relate_fact' }
    ],
    type: 'update_fact_shorthand'
  });
  assert.deepEqual(parseEntry('1 /people/Steve\\ Ma'), {
    itemNumber: 1,
    operations: [
      { contextReference: '/people/Steve Ma', type: 'relate_fact' }
    ],
    type: 'update_fact_shorthand'
  });
  assert.deepEqual(parseEntry('1 /people/Steve Ma today waiting', dateRegistry), {
    itemNumber: 1,
    operations: [
      { contextReference: '/people/Steve Ma', type: 'relate_fact' },
      { property: 'due', type: 'set_fact_property', value: '2026-06-24' },
      { factType: 'waiting', type: 'set_fact_type' }
    ],
    type: 'update_fact_shorthand'
  });
  assert.deepEqual(parseEntry('1 /people/Steve\\ Ma today waiting', dateRegistry), {
    itemNumber: 1,
    operations: [
      { contextReference: '/people/Steve Ma', type: 'relate_fact' },
      { property: 'due', type: 'set_fact_property', value: '2026-06-24' },
      { factType: 'waiting', type: 'set_fact_type' }
    ],
    type: 'update_fact_shorthand'
  });
  assert.deepEqual(parseEntry('1 tomorrow /people/Steve Ma waiting', dateRegistry), {
    itemNumber: 1,
    operations: [
      { property: 'due', type: 'set_fact_property', value: '2026-06-25' },
      { contextReference: '/people/Steve Ma', type: 'relate_fact' },
      { factType: 'waiting', type: 'set_fact_type' }
    ],
    type: 'update_fact_shorthand'
  });
  assert.deepEqual(parseEntry('17 todo waiting'), {
    message: 'usage: <item> [type] [date] [/context ...]',
    type: 'usage_error'
  });
  assert.deepEqual(parseEntry('17 nope'), {
    message: 'usage: <item> [type] [date] [/context ...]',
    type: 'usage_error'
  });
  assert.deepEqual(parseEntry('Call Steve -- nope'), {
    message: 'usage: <fact> -- [type] [date] [/context ...]',
    type: 'usage_error'
  });
  assert.deepEqual(parseEntry(':edit 2'), {
    message: 'usage: <item> :edit',
    type: 'usage_error'
  });
  assert.deepEqual(parseEntry(':edit 2 extra'), {
    message: 'usage: <item> :edit',
    type: 'usage_error'
  });
});

test('continues prompted commands', () => {
  assert.deepEqual(continuePromptedCommand(parseEntry(':move'), '4'), {
    type: 'prompt_command_argument',
    commandName: 'move',
    values: {
      item: {
        kind: 'number',
        value: 4
      }
    },
    argument: {
      name: 'context',
      type: 'context',
      consume: 'rest',
      prompt: 'Move it to which context?'
    },
    prompt: 'Move it to which context?'
  });
  assert.deepEqual(continuePromptedCommand(continuePromptedCommand(parseEntry(':move'), '4'), 'people/alex'), {
    contextReference: 'people/alex',
    itemNumber: 4,
    type: 'move_fact'
  });
  assert.deepEqual(continuePromptedCommand(parseEntry(':gather'), '4'), {
    itemNumber: 4,
    type: 'gather_fact'
  });
  assert.deepEqual(continuePromptedCommand(parseEntry(':edit'), 'nope'), {
    itemTitle: 'nope',
    type: 'edit_fact'
  });
  assert.deepEqual(continuePromptedCommand({
    ...parseEntry(':paste'),
    argument: {
      ...parseEntry(':paste').argument,
      defaultValue: 'Pasted 2026-06-25T14-03-04.005-04-00'
    },
    values: { timestamp: '2026-06-25T14-03-04.005-04-00' }
  }, ''), {
    type: 'paste_clipboard',
    title: 'Pasted 2026-06-25T14-03-04.005-04-00',
    timestamp: '2026-06-25T14-03-04.005-04-00'
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

    assert.deepEqual(commandNames(registry), [
      'switch',
      'peek',
      'clear-peek',
      'new-session',
      'lens',
      'search',
      'proper-nouns',
      'edit',
      'open',
      'delete',
      'move',
      'gather',
      'paste',
      'plan',
      'cancel',
      'now',
      'restart',
      'jump'
    ]);
    assert.deepEqual(commandHelp(registry).at(-1), ':jump <context>');
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

test('parses enum command arguments from configured values', () => {
  const registry = createCommandRegistry([
    {
      name: 'mark',
      action: 'set_fact_type',
      arguments: [
        {
          name: 'type',
          type: 'enum',
          enum: 'status',
          prompt: 'Set which status?'
        },
        {
          name: 'item',
          type: 'fact',
          prompt: 'Mark which fact?'
        }
      ]
    }
  ], {
    enumRegistry: createEnumRegistry({
      status: {
        values: ['todo', 'waiting', 'in progress']
      }
    })
  });

  assert.deepEqual(commandArgumentValues(commandArguments('mark', registry).at(0), registry), ['todo', 'waiting', 'in progress']);
  assert.deepEqual(parseEntry('3 :mark todo', registry), {
    factType: 'todo',
    itemNumber: 3,
    type: 'set_fact_type'
  });
  assert.deepEqual(parseEntry('3 :mark in progress', registry), {
    factType: 'in progress',
    itemNumber: 3,
    type: 'set_fact_type'
  });
  assert.deepEqual(parseEntry(':mark todo Call Steve', registry), {
    factType: 'todo',
    itemTitle: 'Call Steve',
    type: 'set_fact_type'
  });
  assert.deepEqual(parseEntry(':mark done 3', registry), {
    message: 'usage: <item> :mark <type>',
    type: 'usage_error'
  });
  assert.deepEqual(parseEntry(':mark IN PROGRESS 3', registry), {
    message: 'usage: <item> :mark <type>',
    type: 'usage_error'
  });
  assert.deepEqual(parseEntry('3 :mark IN PROGRESS', registry), {
    factType: 'in progress',
    itemNumber: 3,
    type: 'set_fact_type'
  });
});

test('workspace command config overrides default commands by name', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-commands-'));

  try {
    await mkdir(path.join(rootDirectory, '.gatherbrain'), { recursive: true });
    await writeFile(
      path.join(rootDirectory, '.gatherbrain', 'commands.json'),
      JSON.stringify({
        commands: [
          {
            name: 'switch',
            action: 'switch_context',
            arguments: [
              {
                name: 'context',
                type: 'context',
                consume: 'rest',
                prompt: 'Override where?'
              }
            ]
          }
        ]
      })
    );

    const registry = await loadCommandRegistry({ rootDirectory });

    assert.deepEqual(commandNames(registry), [
      'switch',
      'peek',
      'clear-peek',
      'new-session',
      'lens',
      'search',
      'proper-nouns',
      'edit',
      'open',
      'delete',
      'move',
      'gather',
      'paste',
      'plan',
      'cancel',
      'now',
      'restart'
    ]);
    assert.deepEqual(parseEntry(':switch', registry), {
      type: 'prompt_command_argument',
      commandName: 'switch',
      values: {},
      argument: {
        name: 'context',
        type: 'context',
        consume: 'rest',
        prompt: 'Override where?'
      },
      prompt: 'Override where?'
    });
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test('parses unknown commands and fact creation', () => {
  assert.deepEqual(parseEntry('/wat now'), {
    type: 'search_facts',
    query: 'wat now'
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
