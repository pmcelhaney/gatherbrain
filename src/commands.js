const itemNumberPattern = '[1-9]\\d*';
const typeNamePattern = '[A-Za-z][A-Za-z0-9_-]*';

const commandDefinitions = [
  {
    name: 'switch',
    usage: ':switch <context>',
    parse: (args) => args.length === 0
      ? { type: 'usage_error', message: 'usage: :switch <context>' }
      : { type: 'switch_context', context: args }
  },
  {
    name: 'gaze',
    usage: ':gaze <context>',
    parse: (args) => args.length === 0
      ? { type: 'usage_error', message: 'usage: :gaze <context>' }
      : { type: 'change_gaze', context: args }
  },
  {
    name: 'clear-gaze',
    usage: ':clear-gaze',
    parse: (args) => args.length === 0
      ? { type: 'clear_gaze' }
      : { type: 'usage_error', message: 'usage: :clear-gaze' }
  },
  {
    name: 'lens',
    usage: ':lens <lens>',
    parse: (args) => args.length === 0
      ? { type: 'usage_error', message: 'usage: :lens <lens>' }
      : { type: 'switch_lens', lens: args }
  },
  {
    name: 'edit',
    usage: ':edit <item>',
    parse: (args) => {
      const match = args.match(new RegExp(`^(${itemNumberPattern})$`, 'u'));

      return match
        ? { type: 'edit_fact', itemNumber: positiveItemNumber(match[1]) }
        : { type: 'usage_error', message: 'usage: :edit <item>' };
    }
  },
  {
    name: 'delete',
    usage: ':delete <item>',
    parse: (args) => {
      const match = args.match(new RegExp(`^(${itemNumberPattern})$`, 'u'));

      return match
        ? { type: 'delete_fact', itemNumber: positiveItemNumber(match[1]) }
        : { type: 'usage_error', message: 'usage: :delete <item>' };
    }
  },
  {
    name: 'relate',
    usage: ':relate <item> <context>',
    parse: (args) => {
      const match = args.match(new RegExp(`^(${itemNumberPattern})\\s+(.+)$`, 'u'));

      return match
        ? {
          type: 'relate_fact',
          itemNumber: positiveItemNumber(match[1]),
          contextReference: match[2]
        }
        : { type: 'usage_error', message: 'usage: :relate <item> <context>' };
    }
  },
  {
    name: 'type',
    usage: ':type <type> <item>',
    parse: (args) => {
      const match = args.match(new RegExp(`^(${typeNamePattern})\\s+(${itemNumberPattern})$`, 'u'));

      return match
        ? {
          type: 'set_fact_type',
          factType: match[1],
          itemNumber: positiveItemNumber(match[2])
        }
        : { type: 'usage_error', message: 'usage: :type <type> <item>' };
    }
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

export function commandHelp() {
  return commandDefinitions.map((commandDefinition) => commandDefinition.usage);
}

export function commandHelpText() {
  return commandHelp().join(' | ');
}

export function commandNames() {
  return commandDefinitions.map((commandDefinition) => commandDefinition.name);
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
    return commandDefinition.parse(args);
  }

  return {
    commandName: `:${name}`,
    type: 'unknown_command'
  };
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
