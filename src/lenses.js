import path from 'node:path';

export const defaultLensId = 'all';

const todoLensTypes = new Set(['todo', 'waiting', 'in progress', 'fact']);

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

export function filterFactsForLens(facts, lensId = defaultLensId) {
  if (lensId === 'todo') {
    return facts.filter((fact) => todoLensTypes.has(fact.type));
  }

  return facts;
}

const lensDefinitions = new Map([
  [
    'all',
    {
      id: 'all',
      presenter: ({ model, state }) => ({
        facts: visibleFactsForContext(model, state.currentContextDirectory)
      })
    }
  ],
  [
    'todo',
    {
      id: 'todo',
      presenter: ({ model, state }) => ({
        facts: filterFactsForLens(
          visibleFactsForContext(model, state.currentContextDirectory),
          'todo'
        )
      })
    }
  ]
]);

export function lensIds() {
  return [...lensDefinitions.keys()];
}

export function hasLens(lensId) {
  return lensDefinitions.has(lensId);
}

export function presentLens(input) {
  const lens = lensDefinitions.get(input.lensId ?? defaultLensId) ?? lensDefinitions.get(defaultLensId);

  return lens.presenter(input);
}
