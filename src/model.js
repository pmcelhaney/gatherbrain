import { watch } from 'node:fs';
import { readdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  contextAliasesFromMarkdown,
  ensureFactUuidInMarkdown,
  factRelationsFromMarkdown,
  factPropertiesFromMarkdown,
  factTextFromMarkdown,
  factTitleFromMarkdown,
  factTypeFromMarkdown
} from './facts.js';

const contextMetadataFilename = 'index.md';

function toWorkspacePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function hasHiddenPathPart(workspacePath) {
  return workspacePath
    .split('/')
    .some((pathPart) => pathPart.startsWith('.'));
}

function watchEventAffectsModel(filename) {
  if (filename === null || filename === undefined) {
    return true;
  }

  return !hasHiddenPathPart(toWorkspacePath(String(filename)));
}

function relativeId(rootPath, filePath) {
  const relativePath = path.relative(rootPath, filePath);

  return relativePath === '' ? '' : toWorkspacePath(relativePath);
}

function contextIdForFactId(factId) {
  const contextId = path.posix.dirname(factId);

  return contextId === '.' ? '' : contextId;
}

function contextNameForId(contextId, rootPath) {
  return contextId === '' ? path.basename(rootPath) : contextId.split('/').at(-1);
}

function makeContext(rootPath, contextId) {
  return {
    id: contextId,
    path: contextId === '' ? rootPath : path.join(rootPath, ...contextId.split('/')),
    name: contextNameForId(contextId, rootPath),
    parentId: contextId === '' ? null : contextIdForFactId(contextId),
    childContextIds: [],
    factIds: [],
    metadata: null
  };
}

function ensureContext(model, contextId) {
  if (model.contexts.has(contextId)) {
    return model.contexts.get(contextId);
  }

  const context = makeContext(model.rootPath, contextId);
  model.contexts.set(contextId, context);

  if (context.parentId !== null) {
    const parent = ensureContext(model, context.parentId);

    if (!parent.childContextIds.includes(contextId)) {
      parent.childContextIds.push(contextId);
      parent.childContextIds.sort();
    }
  }

  return context;
}

function removeFactFromContexts(model, factId) {
  for (const context of model.contexts.values()) {
    context.factIds = context.factIds.filter((candidateId) => candidateId !== factId);
  }
}

export function factPathToId(model, factPath) {
  return relativeId(model.rootPath, path.resolve(factPath));
}

export function contextPathToId(model, contextPath) {
  return relativeId(model.rootPath, path.resolve(contextPath));
}

export async function readFact(rootPath, filePath) {
  let markdown = await readFile(filePath, 'utf8');
  const fileStat = await stat(filePath);
  const ensuredUuid = ensureFactUuidInMarkdown(markdown);

  if (ensuredUuid.changed) {
    await writeFile(filePath, ensuredUuid.markdown);
    await utimes(filePath, fileStat.atime, fileStat.mtime);
    markdown = ensuredUuid.markdown;
  }

  const id = relativeId(rootPath, filePath);
  const contextId = contextIdForFactId(id);
  const relations = factRelationsFromMarkdown(markdown);
  const properties = factPropertiesFromMarkdown(markdown);
  const title = factTitleFromMarkdown(markdown);
  const body = factTextFromMarkdown(markdown);

  return {
    id,
    path: filePath,
    contextId,
    filename: id,
    createdAt: fileStat.birthtime.toISOString(),
    modifiedAt: fileStat.mtime.toISOString(),
    properties,
    uuid: ensuredUuid.uuid,
    ...(relations.length > 0 ? { relations } : {}),
    title,
    type: factTypeFromMarkdown(markdown) ?? 'fact',
    text: body.length > 0 ? body : title ?? ''
  };
}

export async function readContextMetadata(rootPath, filePath) {
  const markdown = await readFile(filePath, 'utf8');
  const fileStat = await stat(filePath);
  const id = relativeId(rootPath, filePath);
  const contextId = contextIdForFactId(id);
  const properties = factPropertiesFromMarkdown(markdown);
  const title = factTitleFromMarkdown(markdown);
  const body = factTextFromMarkdown(markdown);
  const aliases = contextAliasesFromMarkdown(markdown);

  return {
    id,
    path: filePath,
    contextId,
    filename: id,
    aliases,
    createdAt: fileStat.birthtime.toISOString(),
    modifiedAt: fileStat.mtime.toISOString(),
    properties,
    title,
    type: factTypeFromMarkdown(markdown) ?? 'context',
    text: body
  };
}

