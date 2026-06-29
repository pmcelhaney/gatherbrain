import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  enumValues,
  loadEnumRegistry
} from './enums.js';
import { parseDateArgument } from './dates.js';
import { parseTimeRange } from './timeboxes.js';

const itemNumberPattern = '[1-9]\\d*';
const typeNamePattern = '[A-Za-z][A-Za-z0-9_-]*';
const shorthandFactTypeEnum = 'factType';
const factMetadataDelimiterPattern = /\s--\s/u;
const commandConfigPath = path.join('.gatherbrain', 'commands.json');
const defaultCommandConfigPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'default-config',
  'commands.json'
);

const defaultCommandRegistry = createCommandRegistry(readCommandConfigSync(defaultCommandConfigPath).commands);

function positiveItemNumber(value) {
  return Number(value);
}

function usageForCommandDefinition(commandDefinition) {
  const factArgumentIndex = commandDefinition.arguments.findIndex((argument) => argument.type === 'fact');

  if (factArgumentIndex !== -1) {
    const argumentUsage = commandDefinition.arguments
      .filter((argument) => argument.type !== 'fact')
      .map((argument) => (argument.optional ? `[${argument.name}]` : `<${argument.name}>`))
      .join(' ');
    const commandUsage = argumentUsage.length > 0
      ? `:${commandDefinition.name} ${argumentUsage}`
      : `:${commandDefinition.name}`;

    if (commandDefinition.arguments[factArgumentIndex].optional) {
      return `${commandUsage} | <item> :${commandDefinition.name}`;
    }

    return `<item> ${commandUsage}`;
  }

  const argumentUsage = commandDefinition.arguments
    .map((argument) => (argument.optional ? `[${argument.name}]` : `<${argument.name}>`))
    .join(' ');

  return argumentUsage.length > 0
    ? `:${commandDefinition.name} ${argumentUsage}`
    : `:${commandDefinition.name}`;
}

