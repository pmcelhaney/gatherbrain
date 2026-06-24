import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const enumConfigPath = path.join('.gatherbrain', 'enums.json');
const defaultEnumConfigPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'default-config',
  'enums.json'
);

function readEnumConfigSync(configFilePath) {
  const config = JSON.parse(readFileSync(configFilePath, 'utf8'));

  if (!config || typeof config.enums !== 'object' || Array.isArray(config.enums)) {
    throw new Error(`${configFilePath} must contain an enums object`);
  }

  return config;
}

function normalizeEnumDefinition(name, enumDefinition) {
  const values = Array.isArray(enumDefinition)
    ? enumDefinition
    : enumDefinition?.values;

  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    throw new Error(`enum ${name} must contain string values`);
  }

  return {
    name,
    values: [...values]
  };
}

function mergeEnumDefinitions(defaultEnums, localEnums) {
  return {
    ...defaultEnums,
    ...localEnums
  };
}

export function createEnumRegistry(enumDefinitions = {}) {
  return {
    definitions: new Map(
      Object.entries(enumDefinitions)
        .map(([name, enumDefinition]) => [name, normalizeEnumDefinition(name, enumDefinition)])
    )
  };
}

const defaultEnumRegistry = createEnumRegistry(readEnumConfigSync(defaultEnumConfigPath).enums);

export async function loadEnumRegistry(options = {}) {
  const { rootDirectory } = options;
  const defaultEnums = readEnumConfigSync(defaultEnumConfigPath).enums;

  if (!rootDirectory) {
    return createEnumRegistry(defaultEnums);
  }

  const configFilePath = path.join(rootDirectory, enumConfigPath);
  let localConfig;

  try {
    localConfig = JSON.parse(await readFile(configFilePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createEnumRegistry(defaultEnums);
    }

    throw error;
  }

  if (!localConfig || typeof localConfig.enums !== 'object' || Array.isArray(localConfig.enums)) {
    throw new Error(`${enumConfigPath} must contain an enums object`);
  }

  return createEnumRegistry(mergeEnumDefinitions(defaultEnums, localConfig.enums));
}

function enumDefinitionFor(name, registry = defaultEnumRegistry) {
  return (registry ?? defaultEnumRegistry).definitions.get(name);
}

export function enumValues(name, registry = defaultEnumRegistry) {
  return enumDefinitionFor(name, registry)?.values ?? [];
}

export function hasEnumValue(name, value, registry = defaultEnumRegistry) {
  return enumValues(name, registry).includes(value);
}