export async function loadWorkspaceModel(options = {}) {
  const { rootDirectory } = options;

  if (!rootDirectory) {
    throw new Error('rootDirectory is required');
  }

  const rootPath = path.resolve(rootDirectory);
  const model = {
    rootPath,
    contexts: new Map(),
    facts: new Map()
  };

  ensureContext(model, '');

  async function visit(directory) {
    let entries;

    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }

      throw error;
    }

    const sortedEntries = entries.toSorted((left, right) => left.name.localeCompare(right.name));

    await Promise.all(
      sortedEntries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          if (entry.name.startsWith('.')) {
            return;
          }

          ensureContext(model, relativeId(rootPath, entryPath));
          await visit(entryPath);
          return;
        }

        if (entry.isFile() && path.extname(entry.name) === '.md') {
          if (entry.name === contextMetadataFilename) {
            const metadata = await readContextMetadata(rootPath, entryPath);
            const context = ensureContext(model, metadata.contextId);

            context.metadata = metadata;
            return;
          }

          const fact = await readFact(rootPath, entryPath);
          const context = ensureContext(model, fact.contextId);

          model.facts.set(fact.id, fact);
          context.factIds.push(fact.id);
          context.factIds.sort();
        }
      })
    );
  }

  await visit(rootPath);
  return model;
}

export async function refreshFact(model, factPath) {
  const resolvedFactPath = path.resolve(factPath);
  const factId = factPathToId(model, resolvedFactPath);
  let fileStat;

  try {
    fileStat = await stat(resolvedFactPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      removeFact(model, resolvedFactPath);
      return null;
    }

    throw error;
  }

  if (!fileStat.isFile() || path.extname(resolvedFactPath) !== '.md') {
    removeFact(model, resolvedFactPath);
    return null;
  }

  const fact = await readFact(model.rootPath, resolvedFactPath);
  removeFactFromContexts(model, factId);
  ensureContext(model, fact.contextId).factIds.push(fact.id);
  ensureContext(model, fact.contextId).factIds.sort();
  model.facts.set(fact.id, fact);

  return fact;
}

export async function refreshContext(model, contextPath) {
  const nextModel = await loadWorkspaceModel({ rootDirectory: model.rootPath });

  model.contexts = nextModel.contexts;
  model.facts = nextModel.facts;

  return model.contexts.get(contextPathToId(model, contextPath)) ?? null;
}

export function removeFact(model, factPath) {
  const factId = factPathToId(model, factPath);

  model.facts.delete(factId);
  removeFactFromContexts(model, factId);
}

export function watchWorkspaceModel(model, options = {}) {
  const {
    debounceMs = 50,
    onChange = () => {},
    onError = () => {},
    watchFunction = watch
  } = options;
  const watchers = new Map();
  let closed = false;
  let refreshTimer = null;
  let refreshing = false;
  let refreshAgain = false;

  function closeWatchers() {
    for (const watcher of watchers.values()) {
      watcher.close();
    }

    watchers.clear();
  }

  function watchContextDirectories() {
    closeWatchers();

    for (const context of model.contexts.values()) {
      try {
        const watcher = watchFunction(
          context.path,
          { persistent: false },
          (_eventType, filename) => {
            if (closed || !watchEventAffectsModel(filename)) {
              return;
            }

            scheduleRefresh();
          }
        );

        watcher.on?.('error', (error) => {
          if (!closed) {
            onError(error);
          }
        });
        watchers.set(context.id, watcher);
      } catch (error) {
        onError(error);
      }
    }
  }

  async function refreshModel() {
    if (closed) {
      return;
    }

    if (refreshing) {
      refreshAgain = true;
      return;
    }

    refreshing = true;

    try {
      do {
        refreshAgain = false;
        await refreshContext(model, model.rootPath);

        if (closed) {
          return;
        }

        watchContextDirectories();
        await onChange(model);
      } while (refreshAgain && !closed);
    } catch (error) {
      onError(error);
    } finally {
      refreshing = false;
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refreshModel();
    }, debounceMs);
  }

  watchContextDirectories();

  return {
    close() {
      closed = true;

      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }

      closeWatchers();
    },
    refreshNow: refreshModel
  };
}
