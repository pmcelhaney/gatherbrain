import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  factRelationsFromMarkdown,
  factTextFromMarkdown,
  factTitleFromMarkdown,
  factTypeFromMarkdown
} from './facts.js';

function toWorkspacePath(filePath) {
  return filePath.split(path.sep).join('/');
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
    factIds: []
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
  const markdown = await readFile(filePath, 'utf8');
  const id = relativeId(rootPath, filePath);
  const contextId = contextIdForFactId(id);
  const relations = factRelationsFromMarkdown(markdown);
  const title = factTitleFromMarkdown(markdown) ?? path.basename(filePath, '.md');
  const body = factTextFromMarkdown(markdown);

  return {
    id,
    path: filePath,
    contextId,
    filename: id,
    ...(relations.length > 0 ? { relations } : {}),
    title,
    type: factTypeFromMarkdown(markdown) ?? 'fact',
    text: body.length > 0 ? body : title
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
