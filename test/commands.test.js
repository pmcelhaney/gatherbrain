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
    ':lens <lens>',
    ':new <title>',
    ':edit <item>',
    ':open [item]',
    ':delete <item>',
    ':relate <item> <context>',
    ':move <item> <context>',
    ':type <item> <type>',
    ':due <item> <value>',
    ':paste <title>',
    ':plan <range> <context>',
    ':cancel <range> <context>',
    ':now',
    ':restart'
  ]);
  assert.equal(
    commandHelpText(),
    ':switch <context> | :peek <context> | :clear-peek | :lens <lens> | :new <title> | :edit <item> | :open [item] | :delete <item> | :relate <item> <context> | :move <item> <context> | :type <item> <type> | :due <item> <value> | :paste <title> | :plan <range> <context> | :cancel <range> <context> | :now | :restart'
  );
  assert.deepEqual(commandNames(), [
    'switch',
    'peek',
    'clear-peek',
    'lens',
    'new',
    'edit',
    'open',
    'delete',
    'relate',
    'move',
    'type',
    'due',
    'paste',
    'plan',
    'cancel',
    'now',
    'restart'
  ]);
  assert.deepEqual(commandArguments('relate'), [
    { name: 'item', type: 'fact', prompt: 'Relate which fact?' },
    { name: 'context', type: 'context', consume: 'rest', prompt: 'Relate it to which context?' }
  ]);
  assert.deepEqual(commandArguments('move'), [
    { name: 'item', type: 'fact', prompt: 'Move which fact?' },
    { name: 'context', type: 'context', consume: 'rest', prompt: 'Move it to which context?' }
  ]);
  assert.deepEqual(commandArguments('type'), [
    { name: 'item', type: 'fact', prompt: 'Change which fact?' },
    { name: 'type', type: 'factType', enum: 'factType', prompt: 'Set which type?' }
  ]);
  assert.deepEqual(commandArguments('due'), [
    { name: 'item', type: 'fact', prompt: 'Set due date on which fact?' },
    { name: 'value', type: 'date', prompt: 'Due when?' }
  ]);
  assert.deepEqual(commandArguments('new'), [
    { name: 'title', type: 'text', consume: 'rest', prompt: 'Title?' }
  ]);
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
    message: 'slash shortcuts are no longer supported; use colon commands',
    type: 'usage_error'
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
  assert.deepEqual(parseEntry(':new Call Steve'), {
    title: 'Call Steve',
    type: 'create_fact'
  });
  assert.deepEqual(parseEntry('%todo Get milk'), {
    title: 'Get milk',
    type: 'create_fact',
    factType: 'todo'
  });
  assert.deepEqual(parseEntry('%TODO Get milk'), {
    title: 'Get milk',
    type: 'create_fact',
    factType: 'todo'
  });
  assert.deepEqual(parseEntry('%in progress Get milk'), {
    title: 'Get milk',
    type: 'create_fact',
    factType: 'in progress'
  });
  assert.deepEqual(parseEntry('%someday Get milk'), {
    title: 'Get milk',
    type: 'create_fact',
    factType: 'someday',
    confirmFactType: true
  });
  assert.deepEqual(parseEntry(':new'), {
    type: 'prompt_command_argument',
    commandName: 'new',
    values: {},
    argument: {
      name: 'title',
      type: 'text',
      consume: 'rest',
      prompt: 'Title?'
    },
    prompt: 'Title?'
  });
  assert.deepEqual(parseEntry(':edit 2'), {
    itemNumber: 2,
    type: 'edit_fact'
  });
  assert.deepEqual(parseEntry(':open 2'), {
    itemNumber: 2,
    type: 'open_reference'
  });
  assert.deepEqual(parseEntry(':open Pasted file'), {
    itemTitle: 'Pasted file',
    type: 'open_reference'
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
  assert.deepEqual(parseEntry(':move 4 people/alex'), {
    contextReference: 'people/alex',
    itemNumber: 4,
    type: 'move_fact'
  });
  assert.deepEqual(parseEntry(':type 5 done'), {
    factType: 'done',
    itemNumber: 5,
    type: 'set_fact_type'
  });
  assert.deepEqual(parseEntry(':TYPE 5 WAITING'), {
    factType: 'waiting',
    itemNumber: 5,
    type: 'set_fact_type'
  });
  assert.deepEqual(parseEntry(':type 5 in progress'), {
    factType: 'in progress',
    itemNumber: 5,
    type: 'set_fact_type'
  });
  assert.deepEqual(parseEntry(':type Call Steve task'), {
    factType: 'task',
    itemTitle: 'Call Steve',
    type: 'set_fact_type'
  });
  assert.deepEqual(parseEntry(':type Call Steve in progress'), {
    factType: 'in progress',
    itemTitle: 'Call Steve',
    type: 'set_fact_type'
  });
  assert.deepEqual(parseEntry('.done 5'), {
    factType: 'done',
    itemNumber: 5,
    type: 'set_fact_type'
  });
  assert.deepEqual(parseEntry('.WAITING 5'), {
    factType: 'waiting',
    itemNumber: 5,
    type: 'set_fact_type'
  });
  assert.deepEqual(parseEntry('.in progress 5'), {
    factType: 'in progress',
    itemNumber: 5,
    type: 'set_fact_type'
  });
  assert.deepEqual(parseEntry('.done'), {
    type: 'prompt_command_argument',
    commandName: 'type',
    values: {},
    argument: {
      name: 'item',
      type: 'fact',
      prompt: 'Change which fact?'
    },
    prompt: 'Change which fact?'
  });
  assert.deepEqual(parseEntry('.bad:type 5'), {
    message: 'usage: .<type> <item>',
    type: 'usage_error'
  });
  assert.deepEqual(parseEntry(':type 5'), {
    type: 'prompt_command_argument',
    commandName: 'type',
    values: { item: { kind: 'number', value: 5 } },
    argument: {
      name: 'type',
      type: 'factType',
      enum: 'factType',
      prompt: 'Set which type?'
    },
    prompt: 'Set which type?'
  });
  assert.deepEqual(parseEntry(':type 5 bad:type'), {
    message: 'usage: :type <item> <type>',
    type: 'usage_error'
  });
  assert.deepEqual(parseEntry(':due 2 2026-07-04'), {
    itemNumber: 2,
    property: 'due',
    type: 'set_fact_property',
    value: '2026-07-04'
  });
  assert.deepEqual(parseEntry(':edit 2 extra'), {
    message: 'usage: :edit <item>',
    type: 'usage_error'
  });
});