function usageErrorForCommand(commandDefinition) {
  return {
    type: 'usage_error',
    message: `usage: ${usageForCommandDefinition(commandDefinition)}`
  };
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

function valuesAreEqualCaseInsensitive(left, right) {
  return left.toLowerCase() === right.toLowerCase();
}

function matchingEnumValue(enumName, value, registry = defaultCommandRegistry) {
  return enumValues(enumName, registry)
    .find((candidate) => valuesAreEqualCaseInsensitive(candidate, value));
}

function normalizeCommandDefinition(commandDefinition) {
  if (!commandDefinition?.name || !commandDefinition.action) {
    throw new Error('command definitions require name and action');
  }

  return {
    name: commandDefinition.name,
    action: commandDefinition.action,
    ...(commandDefinition.emptyAction ? { emptyAction: commandDefinition.emptyAction } : {}),
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

function parseNamedCommand(command, registry) {
  const match = command.match(/^:(?<name>[A-Za-z][A-Za-z0-9_-]*)(?:\s+(?<args>.*))?$/u);

  if (!match) {
    return null;
  }

  const name = match.groups.name;
  const args = match.groups.args?.trim() ?? '';
  const commandDefinition = commandDefinitionsFor(registry)
    .find((candidate) => valuesAreEqualCaseInsensitive(candidate.name, name));

  if (commandDefinition) {
    const numericFactArgument = numericFactArgumentInCommandPosition(commandDefinition, args);

    if (numericFactArgument) {
      return usageErrorForCommand(commandDefinition);
    }

    return parseCommandArguments(commandDefinition, args, {
      registry,
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

function parseItemPrefixedNamedCommand(command, registry) {
  const match = command.match(/^(?<item>[1-9]\d*)\s+:(?<name>[A-Za-z][A-Za-z0-9_-]*)(?:\s+(?<args>.*))?$/u);

  if (!match) {
    return null;
  }

  const name = match.groups.name;
  const args = match.groups.args?.trim() ?? '';
  const commandDefinition = commandDefinitionsFor(registry)
    .find((candidate) => valuesAreEqualCaseInsensitive(candidate.name, name));

  if (!commandDefinition) {
    return {
      commandName: `:${name}`,
      type: 'unknown_command'
    };
  }

  const factArgumentIndex = commandDefinition.arguments.findIndex((argument) => argument.type === 'fact');

  if (factArgumentIndex === -1) {
    return usageErrorForCommand(commandDefinition);
  }

  return parseCommandArguments(
    commandDefinition,
    argsWithItemAtFactArgumentPosition(commandDefinition, match.groups.item, args),
    {
      registry,
      enumRegistry: registry?.enumRegistry,
      dateToday: registry?.dateToday,
      promptForMissing: false
    }
  );
}

function argsWithItemAtFactArgumentPosition(commandDefinition, item, args) {
  const factArgumentIndex = commandDefinition.arguments.findIndex((argument) => argument.type === 'fact');

  if (factArgumentIndex === 0) {
    return [item, args].filter((part) => part.length > 0).join(' ');
  }

  if (factArgumentIndex === commandDefinition.arguments.length - 1) {
    return [args, item].filter((part) => part.length > 0).join(' ');
  }

  return args;
}

function numericFactArgumentInCommandPosition(commandDefinition, args) {
  const factArgumentIndex = commandDefinition.arguments.findIndex((argument) => argument.type === 'fact');

  if (factArgumentIndex === -1 || args.trim().length === 0) {
    return false;
  }

  const tokens = splitCommandTokens(args.trim());

  if (factArgumentIndex === 0) {
    return new RegExp(`^${itemNumberPattern}$`, 'u').test(tokens.at(0) ?? '');
  }

  if (factArgumentIndex === commandDefinition.arguments.length - 1) {
    return new RegExp(`^${itemNumberPattern}$`, 'u').test(tokens.at(-1) ?? '');
  }

  return false;
}

function factUpdateMetadataUsageError() {
  return {
    type: 'usage_error',
    message: 'usage: [type] [date] [/context ...]'
  };
}

function itemUpdateUsageError() {
  return {
    type: 'usage_error',
    message: 'usage: <item> [type] [date] [/context ...]'
  };
}

function factCreationMetadataUsageError() {
  return {
    type: 'usage_error',
    message: 'usage: <fact> -- [type] [date] [/context ...]'
  };
}

function splitCommandTokens(value) {
  const tokens = [];
  let token = '';

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const nextCharacter = value[index + 1];

    if (character === '\\' && /\s/u.test(nextCharacter ?? '')) {
      token += nextCharacter;
      index += 1;
      continue;
    }

    if (/\s/u.test(character)) {
      if (token.length > 0) {
        tokens.push(token);
        token = '';
      }

      continue;
    }

    token += character;
  }

  if (token.length > 0) {
    tokens.push(token);
  }

  return tokens;
}

function unescapeCommandValue(value) {
  return value.replace(/\\(\s)/gu, '$1');
}

function parseFactTypeToken(tokens, index, registry) {
  const remaining = tokens.slice(index).join(' ');
  const matchingType = enumValues(shorthandFactTypeEnum, registry?.enumRegistry)
    .toSorted((left, right) => right.length - left.length)
    .find((value) => (
      remaining.toLowerCase() === value.toLowerCase()
      || remaining.toLowerCase().startsWith(`${value.toLowerCase()} `)
    ));

  return matchingType
    ? { factType: matchingType, tokenCount: matchingType.split(/\s+/u).length }
    : null;
}

function parseDateTokens(tokens, index, registry) {
  for (let tokenCount = tokens.length - index; tokenCount > 0; tokenCount -= 1) {
    const value = tokens.slice(index, index + tokenCount).join(' ');
    const date = parseDateArgument(value, { today: registry?.dateToday });

    if (date) {
      return { date, tokenCount };
    }
  }

  return null;
}

function parseContextReferenceTokens(tokens, index, registry) {
  let tokenCount = 1;

  while (index + tokenCount < tokens.length) {
    const nextIndex = index + tokenCount;

    if (
      tokens[nextIndex].startsWith('/')
      || parseFactTypeToken(tokens, nextIndex, registry)
      || parseDateTokens(tokens, nextIndex, registry)
    ) {
      break;
    }

    tokenCount += 1;
  }

  return {
    contextReference: tokens.slice(index, index + tokenCount).join(' '),
    tokenCount
  };
}

function parseFactUpdateOperations(updates, registry) {
  if (updates.length === 0) {
    return null;
  }

  const tokens = splitCommandTokens(updates);
  const operations = [];
  let factType = null;
  let due = null;

  for (let index = 0; index < tokens.length;) {
    const token = tokens[index];

    if (token.startsWith('/')) {
      const parsedContext = parseContextReferenceTokens(tokens, index, registry);

      operations.push({
        contextReference: parsedContext.contextReference,
        type: 'relate_fact'
      });
      index += parsedContext.tokenCount;
      continue;
    }

    const parsedType = parseFactTypeToken(tokens, index, registry);

    if (parsedType) {
      if (factType) {
        return factUpdateMetadataUsageError();
      }

      factType = parsedType.factType;
      operations.push({
        factType,
        type: 'set_fact_type'
      });
      index += parsedType.tokenCount;
      continue;
    }

    const parsedDate = parseDateTokens(tokens, index, registry);

    if (parsedDate) {
      if (due) {
        return factUpdateMetadataUsageError();
      }

      due = parsedDate.date;
      operations.push({
        property: 'due',
        type: 'set_fact_property',
        value: parsedDate.date
      });
      index += parsedDate.tokenCount;
      continue;
    }

    return factUpdateMetadataUsageError();
  }

  return operations;
}

function parseItemUpdateShorthand(command, registry) {
  const match = command.match(/^(?<item>[1-9]\d*)(?:\s+(?<updates>.*))?$/u);

  if (!match) {
    return null;
  }

  const updates = match.groups.updates?.trim() ?? '';

  if (updates.length === 0) {
    return null;
  }

  const parsedOperations = parseFactUpdateOperations(updates, registry);

  if (parsedOperations?.type === 'usage_error') {
    return itemUpdateUsageError();
  }

  return parsedOperations?.length > 0
    ? {
      itemNumber: positiveItemNumber(match.groups.item),
      operations: parsedOperations,
      type: 'update_fact_shorthand'
    }
    : null;
}

function createFactActionFromTitle(rawTitle, registry, options = {}) {
  const delimiterMatch = rawTitle.match(factMetadataDelimiterPattern);

  if (!delimiterMatch) {
    return {
      type: 'create_fact',
      title: rawTitle,
      ...options
    };
  }

  const delimiterIndex = delimiterMatch.index;
  const title = rawTitle.slice(0, delimiterIndex).trim();
  const metadata = rawTitle.slice(delimiterIndex + delimiterMatch[0].length).trim();

  if (title.length === 0 || metadata.length === 0) {
    return factCreationMetadataUsageError();
  }

  const parsedOperations = parseFactUpdateOperations(metadata, registry);

  if (parsedOperations?.type === 'usage_error' || !parsedOperations || parsedOperations.length === 0) {
    return factCreationMetadataUsageError();
  }

  return {
    type: 'create_fact',
    title,
    ...options,
    operations: parsedOperations
  };
}

function parseCommandArguments(commandDefinition, args, options = {}) {
  const {
    enumRegistry = null,
    dateToday = null,
    promptForMissing = false
  } = options;
  const trailingParsedArguments = parseTrailingCommandArguments(commandDefinition, args, options);

  if (trailingParsedArguments) {
    return trailingParsedArguments;
  }

  if (args.trim().length === 0 && commandDefinition.emptyAction) {
    return { type: commandDefinition.emptyAction };
  }

  const parsedArguments = {};
  let remainingArgs = args.trim();

  for (const [argumentIndex, argument] of commandDefinition.arguments.entries()) {
    if (remainingArgs.length === 0) {
      if (argument.optional) {
        continue;
      }

      if (promptForMissing) {
        return promptForArgument(commandDefinition, parsedArguments, argument);
      }

      return usageErrorForCommand(commandDefinition);
    }

    const argumentValue = readArgumentValue(argument, remainingArgs, {
      enumRegistry,
      dateToday,
      isLastArgument: argumentIndex === commandDefinition.arguments.length - 1
    });
    const value = argumentValue?.value;

    if (!value) {
      return usageErrorForCommand(commandDefinition);
    }

    const parsedValue = parseArgumentValue(argument, value, { enumRegistry, dateToday });

    if (parsedValue === null) {
      return usageErrorForCommand(commandDefinition);
    }

    parsedArguments[argument.name] = parsedValue;
    remainingArgs = argumentValue.remainingArgs;
  }

  if (remainingArgs.length > 0) {
    return usageErrorForCommand(commandDefinition);
  }

  return buildCommandAction(commandDefinition, parsedArguments, { registry: options.registry });
}

function parseTrailingCommandArguments(commandDefinition, args, options = {}) {
  const {
    enumRegistry = null,
    dateToday = null,
    promptForMissing = false
  } = options;

  const trailingArguments = itemFirstTrailingArguments(commandDefinition);

  if (!trailingArguments) {
    return null;
  }

  const { itemArgument, trailingArgument } = trailingArguments;
  const trimmedArgs = args.trim();

  if (trimmedArgs.length === 0) {
    return promptForMissing
      ? promptForArgument(commandDefinition, {}, itemArgument)
      : usageErrorForCommand(commandDefinition);
  }

  const tokens = splitCommandTokens(trimmedArgs);

  for (let splitIndex = 1; splitIndex < tokens.length; splitIndex += 1) {
    const itemValueText = tokens.slice(0, splitIndex).join(' ');
    const trailingValueText = tokens.slice(splitIndex).join(' ');
    const itemValue = parseArgumentValue(itemArgument, itemValueText, { enumRegistry, dateToday });
    const trailingValue = parseArgumentValue(trailingArgument, trailingValueText, { enumRegistry, dateToday });

    if (itemValue !== null && trailingValue !== null) {
      return buildCommandAction(commandDefinition, {
        [itemArgument.name]: itemValue,
        [trailingArgument.name]: trailingValue
      }, { registry: options.registry });
    }
  }

  if (!promptForMissing) {
    return null;
  }

  if (tokens.length !== 1) {
    return null;
  }

  const itemValue = parseArgumentValue(itemArgument, trimmedArgs, { enumRegistry, dateToday });

  if (itemValue !== null) {
    return promptForArgument(commandDefinition, {
      [itemArgument.name]: itemValue
    }, trailingArgument);
  }

  return null;
}

function itemFirstTrailingArguments(commandDefinition) {
  if (commandDefinition.arguments.length !== 2) {
    return null;
  }

  const [itemArgument, trailingArgument] = commandDefinition.arguments;

  return itemArgument.type === 'fact' && ['factType', 'date'].includes(trailingArgument.type)
    ? { itemArgument, trailingArgument }
    : null;
}

function readArgumentValue(argument, remainingArgs, options = {}) {
  const {
    enumRegistry = null,
    dateToday = null,
    isLastArgument = false
  } = options;

  if (argument.consume === 'rest') {
    return {
      value: unescapeCommandValue(remainingArgs),
      remainingArgs: ''
    };
  }

  if (['enum', 'factType'].includes(argument.type) && argument.enum) {
    const normalizedRemainingArgs = remainingArgs.toLowerCase();
    const matchingValue = enumValues(argument.enum, enumRegistry)
      .toSorted((left, right) => right.length - left.length)
      .find((value) => (
        normalizedRemainingArgs === value.toLowerCase()
        || normalizedRemainingArgs.startsWith(`${value.toLowerCase()} `)
      ));

    if (matchingValue) {
      return {
        value: matchingValue,
        remainingArgs: remainingArgs.slice(matchingValue.length).trim()
      };
    }
  }

  if (argument.type === 'date') {
    const tokens = splitCommandTokens(remainingArgs);

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

  if (argument.type === 'timeRange') {
    const tokens = splitCommandTokens(remainingArgs);

    return tokens.length > 0
      ? {
        value: tokens[0],
        remainingArgs: tokens.slice(1).join(' ')
      }
      : null;
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

  const tokens = splitCommandTokens(remainingArgs);

  return tokens.length > 0
    ? {
      value: tokens[0],
      remainingArgs: tokens.slice(1).join(' ')
    }
    : null;
}

function promptForArgument(commandDefinition, values, argument) {
  const defaultValue = argument.defaultValue ?? argument.default;

  return {
    type: 'prompt_command_argument',
    commandName: commandDefinition.name,
    values: { ...values },
    argument: {
      ...argument,
      ...(defaultValue === undefined ? {} : { defaultValue })
    },
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
    if (argument.enum) {
      const enumValue = matchingEnumValue(argument.enum, value, enumRegistry);

      if (enumValue) {
        return enumValue;
      }
    }

    return new RegExp(`^${typeNamePattern}$`, 'u').test(value)
      ? value
      : null;
  }

  if (argument.type === 'enum') {
    return argument.enum
      ? matchingEnumValue(argument.enum, value, enumRegistry) ?? null
      : null;
  }

  if (argument.type === 'date') {
    return parseDateArgument(value, { today: dateToday });
  }

  if (argument.type === 'timeRange') {
    return parseTimeRange(value);
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
  const valueToParse = trimmedValue.length === 0 && argument.defaultValue !== undefined
    ? String(argument.defaultValue)
    : trimmedValue;

  if (valueToParse.length === 0) {
    return promptForArgument(commandDefinition, pendingCommand.values ?? {}, argument);
  }

  const parsedValue = parseArgumentValue(argument, valueToParse, {
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

  return buildCommandAction(commandDefinition, values, { registry });
}

function buildCommandAction(commandDefinition, values, options = {}) {
  if (commandDefinition.action === 'switch_context') {
    return { type: 'switch_context', context: values.context };
  }

  if (commandDefinition.action === 'change_peek' || commandDefinition.action === 'change_gaze') {
    return { type: 'change_peek', context: values.context };
  }

  if (commandDefinition.action === 'clear_peek' || commandDefinition.action === 'clear_gaze') {
    return { type: 'clear_peek' };
  }

  if (commandDefinition.action === 'restart_app') {
    return { type: 'restart_app' };
  }

  if (commandDefinition.action === 'switch_to_current_timebox') {
    return { type: 'switch_to_current_timebox' };
  }

  if (commandDefinition.action === 'plan_timebox') {
    return {
      type: 'plan_timebox',
      range: values.range,
      context: values.context
    };
  }

  if (commandDefinition.action === 'cancel_timebox') {
    return {
      type: 'cancel_timebox',
      range: values.range,
      context: values.context
    };
  }

  if (commandDefinition.action === 'paste_clipboard') {
    return {
      type: 'paste_clipboard',
      title: values.title,
      ...(values.timestamp ? { timestamp: values.timestamp } : {})
    };
  }

  if (commandDefinition.action === 'open_reference') {
    return {
      type: 'open_reference',
      ...(values.item ? factSelectorProperties(values.item) : {})
    };
  }

  if (commandDefinition.action === 'switch_lens') {
    return { type: 'switch_lens', lens: values.lens };
  }

  if (commandDefinition.action === 'create_fact') {
    return createFactActionFromTitle(values.title, options.registry);
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

  if (commandDefinition.action === 'move_fact') {
    return {
      type: 'move_fact',
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

  if (command === ':help') {
    return { type: 'help' };
  }

  const namedCommand = parseNamedCommand(command, registry);

  if (namedCommand) {
    return namedCommand;
  }

  const itemPrefixedNamedCommand = parseItemPrefixedNamedCommand(command, registry);

  if (itemPrefixedNamedCommand) {
    return itemPrefixedNamedCommand;
  }

  const itemUpdateShorthand = parseItemUpdateShorthand(command, registry);

  if (itemUpdateShorthand) {
    return itemUpdateShorthand;
  }

  if (command.startsWith('/')) {
    return {
      message: 'slash shortcuts are no longer supported; use colon commands',
      type: 'usage_error'
    };
  }

  return createFactActionFromTitle(entry, registry);
}
