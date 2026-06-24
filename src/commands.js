const commandUsages = [
  '/s <context>',
  '/l <lens>',
  '/e <item>',
  '/d <item>',
  '/r <item> <context>',
  '/debug keys'
];

const itemNumberPattern = '[1-9]\\d*';
const typeNamePattern = '[A-Za-z][A-Za-z0-9_-]*';

function positiveItemNumber(value) {
  return Number(value);
}

export function commandHelp() {
  return commandUsages;
}

export function commandHelpText() {
  return commandUsages.join(' | ');
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

  if (command === '/debug keys') {
    return { type: 'debug_keys' };
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

  const typeCommand = command.match(new RegExp(`^:(${typeNamePattern})\\s+(${itemNumberPattern})$`, 'u'));

  if (typeCommand) {
    return {
      itemNumber: positiveItemNumber(typeCommand[2]),
      factType: typeCommand[1],
      type: 'set_fact_type'
    };
  }

  return {
    title: entry,
    type: 'create_fact'
  };
}
