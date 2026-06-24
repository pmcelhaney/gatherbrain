const itemNumberPattern = '[1-9]\\d*';
const typeNamePattern = '[A-Za-z][A-Za-z0-9_-]*';

const commandDefinitions = [
  {
    name: 'switch',
    arguments: [
      { name: 'context', type: 'context', consume: 'rest', prompt: 'Switch to which context?' }
    ],
    build: ({ context }) => ({ type: 'switch_context', context })
  },
  {
    name: 'gaze',
    arguments: [
      { name: 'context', type: 'context', consume: 'rest', prompt: 'Gaze at which context?' }
    ],
    build: ({ context }) => ({ type: 'change_gaze', context })
  },
  {
    name: 'clear-gaze',
    arguments: [],
    build: () => ({ type: 'clear_gaze' })
  },
  {
    name: 'lens',
    arguments: [
      { name: 'lens', type: 'lens', prompt: 'Use which lens?' }
    ],
    build: ({ lens }) => ({ type: 'switch_lens', lens })
  },
  {
    name: 'edit',
    arguments: [
      { name: 'item', type: 'fact', prompt: 'Edit which fact?' }
    ],
    build: ({ item }) => ({ type: 'edit_fact', itemNumber: item })
  },
  {
    name: 'delete',
    arguments: [
      { name: 'item', type: 'fact', prompt: 'Delete which fact?' }
    ],
    build: ({ item }) => ({ type: 'delete_fact', itemNumber: item })
  },
  {
    name: 'relate',
    arguments: [
      { name: 'item', type: 'fact', prompt: 'Relate which fact?' },
      { name: 'context', type: 'context', consume: 'rest', prompt: 'Relate it to which context?' }
    ],
    build: ({ item, context }) => ({
      type: 'relate_fact',
      itemNumber: item,
      contextReference: context
    })
  },
  {
    name: 'type',
    arguments: [
      { name: 'type', type: 'factType', prompt: 'Set which type?' },
      { name: 'item', type: 'fact', prompt: 'Change which fact?' }
    ],
    build: ({ item, type }) => ({
      type: 'set_fact_type',
      factType: type,
      itemNumber: item
    })
  }
];

const shortcutUsages = [
  '/s <context>',
  '/g <context>',
  '/l <lens>',
  '/e <item>',
  '/d <item>',
  '/r <item> <context>',
  '/debug keys'
];

function positiveItemNumber(value) {
  return Number(value);
}

function usageForCommandDefinition(commandDefinition) {
  const argumentUsage = commandDefinition.arguments
    .map((argument) => `<${argument.name}>`)
    .join(' ');

  return argumentUsage.length > 0
    ? `:${commandDefinition.name} ${argumentUsage}`
    : `:${commandDefinition.name}`;
}

export function commandHelp() {
  return commandDefinitions.map(usageForCommandDefinition);
}

export function commandHelpText() {
  return commandHelp().join(' | ');
}

export function commandNames() {
  return commandDefinitions.map((commandDefinition) => commandDefinition.name);
}

export function commandArguments(commandName) {
  const commandDefinition = commandDefinitions.find((candidate) => candidate.name === commandName);

  return commandDefinition?.arguments.map((argument) => ({ ...argument })) ?? null;
}

export function shortcutHelp() {
  return shortcutUsages;
}

function parseNamedCommand(command) {
  const match = command.match(/^:(?<name>[A-Za-z][A-Za-z0-9_-]*)(?:\s+(?<args>.*))?$/u);

  if (!match) {
    return null;
  }

  const name = match.groups.name;
  const args = match.groups.args?.trim() ?? '';
  const commandDefinition = commandDefinitions.find((candidate) => candidate.name === name);

  if (commandDefinition) {
    return parseCommandArguments(commandDefinition, args, { promptForMissing: true });
  }

  return {
    commandName: `:${name}`,
    type: 'unknown_command'
  };
}

function parseCommandArguments(commandDefinition, args, options = {}) {
  const { promptForMissing = false } = options;
  const parsedArguments = {};
  let remainingArgs = args.trim();

  for (const argument of commandDefinition.arguments) {
    if (remainingArgs.length === 0) {
      if (promptForMissing) {
        return promptForArgument(commandDefinition, parsedArguments, argument);
      }

      return {
        type: 'usage_error',
        message: `usage: ${usageForCommandDefinition(commandDefinition)}`
      };
    }

    const value = argument.consume === 'rest'
      ? remainingArgs
      : remainingArgs.match(/^(?<value>\S+)(?:\s+(?<remaining>.*))?$/u)?.groups.value;

    if (!value) {
      return {
        type: 'usage_error',
        message: `usage: ${usageForCommandDefinition(commandDefinition)}`
      };
    }

    const parsedValue = parseArgumentValue(argument, value);

    if (parsedValue === null) {
      return {
        type: 'usage_error',
        message: `usage: ${usageForCommandDefinition(commandDefinition)}`
      };
    }

    parsedArguments[argument.name] = parsedValue;
    remainingArgs = argument.consume === 'rest'
      ? ''
      : (remainingArgs.match(/^\S+(?:\s+(?<remaining>.*))?$/u)?.groups.remaining ?? '').trim();
  }

  if (remainingArgs.length > 0) {
    return {
      type: 'usage_error',
      message: `usage: ${usageForCommandDefinition(commandDefinition)}`
    };
  }

  return commandDefinition.build(parsedArguments);
}

