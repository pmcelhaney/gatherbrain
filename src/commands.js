import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  enumValues,
  hasEnumValue,
  loadEnumRegistry
} from './enums.js';
import { parseDateArgument } from './dates.js';

const itemNumberPattern = '[1-9]\\d*';
const typeNamePattern = '[A-Za-z][A-Za-z0-9_-]*';
const commandConfigPath = path.join('.gatherbrain', 'commands.json');
const defaultCommandConfigPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'default-config',
  'commands.json'
);

const defaultCommandRegistry = createCommandRegistry(readCommandConfigSync(defaultCommandConfigPath).commands);

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

export function createCommandRegistry(commandDefinitions = defaultCommandRegistry.definitions, options = {}) {
  return {
    definitions: commandDefinitions.map(normalizeCommandDefinition),
    dateToday: options.dateToday ?? null,
    enumRegistry: options.enumRegistry ?? null
  };
}

export async function loadCommandRegistry(options = {}) {
  const { rootDirectory } = options;
  const defaultCommands = readCommandConfigSync(defaultCommandConfigPath).commands;
  const enumRegistry = options.enumRegistry ?? await loadEnumRegistry({ rootDirectory });

  const registryOptions = {
    dateToday: options.dateToday ?? null,
    enumRegistry
  };

  if (!rootDirectory) {
    return createCommandRegistry(defaultCommands, registryOptions);
  }

  const configFilePath = path.join(rootDirectory, commandConfigPath);
  let localConfig;

  try {
    localConfig = JSON.parse(await readFile(configFilePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createCommandRegistry(defaultCommands, registryOptions);
    }

    throw error;
  }

  if (!localConfig || !Array.isArray(localConfig.commands)) {
    throw new Error(`${commandConfigPath} must contain a commands array`);
  }

  return createCommandRegistry(mergeCommandDefinitions(defaultCommands, localConfig.commands), registryOptions);
}

function readCommandConfigSync(configFilePath) {
  const config = JSON.parse(readFileSync(configFilePath, 'utf8'));

  if (!config || !Array.isArray(config.commands)) {
    throw new Error(`${configFilePath} must contain a commands array`);
  }

  return config;
}

function mergeCommandDefinitions(defaultCommands, localCommands) {
  const mergedCommands = defaultCommands.map((commandDefinition) => ({ ...commandDefinition }));
  const indexesByName = new Map(mergedCommands.map((commandDefinition, index) => [commandDefinition.name, index]));

  for (const localCommand of localCommands) {
    if (indexesByName.has(localCommand.name)) {
      mergedCommands[indexesByName.get(localCommand.name)] = localCommand;
      continue;
    }

    indexesByName.set(localCommand.name, mergedCommands.length);
    mergedCommands.push(localCommand);
  }

  return mergedCommands;
}

function commandDefinitionsFor(registry = defaultCommandRegistry) {
  return (registry ?? defaultCommandRegistry).definitions;
}

function normalizeCommandDefinition(commandDefinition) {
  if (!commandDefinition?.name || !commandDefinition.action) {
    throw new Error('command definitions require name and action');
  }

  return {
    name: commandDefinition.name,
    action: commandDefinition.action,
    ...(commandDefinition.property ? { property: commandDefinition.property } : {}),
    arguments: (commandDefinition.arguments ?? []).map((argument) => ({ ...argument }))
  };
}

export function commandHelp(registry = defaultCommandRegistry) {
  return commandDefinitionsFor(registry).map(usageForCommandDefinition);
}

export function commandHelpText(registry = defaultCommandRegistry) {
  return commandHelp(registry).join(' | ');
}

export function commandNames(registry = defaultCommandRegistry) {
  return commandDefinitionsFor(registry).map((commandDefinition) => commandDefinition.name);
}

export function commandArguments(commandName, registry = defaultCommandRegistry) {
  const commandDefinition = commandDefinitionsFor(registry).find((candidate) => candidate.name === commandName);

  return commandDefinition?.arguments.map((argument) => ({ ...argument })) ?? null;
}

export function shortcutHelp() {
  return shortcutUsages;
}

function parseNamedCommand(command, registry) {
  const match = command.match(/^:(?<name>[A-Za-z][A-Za-z0-9_-]*)(?:\s+(?<args>.*))?$/u);

  if (!match) {
    return null;
  }

  const name = match.groups.name;
  const args = match.groups.args?.trim() ?? '';
  const commandDefinition = commandDefinitionsFor(registry).find((candidate) => candidate.name === name);

  if (commandDefinition) {
    return parseCommandArguments(commandDefinition, args, {
      enumRegistry: registry?.enumRegistry,
      dateToday: registry?.dateToday,
      promptForMissing: true
    });
  }

  return {
    commandName: `:${name}`,
    type: 'unknown_command'
  };
}

function parseCommandArguments(commandDefinition, args, options = {}) {
  const {
    enumRegistry = null,
    dateToday = null,
    promptForMissing = false
  } = options;
  const parsedArguments = {};
  let remainingArgs = args.trim();

  for (const [argumentIndex, argument] of commandDefinition.arguments.entries()) {
    if (remainingArgs.length === 0) {
      if (promptForMissing) {
        return promptForArgument(commandDefinition, parsedArguments, argument);
      }

      return {
        type: 'usage_error',
        message: `usage: ${usageForCommandDefinition(commandDefinition)}`
      };
    }

    const argumentValue = readArgumentValue(argument, remainingArgs, {
      enumRegistry,
      dateToday,
      isLastArgument: argumentIndex === commandDefinition.arguments.length - 1
    });
    const value = argumentValue?.value;

    if (!value) {
      return {
        type: 'usage_error',
        message: `usage: ${usageForCommandDefinition(commandDefinition)}`
      };
    }

    const parsedValue = parseArgumentValue(argument, value, { enumRegistry, dateToday });

    if (parsedValue === null) {
      return {
        type: 'usage_error',
        message: `usage: ${usageForCommandDefinition(commandDefinition)}`
      };
    }

    parsedArguments[argument.name] = parsedValue;
    remainingArgs = argumentValue.remainingArgs;
  }

  if (remainingArgs.length > 0) {
    return {
      type: 'usage_error',
      message: `usage: ${usageForCommandDefinition(commandDefinition)}`
    };
  }

  return buildCommandAction(commandDefinition, parsedArguments);
}

function readArgumentValue(argument, remainingArgs, options = {}) {
  const {
    enumRegistry = null,
    dateToday = null,
    isLastArgument = false
  } = options;

  if (argument.consume === 'rest') {
    return {
      value: remainingArgs,
      remainingArgs: ''
    };
  }

  if (['enum', 'factType'].includes(argument.type) && argument.enum) {
    const matchingValue = enumValues(argument.enum, enumRegistry)
      .toSorted((left, right) => right.length - left.length)
      .find((value) => remainingArgs === value || remainingArgs.startsWith(`${value} `));

    if (matchingValue) {
      return {
        value: matchingValue,
        remainingArgs: remainingArgs.slice(matchingValue.length).trim()
      };
    }
  }

  if (argument.type === 'date') {
    const tokens = remainingArgs.split(/\s+/u);

    for (let tokenCount = tokens.length; tokenCount > 0; tokenCount -= 1) {
      const value = tokens.slice(0, tokenCount).join(' ');

      if (parseDateArgument(value, { today: dateToday })) {
        return {
          value,
          remainingArgs: tokens.slice(tokenCount).join(' ')
        };
      }
    }
  }

  if (argument.type === 'fact' && isLastArgument) {
    const numberedPrefix = remainingArgs.match(new RegExp(`^${itemNumberPattern}\\s+`, 'u'));

    if (numberedPrefix) {
      return {
        value: remainingArgs.match(/^\S+/u)[0],
        remainingArgs: remainingArgs.slice(numberedPrefix[0].trimEnd().length).trim()
      };
    }

    return {
      value: remainingArgs,
      remainingArgs: ''
    };
  }

  const match = remainingArgs.match(/^(?<value>\S+)(?:\s+(?<remaining>.*))?$/u);

  return match
    ? {
      value: match.groups.value,
      remainingArgs: (match.groups.remaining ?? '').trim()
    }
    : null;
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

function parseArgumentValue(argument, value, options = {}) {
  const {
    enumRegistry = null,
    dateToday = null
  } = options;

  if (argument.type === 'fact') {
    return new RegExp(`^${itemNumberPattern}$`, 'u').test(value)
      ? {
        kind: 'number',
        value: positiveItemNumber(value)
      }
      : {
        kind: 'title',
        value
      };
  }

  if (argument.type === 'factType') {
    if (argument.enum && hasEnumValue(argument.enum, value, enumRegistry)) {
      return value;
    }

    return new RegExp(`^${typeNamePattern}$`, 'u').test(value)
      ? value
      : null;
  }

  if (argument.type === 'enum') {
    return argument.enum && hasEnumValue(argument.enum, value, enumRegistry)
      ? value
      : null;
  }

  if (argument.type === 'date') {
    return parseDateArgument(value, { today: dateToday });
  }

  return value;
}

export function commandArgumentValues(argument, registry = defaultCommandRegistry) {
  if (!['enum', 'factType'].includes(argument?.type) || !argument.enum) {
    return [];
  }

  return enumValues(argument.enum, registry?.enumRegistry);
}

export function continuePromptedCommand(pendingCommand, value) {
  const registry = pendingCommand?.registry ?? defaultCommandRegistry;
  const commandDefinition = commandDefinitionsFor(registry).find((candidate) => candidate.name === pendingCommand?.commandName);
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

  const parsedValue = parseArgumentValue(argument, trimmedValue, {
    dateToday: registry?.dateToday,
    enumRegistry: registry?.enumRegistry
  });

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

  return buildCommandAction(commandDefinition, values);
}

function buildCommandAction(commandDefinition, values) {
  if (commandDefinition.action === 'switch_context') {
    return { type: 'switch_context', context: values.context };
  }

  if (commandDefinition.action === 'change_gaze') {
    return { type: 'change_gaze', context: values.context };
  }

  if (commandDefinition.action === 'clear_gaze') {
    return { type: 'clear_gaze' };
  }

  if (commandDefinition.action === 'switch_lens') {
    return { type: 'switch_lens', lens: values.lens };
  }

  if (commandDefinition.action === 'edit_fact') {
    return {
      type: 'edit_fact',
      ...factSelectorProperties(values.item)
    };
  }

  if (commandDefinition.action === 'delete_fact') {
    return {
      type: 'delete_fact',
      ...factSelectorProperties(values.item)
    };
  }

  if (commandDefinition.action === 'relate_fact') {
    return {
      type: 'relate_fact',
      ...factSelectorProperties(values.item),
      contextReference: values.context
    };
  }

  if (commandDefinition.action === 'set_fact_type') {
    return {
      type: 'set_fact_type',
      factType: values.type,
      ...factSelectorProperties(values.item)
    };
  }

  if (commandDefinition.action === 'set_fact_property') {
    return {
      type: 'set_fact_property',
      ...factSelectorProperties(values.item),
      property: commandDefinition.property ?? values.property,
      value: values.value
    };
  }

  throw new Error(`unsupported command action ${commandDefinition.action}`);
}

function factSelectorProperties(selector) {
  return selector.kind === 'number'
    ? { itemNumber: selector.value }
    : { itemTitle: selector.value };
}

export function parseEntry(entry, registry = defaultCommandRegistry) {
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

  const namedCommand = parseNamedCommand(command, registry);

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
