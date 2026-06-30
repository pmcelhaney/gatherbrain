import { access, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import {
  addFactRelation,
  deleteFact,
  resolveContextDirectory,
  saveFact,
  updateFactProperty,
  updateFactType
} from './facts.js';
import {
  loadWorkspaceModel,
  refreshContext,
  refreshFact,
  removeFact
} from './model.js';
import { addEnumValue } from './enums.js';
import { formatDateArgument } from './dates.js';
import { logEvent } from './events.js';
import {
  defaultLensId,
  presentLens
} from './lenses.js';

export async function ensureWorkspaceModel(state) {
  if (!state.model) {
    state.model = await loadWorkspaceModel({ rootDirectory: state.rootDirectory });
  }

  return state.model;
}

export function contextIdForDirectory(state, contextDirectory) {
  const contextId = path
    .relative(state.rootDirectory, contextDirectory)
    .split(path.sep)
    .join('/');

  return contextId === '' ? '' : contextId;
}

export function contextDirectoryForId(state, contextId) {
  return contextId === ''
    ? state.rootDirectory
    : path.join(state.rootDirectory, ...contextId.split('/'));
}

export async function contextIds(state) {
  const model = await ensureWorkspaceModel(state);

  return [...model.contexts.keys()].filter((contextId) => contextId !== '').sort();
}

export async function contextLinks(state) {
  const model = await ensureWorkspaceModel(state);

  return (await contextIds(state)).map((contextId) => {
    const metadata = model.contexts.get(contextId)?.metadata;

    return {
      aliases: metadata?.aliases ?? [],
      folder: contextId.split('/').at(-1) ?? contextId,
      name: contextId
    };
  });
}

export async function contextMetadata(state, contextId = currentContextId(state)) {
  const model = await ensureWorkspaceModel(state);

  return model.contexts.get(contextId)?.metadata ?? null;
}

function factsForModel(model) {
  return [...model.facts.values()]
    .sort((left, right) => {
      const createdComparison = (right.createdAt ?? '').localeCompare(left.createdAt ?? '');

      if (createdComparison !== 0) {
        return createdComparison;
      }

      const filenameComparison = path.basename(right.filename).localeCompare(path.basename(left.filename));

      return filenameComparison === 0
        ? right.filename.localeCompare(left.filename)
        : filenameComparison;
    });
}

function currentContextId(state) {
  return contextIdForDirectory(state, state.currentContextDirectory);
}

function activeLensContextDirectory(state) {
  return state.peekContextDirectory ?? state.currentContextDirectory;
}

function activeLensId(state) {
  return state.peekContextDirectory
    ? state.peekLensId ?? defaultLensId
    : state.currentLensId ?? defaultLensId;
}

function factIsInContextTree(fact, contextId) {
  return contextId === ''
    || fact.contextId === contextId
    || fact.contextId.startsWith(`${contextId}/`);
}

function factIsRelatedToContext(fact, contextId) {
  return contextId.length > 0 && (fact.relations?.includes(contextId) ?? false);
}

function factHasDueDate(fact) {
  return Boolean(fact.properties?.due);
}

function factIsDone(fact) {
  return fact.type === 'done';
}

function factIsDueOnOrBefore(fact, dateString) {
  const dueDate = fact.properties?.due;

  return Boolean(dueDate) && dueDate <= dateString;
}

function factWasModifiedOn(fact, dateString) {
  return fact.modifiedAt
    ? formatDateArgument(new Date(fact.modifiedAt)) === dateString
    : false;
}

export async function allFacts(state) {
  return factsForModel(await ensureWorkspaceModel(state));
}

export async function factsInContext(state, options = {}) {
  const {
    contextId = currentContextId(state),
    includeChildContexts = true,
    includeRelated = false
  } = options;
  const facts = await allFacts(state);

  return facts.filter((fact) => {
    const directMatch = includeChildContexts
      ? factIsInContextTree(fact, contextId)
      : fact.contextId === contextId;

    return directMatch || (includeRelated && factIsRelatedToContext(fact, contextId));
  });
}

export async function relatedFacts(state, contextId = currentContextId(state)) {
  const facts = await allFacts(state);

  return facts.filter((fact) => factIsRelatedToContext(fact, contextId));
}

export async function factsByType(state, types) {
  const allowedTypes = new Set(Array.isArray(types) ? types : [types]);
  const facts = await allFacts(state);

  return facts.filter((fact) => allowedTypes.has(fact.type));
}

export async function recentFacts(state, options = {}) {
  const {
    contextId = null,
    includeChildContexts = true,
    includeRelated = false,
    limit = 10
  } = options;
  const facts = contextId === null
    ? await allFacts(state)
    : await factsInContext(state, { contextId, includeChildContexts, includeRelated });

  return Number.isInteger(limit) && limit >= 0
    ? facts.slice(0, limit)
    : facts;
}

export async function dueFacts(state, options = {}) {
  const facts = await factsInContext(state, {
    contextId: options.contextId ?? currentContextId(state),
    includeChildContexts: options.includeChildContexts ?? true,
    includeRelated: options.includeRelated ?? true
  });

  return facts.filter((fact) => factHasDueDate(fact) && !factIsDone(fact));
}

export async function todayFacts(state, options = {}) {
  const today = formatDateArgument(options.today ?? state.dateToday ?? new Date());
  const facts = await dueFacts(state, options);

  return facts.filter((fact) => factIsDueOnOrBefore(fact, today));
}

export async function currentFacts(state, options = {}) {
  const today = formatDateArgument(options.today ?? state.dateToday ?? new Date());
  const facts = await factsInContext(state, {
    contextId: options.contextId ?? currentContextId(state),
    includeChildContexts: options.includeChildContexts ?? true,
    includeRelated: options.includeRelated ?? true
  });

  return facts.filter((fact) => (
    (factIsDueOnOrBefore(fact, today) && !factIsDone(fact))
    || (factIsDone(fact) && factWasModifiedOn(fact, today))
  ));
}

function searchableScalar(value) {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => searchableScalar(item));
  }

  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => [key, ...searchableScalar(item)]);
  }

  return [String(value)];
}