function promptForArgument(commandDefinition, values, argument) {
  return {
    type: 'prompt_command_argument',
    commandName: commandDefinition.name,
    values: { ...values },
    argument: { ...argument },
    prompt: argument.prompt ?? `${argument.name}?`
  };
}

function parseArgumentValue(argument, value) {
  if (argument.type === 'fact') {
    return new RegExp(`^${itemNumberPattern}$`, 'u').test(value)
      ? positiveItemNumber(value)
      : null;
  }

  if (argument.type === 'factType') {
    return new RegExp(`^${typeNamePattern}$`, 'u').test(value)
      ? value
      : null;
  }

  return value;
}

export function continuePromptedCommand(pendingCommand, value) {
  const commandDefinition = commandDefinitions.find((candidate) => candidate.name === pendingCommand?.commandName);
  const argument = pendingCommand?.argument;

  if (!commandDefinition || !argument) {
    return {
      type: 'usage_error',
      message: 'no command is waiting for an argument'
    };
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return promptForArgument(commandDefinition, pendingCommand.values ?? {}, argument);
  }

  const parsedValue = parseArgumentValue(argument, trimmedValue);

  if (parsedValue === null) {
    return {
      type: 'usage_error',
      message: `usage: ${usageForCommandDefinition(commandDefinition)}`
    };
  }

  const values = {
    ...(pendingCommand.values ?? {}),
    [argument.name]: parsedValue
  };
  const nextArgument = commandDefinition.arguments.find((candidate) => values[candidate.name] === undefined);

  if (nextArgument) {
    return promptForArgument(commandDefinition, values, nextArgument);
  }

  return commandDefinition.build(values);
}

export function parseEntry(entry) {
  const command = entry.trim();

  if (command.length === 0) {
    return { type: 'empty' };
  }

  if ([':q', ':quit', ':exit'].includes(command)) {
    return { type: 'quit' };
  }

  if (command === '/') {
    return { type: 'help' };
  }

  if (command === ':help') {
    return { type: 'help' };
  }

  if (command === '/debug keys') {
    return { type: 'debug_keys' };
  }

  const namedCommand = parseNamedCommand(command);

  if (namedCommand) {
    return namedCommand;
  }

  const switchCommand = command.match(/^\/s(?:\s+(.*))?$/u);

  if (switchCommand) {
    const context = switchCommand[1]?.trim() ?? '';

    return context.length === 0
      ? { type: 'usage_error', message: 'usage: /s <context>' }
      : { type: 'switch_context', context };
  }

  const lensCommand = command.match(/^\/l(?:\s+(.*))?$/u);

  if (lensCommand) {
    const lens = lensCommand[1]?.trim() ?? '';

    return lens.length === 0
      ? { type: 'usage_error', message: 'usage: /l <lens>' }
      : { type: 'switch_lens', lens };
  }

  const gazeCommand = command.match(/^\/g(?:\s+(.*))?$/u);

  if (gazeCommand) {
    const context = gazeCommand[1]?.trim() ?? '';

    return context.length === 0
      ? { type: 'clear_gaze' }
      : { type: 'change_gaze', context };
  }

  const editCommand = command.match(new RegExp(`^/e\\s+(${itemNumberPattern})$`, 'u'));

  if (editCommand) {
    return {
      itemNumber: positiveItemNumber(editCommand[1]),
      type: 'edit_fact'
    };
  }

  const deleteCommand = command.match(new RegExp(`^/d\\s+(${itemNumberPattern})$`, 'u'));

  if (deleteCommand) {
    return {
      itemNumber: positiveItemNumber(deleteCommand[1]),
      type: 'delete_fact'
    };
  }

  const relationCommand = command.match(new RegExp(`^/r\\s+(${itemNumberPattern})\\s+(.+)$`, 'u'));

  if (relationCommand) {
    return {
      contextReference: relationCommand[2],
      itemNumber: positiveItemNumber(relationCommand[1]),
      type: 'relate_fact'
    };
  }

  if (/^\/r(?:\s|$)/u.test(command)) {
    return {
      message: 'usage: /r <item> <context>',
      type: 'usage_error'
    };
  }

  if (command.startsWith('/')) {
    return {
      commandName: command.split(/\s/u)[0],
      type: 'unknown_command'
    };
  }

  return {
    title: entry,
    type: 'create_fact'
  };
}
