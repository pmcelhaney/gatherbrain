import { mkdir } from 'node:fs/promises';
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
  return (await contextIds(state)).map((contextId) => ({
    folder: contextId.split('/').at(-1) ?? contextId,
    name: contextId
  }));
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
  const knownContexts = await contextIds(state);

  if (!knownContexts.includes(normalizedContext)) {
    throw new Error(`context ${contextReference} does not exist`);
  }

  return contextDirectory;
}

export async function resolveExistingSwitchContextDirectory(contextReference, state) {
  const contextId = contextIdForSwitchReference(contextReference, state);
  const contextDirectory = contextDirectoryForId(state, contextId);
  const model = await ensureWorkspaceModel(state);

  if (model.contexts.has(contextId)) {
    return contextDirectory;
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
      return rootRelativeContextDirectory;
    }
  }

  throw new Error(`context ${contextReference} does not exist`);
}

export function contextDirectoryForSwitchReference(contextReference, state) {
  return contextDirectoryForId(state, contextIdForSwitchReference(contextReference, state));
}

export function contextHasHiddenPathPart(contextDirectory, state) {
  return path
    .relative(state.rootDirectory, contextDirectory)
    .split(path.sep)
    .some((pathPart) => pathPart.startsWith('.'));
}

export async function createContext(state, contextDirectory) {
  await mkdir(contextDirectory, { recursive: true });
  await refreshContext(await ensureWorkspaceModel(state), contextDirectory);

  return {
    contextDirectory,
    contextId: contextIdForDirectory(state, contextDirectory)
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

  return {
    path: savedPath,
    relativePath: path.relative(state.appDirectory, savedPath)
  };
}

export async function deleteWorkspaceFact(state, fact) {
  await deleteFact(fact.path);
  removeFact(await ensureWorkspaceModel(state), fact.path);
}

export async function relationForContextReference(contextReference, state) {
  const requestedContext = contextReference.trim();

  if (requestedContext.length === 0) {
    throw new Error('usage: :relate <item> <context>');
  }

  const normalizedContext = requestedContext.replace(/^\/+/u, '');
  const knownContexts = await contextIds(state);
  const matches = knownContexts.filter((contextName) => {
    const contextFolder = contextName.split('/').at(-1) ?? contextName;

    return contextName === normalizedContext
      || contextFolder === normalizedContext;
  });

  if (matches.length === 0) {
    throw new Error(`context ${requestedContext} does not exist`);
  }

  if (matches.length > 1) {
    throw new Error(`context ${requestedContext} is ambiguous`);
  }

  return matches[0];
}

export async function relateWorkspaceFact(state, fact, contextReference) {
  const relation = await relationForContextReference(contextReference, state);

  await addFactRelation(fact.path, relation);
  await refreshFact(await ensureWorkspaceModel(state), fact.path);

  return relation;
}

export async function setWorkspaceFactType(state, fact, type) {
  await updateFactType(fact.path, type);
  await refreshFact(await ensureWorkspaceModel(state), fact.path);
}

export async function setWorkspaceFactProperty(state, fact, property, value) {
  await updateFactProperty(fact.path, property, value);
  await refreshFact(await ensureWorkspaceModel(state), fact.path);
}

export async function refreshWorkspaceFact(state, filePath) {
  await refreshFact(await ensureWorkspaceModel(state), filePath);
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