function contextSearchText(context) {
  if (!context) {
    return [];
  }

  return [
    context.id || '/',
    context.name,
    context.metadata?.title,
    context.metadata?.text,
    ...(context.metadata?.aliases ?? []),
    ...searchableScalar(context.metadata?.properties ?? {})
  ];
}

function linkedContextIdsForFact(fact, model) {
  const contextIds = new Set(fact.relations ?? []);
  const markdownLinkPattern = /\[[^\]]+\]\(\/(?<contextId>[^)#?]+)(?:[#?][^)]*)?\)/gu;

  for (const match of fact.text.matchAll(markdownLinkPattern)) {
    let contextId;

    try {
      contextId = decodeURI(match.groups.contextId).replace(/^\/+/u, '');
    } catch {
      continue;
    }

    if (model.contexts.has(contextId)) {
      contextIds.add(contextId);
    }
  }

  return [...contextIds].sort();
}

function searchableTextForFact(fact, model) {
  const ownContext = model.contexts.get(fact.contextId);
  const linkedContexts = linkedContextIdsForFact(fact, model)
    .map((contextId) => model.contexts.get(contextId))
    .filter(Boolean);

  return [
    fact.id,
    fact.filename,
    fact.title,
    fact.type,
    fact.text,
    ...searchableScalar(fact.properties ?? {}),
    ...contextSearchText(ownContext),
    ...linkedContexts.flatMap((context) => contextSearchText(context))
  ].join('\n').toLocaleLowerCase('en-US');
}

export async function searchFacts(state, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase('en-US');

  if (normalizedQuery.length === 0) {
    return [];
  }

  const model = await ensureWorkspaceModel(state);

  return [...model.facts.values()]
    .filter((fact) => searchableTextForFact(fact, model).includes(normalizedQuery))
    .toSorted((left, right) => {
      const modifiedComparison = (right.modifiedAt ?? '').localeCompare(left.modifiedAt ?? '');

      return modifiedComparison === 0
        ? left.filename.localeCompare(right.filename)
        : modifiedComparison;
    });
}

export async function visibleFacts(state, options = {}) {
  const model = await ensureWorkspaceModel(state);
  const lensContextDirectory = options.contextId === undefined
    ? activeLensContextDirectory(state)
    : contextDirectoryForId(state, options.contextId);
  const lensModel = presentLens({
    model,
    state: {
      ...state,
      lensContextDirectory
    },
    lensRegistry: state.lensRegistry,
    lensId: options.lensId ?? activeLensId(state)
  });

  return lensModel.facts ?? lensModel.body?.facts ?? [];
}

function contextReferenceParts(contextReference) {
  return contextReference.split('/').filter((pathPart) => pathPart.length > 0);
}

function normalizeContextReferenceParts(contextReference, initialParts = []) {
  const parts = [...initialParts];

  for (const part of contextReferenceParts(contextReference)) {
    if (part === '.') {
      continue;
    }

    if (part === '..') {
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  return parts;
}

function contextIdRelativeToCurrent(contextReference, state) {
  const relativeContext = path
    .relative(state.rootDirectory, state.currentContextDirectory)
    .split(path.sep)
    .join('/');
  const parts = normalizeContextReferenceParts(contextReference, contextReferenceParts(relativeContext));

  return parts.join('/');
}

export function contextIdForSwitchReference(contextReference, state) {
  const requestedContext = contextReference.trim();

  if (requestedContext.length === 0) {
    throw new Error('context name is required');
  }

  if (requestedContext === '/') {
    return '';
  }

  if (requestedContext.startsWith('/')) {
    return normalizeContextReferenceParts(requestedContext).join('/');
  }

  return contextIdRelativeToCurrent(requestedContext, state);
}

export async function resolveExistingContextDirectory(contextReference, state) {
  const contextDirectory = resolveContextDirectory(contextReference, {
    rootDirectory: state.rootDirectory
  });
  const normalizedContext = contextIdForDirectory(state, contextDirectory);
  const model = await ensureWorkspaceModel(state);

  if (model.contexts.has(normalizedContext)) {
    return contextDirectory;
  }

  const aliasContextId = uniqueContextIdForAlias(contextReference, model);

  if (aliasContextId) {
    return contextDirectoryForId(state, aliasContextId);
  }

  throw new Error(`context ${contextReference} does not exist`);
}

export async function resolveExistingSwitchContextDirectory(contextReference, state) {
  const contextId = await resolveExistingSwitchContextId(contextReference, state);

  return contextDirectoryForId(state, contextId);
}

export async function resolveExistingSwitchContextId(contextReference, state) {
  const contextId = contextIdForSwitchReference(contextReference, state);
  const model = await ensureWorkspaceModel(state);

  if (model.contexts.has(contextId)) {
    return contextId;
  }

  const aliasContextId = uniqueContextIdForAlias(contextReference, model);

  if (aliasContextId) {
    return aliasContextId;
  }

  const requestedContext = contextReference.trim();

  if (
    !requestedContext.startsWith('/')
    && !requestedContext.startsWith('./')
    && !requestedContext.startsWith('../')
    && requestedContext !== '.'
    && requestedContext !== '..'
  ) {
    const rootRelativeContextDirectory = resolveContextDirectory(requestedContext, {
      rootDirectory: state.rootDirectory
    });
    const rootRelativeContextId = contextIdForDirectory(state, rootRelativeContextDirectory);

    if (model.contexts.has(rootRelativeContextId)) {
      return rootRelativeContextId;
    }

    const directoryNameContextId = uniqueContextIdForDirectoryName(requestedContext, model);

    if (directoryNameContextId) {
      return directoryNameContextId;
    }

    const suffixContextId = uniqueContextIdForSuffix(requestedContext, model);

    if (suffixContextId) {
      return suffixContextId;
    }
  }

  throw new Error(`context ${contextReference} does not exist`);
}

export function contextDirectoryForSwitchReference(contextReference, state) {
  return contextDirectoryForId(state, contextIdForSwitchReference(contextReference, state));
}

function contextAliasMatches(context, contextReference) {
  const requestedContext = contextReference.trim().replace(/^@/u, '');

  if (
    requestedContext.length === 0
    || requestedContext.startsWith('/')
    || requestedContext.startsWith('./')
    || requestedContext.startsWith('../')
    || requestedContext === '.'
    || requestedContext === '..'
  ) {
    return false;
  }

  return context.metadata?.aliases?.some((alias) => alias === requestedContext) ?? false;
}

function contextIdsForAlias(contextReference, model) {
  return [...model.contexts.values()]
    .filter((context) => context.id !== '' && contextAliasMatches(context, contextReference))
    .map((context) => context.id)
    .sort();
}

function uniqueContextIdForAlias(contextReference, model) {
  const matches = contextIdsForAlias(contextReference, model);

  if (matches.length > 1) {
    throw new Error(`context ${contextReference} is ambiguous`);
  }

  return matches.at(0) ?? null;
}

function contextNameKey(contextName) {
  return contextName.toLocaleLowerCase('en-US');
}

function contextDirectoryName(contextId) {
  return contextId.split('/').at(-1) ?? contextId;
}

function contextIdsForDirectoryName(contextReference, model) {
  const requestedContext = contextReference.trim().replace(/^@/u, '');

  if (
    requestedContext.length === 0
    || requestedContext.includes('/')
    || requestedContext === '.'
    || requestedContext === '..'
  ) {
    return [];
  }

  const requestedKey = contextNameKey(requestedContext);

  return [...model.contexts.values()]
    .filter((context) => (
      context.id !== ''
      && contextNameKey(contextDirectoryName(context.id)) === requestedKey
    ))
    .map((context) => context.id)
    .sort();
}

function uniqueContextIdForDirectoryName(contextReference, model) {
  const matches = contextIdsForDirectoryName(contextReference, model);

  if (matches.length > 1) {
    throw new Error(`context ${contextReference} is ambiguous`);
  }

  return matches.at(0) ?? null;
}

function contextIdHasSuffix(contextId, contextReference) {
  const contextParts = contextReferenceParts(contextId);
  const referenceParts = contextReferenceParts(contextReference);

  if (referenceParts.length === 0 || referenceParts.length > contextParts.length) {
    return false;
  }

  const suffixParts = contextParts.slice(contextParts.length - referenceParts.length);

  return suffixParts.every((part, index) => part === referenceParts[index]);
}

function uniqueContextIdForSuffix(contextReference, model) {
  const matches = [...model.contexts.values()]
    .filter((context) => context.id !== '' && contextIdHasSuffix(context.id, contextReference))
    .map((context) => context.id)
    .sort();

  if (matches.length > 1) {
    throw new Error(`context ${contextReference} is ambiguous`);
  }

  return matches.at(0) ?? null;
}

export function contextHasHiddenPathPart(contextDirectory, state) {
  return path
    .relative(state.rootDirectory, contextDirectory)
    .split(path.sep)
    .some((pathPart) => pathPart.startsWith('.'));
}

function contextLabel(contextId) {
  return contextId === '' ? '/' : `/${contextId}`;
}

function duplicateContextDirectoryNameMessage(contextName, contextId) {
  return `context directory name ${contextName} already exists at ${contextLabel(contextId)}`;
}

async function assertContextDirectoryNamesAvailable(state, contextDirectory) {
  const model = await ensureWorkspaceModel(state);
  const targetContextId = contextIdForDirectory(state, contextDirectory);
  const targetParts = contextReferenceParts(targetContextId);
  const plannedNames = new Map();

  for (let index = 0; index < targetParts.length; index += 1) {
    const candidateId = targetParts.slice(0, index + 1).join('/');

    if (model.contexts.has(candidateId)) {
      continue;
    }

    const candidateName = contextDirectoryName(candidateId);
    const candidateKey = contextNameKey(candidateName);
    const existingContextId = [...model.contexts.keys()]
      .filter((contextId) => contextId !== '')
      .find((contextId) => contextNameKey(contextDirectoryName(contextId)) === candidateKey);

    if (existingContextId) {
      throw new Error(duplicateContextDirectoryNameMessage(candidateName, existingContextId));
    }

    if (plannedNames.has(candidateKey)) {
      throw new Error(duplicateContextDirectoryNameMessage(candidateName, plannedNames.get(candidateKey)));
    }

    plannedNames.set(candidateKey, candidateId);
  }
}

export async function createContext(state, contextDirectory) {
  await assertContextDirectoryNamesAvailable(state, contextDirectory);
  await mkdir(contextDirectory, { recursive: true });
  await refreshContext(await ensureWorkspaceModel(state), contextDirectory);
  const contextId = contextIdForDirectory(state, contextDirectory);
  await logEvent(state, 'context.created', {
    contextId: contextId || '/',
    path: contextDirectory
  });

  return {
    contextDirectory,
    contextId
  };
}

export async function createFact(state, options = {}) {
  const {
    body = null,
    contextLinks: explicitContextLinks = null,
    properties = {},
    relatePeek = true,
    title,
    type = 'fact'
  } = options;
  const savedPath = await saveFact(title, {
    body,
    contextLinks: explicitContextLinks ?? await contextLinks(state),
    properties,
    relations: relatePeek && state.peekContextDirectory
      ? [contextIdForDirectory(state, state.peekContextDirectory)]
      : [],
    rootDirectory: state.currentContextDirectory,
    type
  });

  await refreshContext(await ensureWorkspaceModel(state), state.currentContextDirectory);
  const factId = path.relative(state.rootDirectory, savedPath).split(path.sep).join('/');
  const fact = state.model.facts.get(factId);

  await logEvent(state, 'fact.created', {
    factId,
    uuid: fact?.uuid,
    contextId: contextIdForDirectory(state, state.currentContextDirectory) || '/',
    title: fact?.title ?? title,
    type
  });

  return {
    path: savedPath,
    relativePath: path.relative(state.appDirectory, savedPath)
  };
}

export async function deleteWorkspaceFact(state, fact) {
  await deleteFact(fact.path);
  removeFact(await ensureWorkspaceModel(state), fact.path);
  await logEvent(state, 'fact.deleted', {
    factId: fact.id,
    uuid: fact.uuid,
    contextId: fact.contextId || '/',
    path: fact.path
  });
}

async function uniqueMovedFactPath(targetDirectory, filename) {
  const extension = path.extname(filename);
  const baseName = path.basename(filename, extension);

  for (let index = 0; index < 1000; index += 1) {
    const candidateName = index === 0
      ? filename
      : `${baseName}-${index + 1}${extension}`;
    const candidatePath = path.join(targetDirectory, candidateName);

    try {
      await access(candidatePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return candidatePath;
      }

      throw error;
    }
  }

  throw new Error(`could not find available filename for ${filename}`);
}

function metadataContextId(contextId) {
  return contextId || '/';
}

export async function moveWorkspaceFact(state, fact, contextReference) {
  const model = await ensureWorkspaceModel(state);
  const requestedTargetContextId = contextIdForSwitchReference(contextReference, state);
  const targetContextId = model.contexts.has(requestedTargetContextId)
    ? requestedTargetContextId
    : uniqueContextIdForAlias(contextReference, model)
      ?? uniqueContextIdForDirectoryName(contextReference, model)
      ?? requestedTargetContextId;

  if (!model.contexts.has(targetContextId)) {
    throw new Error(`context ${contextReference} does not exist`);
  }

  if (fact.contextId === targetContextId) {
    throw new Error(`fact is already in context ${metadataContextId(targetContextId)}`);
  }

  const targetDirectory = contextDirectoryForId(state, targetContextId);
  const targetPath = await uniqueMovedFactPath(targetDirectory, path.basename(fact.path));
  const sourceContextId = fact.contextId;

  await addFactRelation(fact.path, metadataContextId(sourceContextId));
  await rename(fact.path, targetPath);
  removeFact(model, fact.path);
  const movedFact = await refreshFact(model, targetPath);
  await logEvent(state, 'fact.moved', {
    factId: fact.id,
    newFactId: movedFact?.id,
    uuid: movedFact?.uuid ?? fact.uuid,
    fromContextId: metadataContextId(sourceContextId),
    toContextId: metadataContextId(targetContextId),
    fromPath: fact.path,
    toPath: targetPath
  });

  return {
    fact: movedFact,
    fromContextId: sourceContextId,
    toContextId: targetContextId,
    path: targetPath
  };
}

export async function relationForContextReference(contextReference, state) {
  const requestedContext = contextReference.trim();

  if (requestedContext.length === 0) {
    throw new Error('context is required');
  }

  const normalizedContext = requestedContext.replace(/^\/+/u, '');
  const model = await ensureWorkspaceModel(state);
  const knownContexts = await contextIds(state);
  const matches = knownContexts.filter((contextName) => {
    const contextFolder = contextDirectoryName(contextName);

    return contextNameKey(contextName) === contextNameKey(normalizedContext)
      || contextNameKey(contextFolder) === contextNameKey(normalizedContext);
  });

  if (matches.length === 0) {
    const aliasMatches = contextIdsForAlias(requestedContext, model);

    if (aliasMatches.length === 0) {
      throw new Error(`context ${requestedContext} does not exist`);
    }

    if (aliasMatches.length > 1) {
      throw new Error(`context ${requestedContext} is ambiguous`);
    }

    return aliasMatches[0];
  }

  if (matches.length > 1) {
    throw new Error(`context ${requestedContext} is ambiguous`);
  }

  return matches[0];
}

export async function relateWorkspaceFact(state, fact, contextReference) {
  const relation = await relationForContextReference(contextReference, state);

  return relateWorkspaceFactToContextId(state, fact, relation);
}

export async function relateWorkspaceFactToContextId(state, fact, contextId) {
  const model = await ensureWorkspaceModel(state);

  if (!model.contexts.has(contextId)) {
    throw new Error(`context ${metadataContextId(contextId)} does not exist`);
  }

  const relation = metadataContextId(contextId);
  await addFactRelation(fact.path, relation);
  const refreshedFact = await refreshFact(model, fact.path);
  await logEvent(state, 'fact.related', {
    factId: fact.id,
    uuid: refreshedFact?.uuid ?? fact.uuid,
    relation
  });

  return relation;
}

export async function setWorkspaceFactType(state, fact, type) {
  const previousType = fact.type;

  await updateFactType(fact.path, type);
  const refreshedFact = await refreshFact(await ensureWorkspaceModel(state), fact.path);
  await logEvent(state, 'fact.type_changed', {
    factId: fact.id,
    uuid: refreshedFact?.uuid ?? fact.uuid,
    from: previousType,
    to: type
  });
}

export async function setWorkspaceFactProperty(state, fact, property, value) {
  const previousValue = fact.properties?.[property] ?? null;

  await updateFactProperty(fact.path, property, value);
  const refreshedFact = await refreshFact(await ensureWorkspaceModel(state), fact.path);
  await logEvent(state, 'fact.property_changed', {
    factId: fact.id,
    uuid: refreshedFact?.uuid ?? fact.uuid,
    property,
    from: previousValue,
    to: value
  });
}

export async function refreshWorkspaceFact(state, filePath) {
  return refreshFact(await ensureWorkspaceModel(state), filePath);
}

export function referencedFilePathForFact(fact, itemLabel) {
  const referencedFile = fact.properties?.file;

  if (!referencedFile) {
    throw new Error(`item ${itemLabel} does not reference a file`);
  }

  return path.isAbsolute(referencedFile)
    ? referencedFile
    : path.resolve(path.dirname(fact.path), referencedFile);
}

export async function addWorkspaceEnumValue(state, enumName, value) {
  return addEnumValue({
    rootDirectory: state.rootDirectory,
    enumName,
    value
  });
}