test('continues prompted commands', () => {
  const pendingType = parseEntry(':type 5');

  assert.deepEqual(continuePromptedCommand(pendingType, 'done'), {
    factType: 'done',
    itemNumber: 5,
    type: 'set_fact_type'
  });
  assert.deepEqual(continuePromptedCommand(parseEntry('.done'), '5'), {
    type: 'prompt_command_argument',
    commandName: 'type',
    values: {
      item: {
        kind: 'number',
        value: 5
      }
    },
    argument: {
      name: 'type',
      type: 'factType',
      enum: 'factType',
      prompt: 'Set which type?'
    },
    prompt: 'Set which type?'
  });
  assert.deepEqual(continuePromptedCommand(parseEntry(':relate'), '4'), {
    type: 'prompt_command_argument',
    commandName: 'relate',
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
      prompt: 'Relate it to which context?'
    },
    prompt: 'Relate it to which context?'
  });
  assert.deepEqual(continuePromptedCommand(continuePromptedCommand(parseEntry(':relate'), '4'), 'people/alex'), {
    contextReference: 'people/alex',
    itemNumber: 4,
    type: 'relate_fact'
  });
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

test('normalizes date command arguments', async () => {
  const registry = await loadCommandRegistry({
    dateToday: new Date(2026, 5, 24, 12)
  });

  assert.deepEqual(parseEntry(':due 4 today', registry), {
    itemNumber: 4,
    property: 'due',
    type: 'set_fact_property',
    value: '2026-06-24'
  });
  assert.deepEqual(parseEntry(':due 4 in 2 weeks', registry), {
    itemNumber: 4,
    property: 'due',
    type: 'set_fact_property',
    value: '2026-07-08'
  });
  assert.deepEqual(parseEntry(':due Call Steve next Friday', registry), {
    itemTitle: 'Call Steve',
    property: 'due',
    type: 'set_fact_property',
    value: '2026-06-26'
  });
  assert.deepEqual(parseEntry(':due Call Steve in 2 weeks', registry), {
    itemTitle: 'Call Steve',
    property: 'due',
    type: 'set_fact_property',
    value: '2026-07-08'
  });
  assert.deepEqual(parseEntry(':due 4 someday', registry), {
    message: 'usage: :due <item> <value>',
    type: 'usage_error'
  });
  assert.deepEqual(continuePromptedCommand({
    ...parseEntry(':due', registry),
    registry
  }, '4'), {
    type: 'prompt_command_argument',
    commandName: 'due',
    values: { item: { kind: 'number', value: 4 } },
    argument: {
      name: 'value',
      type: 'date',
      prompt: 'Due when?'
    },
    prompt: 'Due when?'
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
      'lens',
      'new',
      'edit',
      'open',
      'delete',
      'relate',
      'move',
      'type',
      'due',
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
  assert.deepEqual(parseEntry(':mark todo 3', registry), {
    factType: 'todo',
    itemNumber: 3,
    type: 'set_fact_type'
  });
  assert.deepEqual(parseEntry(':mark in progress 3', registry), {
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
    message: 'usage: :mark <type> <item>',
    type: 'usage_error'
  });
  assert.deepEqual(parseEntry(':mark IN PROGRESS 3', registry), {
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
      'lens',
      'new',
      'edit',
      'open',
      'delete',
      'relate',
      'move',
      'type',
      'due',
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
    message: 'slash shortcuts are no longer supported; use colon commands',
    type: 'usage_error'
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
