import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const defaultLensId = 'all';

const lensConfigPath = path.join('.gatherbrain', 'lenses.json');
const templateNamePattern = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const defaultLensConfigPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'default-config',
  'lenses.json'
);

function pathIsInside(directory, filePath) {
  const relativePath = path.relative(directory, filePath);

  return relativePath.length === 0
    || (
      !relativePath.startsWith(`..${path.sep}`)
      && relativePath !== '..'
      && !path.isAbsolute(relativePath)
    );
}

function relationForContext(rootPath, contextPath) {
  const relativeContext = path.relative(rootPath, contextPath);

  return relativeContext.length > 0 ? relativeContext.split(path.sep).join('/') : '';
}

function folderNameForFact(fact, rootPath) {
  const relativeDirectory = path.dirname(path.relative(rootPath, fact.path));

  if (relativeDirectory === '.') {
    return path.basename(rootPath);
  }

  return relativeDirectory.split(path.sep).at(-1) ?? relativeDirectory;
}

function folderNameForRelation(relation) {
  return relation.split('/').at(-1) ?? relation;
}

function factsForModel(model) {
  return [...model.facts.values()]
    .sort((left, right) => {
      const filenameComparison = path.basename(left.filename).localeCompare(path.basename(right.filename));

      return filenameComparison === 0
        ? left.filename.localeCompare(right.filename)
        : filenameComparison;
    });
}

function visibleFactsForContext(model, contextPath) {
  const contextRelation = relationForContext(model.rootPath, contextPath);

  return factsForModel(model)
    .flatMap((fact) => {
      const insideContext = pathIsInside(contextPath, fact.path);
      const relatedToContext = contextRelation.length > 0
        && (fact.relations?.includes(contextRelation) ?? false);

      if (!insideContext && !relatedToContext) {
        return [];
      }

      return [{
        ...fact,
        ...(insideContext && fact.relations?.length > 0
          ? {
            displayRelationDirection: '>',
            displayRelations: fact.relations.map(folderNameForRelation)
          }
          : {}),
        ...(!insideContext && relatedToContext
          ? {
            displayRelationDirection: '<',
            displayRelations: [folderNameForFact(fact, model.rootPath)]
          }
          : {})
      }];
    });
}

function lensDefinitionForId(lensId, registry = defaultLensRegistry) {
  return lensDefinitionsFor(registry).find((lensDefinition) => lensDefinition.id === lensId);
}

export function filterFactsForLens(facts, lens = defaultLensId) {
  const lensDefinition = typeof lens === 'string'
    ? lensDefinitionForId(lens)
    : lens;
  const types = lensDefinition?.filter?.types ?? [];

  if (types.length > 0) {
    const allowedTypes = new Set(types);

    return facts.filter((fact) => allowedTypes.has(fact.type));
  }

  return facts;
}

const lensDefinitions = new Map([
  [
    'context_facts',
    {
      presenter: ({ model, state, lens }) => {
        const facts = filterFactsForLens(
          visibleFactsForContext(model, state.lensContextDirectory ?? state.currentContextDirectory),
          lens
        );

        return {
          body: {
            type: 'facts',
            template: lens.template ?? 'facts',
            facts
          },
          facts
        };
      }
    }
  ]
]);

function readLensConfigSync(configFilePath) {
  const config = JSON.parse(readFileSync(configFilePath, 'utf8'));

  if (!config || !Array.isArray(config.lenses)) {
    throw new Error(`${configFilePath} must contain a lenses array`);
  }

  return config;
}

function mergeLensDefinitions(defaultLenses, localLenses) {
  const mergedLenses = defaultLenses.map((lensDefinition) => ({ ...lensDefinition }));
  const indexesById = new Map(mergedLenses.map((lensDefinition, index) => [lensDefinition.id, index]));

  for (const localLens of localLenses) {
    if (indexesById.has(localLens.id)) {
      mergedLenses[indexesById.get(localLens.id)] = localLens;
      continue;
    }

    indexesById.set(localLens.id, mergedLenses.length);
    mergedLenses.push(localLens);
  }

  return mergedLenses;
}

function normalizeLensDefinition(lensDefinition) {
  if (!lensDefinition?.id || !lensDefinition.presenter) {
    throw new Error('lens definitions require id and presenter');
  }

  if (!lensDefinitions.has(lensDefinition.presenter)) {
    throw new Error(`unsupported lens presenter ${lensDefinition.presenter}`);
  }

  if (lensDefinition.template && !templateNamePattern.test(lensDefinition.template)) {
    throw new Error(`unsupported lens template ${lensDefinition.template}`);
  }

  return {
    id: lensDefinition.id,
    presenter: lensDefinition.presenter,
    ...(lensDefinition.template ? { template: lensDefinition.template } : {}),
    ...(lensDefinition.filter ? { filter: { ...lensDefinition.filter } } : {})
  };
}

function lensDefinitionsFor(registry = defaultLensRegistry) {
  return (registry ?? defaultLensRegistry).definitions;
}

export function createLensRegistry(lensConfigDefinitions) {
  return {
    definitions: lensConfigDefinitions.map(normalizeLensDefinition)
  };
}

const defaultLensRegistry = createLensRegistry(readLensConfigSync(defaultLensConfigPath).lenses);

export async function loadLensRegistry(options = {}) {
  const { rootDirectory } = options;
  const defaultLenses = readLensConfigSync(defaultLensConfigPath).lenses;

  if (!rootDirectory) {
    return createLensRegistry(defaultLenses);
  }

  const configFilePath = path.join(rootDirectory, lensConfigPath);
  let localConfig;

  try {
    localConfig = JSON.parse(await readFile(configFilePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createLensRegistry(defaultLenses);
    }

    throw error;
  }

  if (!localConfig || !Array.isArray(localConfig.lenses)) {
    throw new Error(`${lensConfigPath} must contain a lenses array`);
  }

  return createLensRegistry(mergeLensDefinitions(defaultLenses, localConfig.lenses));
}

export function lensIds(registry = defaultLensRegistry) {
  return lensDefinitionsFor(registry).map((lensDefinition) => lensDefinition.id);
}

export function hasLens(lensId, registry = defaultLensRegistry) {
  return lensDefinitionsFor(registry).some((lensDefinition) => lensDefinition.id === lensId);
}

export function presentLens(input) {
  const definitions = lensDefinitionsFor(input.lensRegistry);
  const lens = definitions.find((candidate) => candidate.id === (input.lensId ?? defaultLensId))
    ?? definitions.find((candidate) => candidate.id === defaultLensId);
  const presenter = lensDefinitions.get(lens.presenter).presenter;

  return presenter({
    ...input,
    lens
  });
}
