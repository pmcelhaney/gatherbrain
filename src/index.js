#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import readline from 'node:readline/promises';
import { env as processEnv, stdin as input, stdout as output } from 'node:process';
import {
  commandNames,
  commandHelp,
  commandHelpText,
  parseEntry
} from './commands.js';
import {
  addFactRelation,
  deleteFact,
  resolveContextDirectory,
  saveFact,
  updateFactType
} from './facts.js';
import {
  loadWorkspaceModel,
  refreshContext,
  refreshFact,
  removeFact
} from './model.js';
import {
  defaultLensId,
  filterFactsForLens,
  hasLens,
  lensIds,
  presentLens
} from './lenses.js';

const defaultAppDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ansiTypeColor = '\x1b[36m';
const ansiLinkColor = '\x1b[34m';
const ansiRelationColor = '\x1b[35m';
const ansiResetColor = '\x1b[39m';
const ansiCodePattern = /\x1b\[[0-9;]*m/gu;
export function createPromptState(options = {}) {
  const appDirectory = options.appDirectory ?? defaultAppDirectory;
  const rootDirectory = options.rootDirectory ?? options.notesDirectory ?? path.join(appDirectory, 'notes');

  return {
    appDirectory,
    rootDirectory,
    currentContextDirectory: rootDirectory,
    gazeContextDirectory: null,
    currentLensId: defaultLensId,
    model: options.model ?? null,
    pageStartIndex: 0,
    temporaryBodyLines: null,
    lensBackStack: [],
    lensForwardStack: [],
    debugKeys: false,
    statusMessage: ''
  };
}

export function currentContextName(state) {
  const relativeContext = path.relative(
    state.rootDirectory,
    state.currentContextDirectory
  );

  return relativeContext.length > 0 ? relativeContext : path.basename(state.rootDirectory);
}

export function currentGazeName(state) {
  if (!state.gazeContextDirectory) {
    return null;
  }

  const relativeContext = path.relative(
    state.rootDirectory,
    state.gazeContextDirectory
  );

  return relativeContext.length > 0 ? relativeContext : path.basename(state.rootDirectory);
}

function currentLensIdForState(state) {
  return state.currentLensId ?? defaultLensId;
}

function currentLens(state) {
  return {
    currentLensId: currentLensIdForState(state),
    currentContextDirectory: state.currentContextDirectory
  };
}

function lensesAreEqual(left, right) {
  return left.currentLensId === right.currentLensId
    && path.resolve(left.currentContextDirectory) === path.resolve(right.currentContextDirectory);
}

function applyLens(state, lens) {
  state.currentLensId = lens.currentLensId;
  state.currentContextDirectory = lens.currentContextDirectory;
  state.pageStartIndex = 0;
  state.statusMessage = '';
  clearTemporaryBody(state);
}

function changeLens(state, nextLens) {
  const previousLens = currentLens(state);

  if (lensesAreEqual(previousLens, nextLens)) {
    state.pageStartIndex = 0;
    state.statusMessage = '';
    clearTemporaryBody(state);
    return false;
  }

  state.lensBackStack.push(previousLens);
  state.lensForwardStack = [];
  applyLens(state, nextLens);
  return true;
}

export function navigateLensBack(state) {
  const previousLens = state.lensBackStack.pop();

  if (!previousLens) {
    return false;
  }

  state.lensForwardStack.push(currentLens(state));
  applyLens(state, previousLens);
  return true;
}

export function navigateLensForward(state) {
  const nextLens = state.lensForwardStack.pop();

  if (!nextLens) {
    return false;
  }

  state.lensBackStack.push(currentLens(state));
  applyLens(state, nextLens);
  return true;
}

export function lensNavigationForKey(key) {
  if (!key) {
    return null;
  }

  if ((key.meta || key.alt) && key.name === 'left') {
    return 'back';
  }

  if ((key.meta || key.alt) && key.name === 'right') {
    return 'forward';
  }

  if (
    typeof key.sequence === 'string'
    && /^\x1b(?:b|\[(?:1;3D|3D))$/u.test(key.sequence)
  ) {
    return 'back';
  }

  if (
    typeof key.sequence === 'string'
    && /^\x1b(?:f|\[(?:1;3C|3C))$/u.test(key.sequence)
  ) {
    return 'forward';
  }

  return null;
}

export function pageNavigationForKey(key) {
  if (!key) {
    return null;
  }

  if (
    key.name === 'pagedown'
    || ((key.meta || key.alt) && key.name === 'down')
    || (key.ctrl && key.name === 'down' && key.sequence === '\x1b[1;5B')
  ) {
    return 'down';
  }

  if (
    key.name === 'pageup'
    || ((key.meta || key.alt) && key.name === 'up')
    || (key.ctrl && key.name === 'up' && key.sequence === '\x1b[1;5A')
  ) {
    return 'up';
  }

  if (
    typeof key.sequence === 'string'
    && /^(?:\x1b\[(?:1;[359]B|[359]B)|\x1b\x1b\[B)$/u.test(key.sequence)
  ) {
    return 'down';
  }

  if (
    typeof key.sequence === 'string'
    && /^(?:\x1b\[(?:1;[359]A|[359]A)|\x1b\x1b\[A)$/u.test(key.sequence)
  ) {
    return 'up';
  }

  return null;
}

function visibleKeyValue(value) {
  return JSON.stringify(value ?? null);
}

function keyCodePoints(value) {
  if (typeof value !== 'string') {
    return '[]';
  }

  return `[${[...value].map((character) => character.codePointAt(0).toString(16).padStart(2, '0')).join(', ')}]`;
}

export function keyDebugLines(value, key) {
  return [
    'Key debug:',
    `value: ${visibleKeyValue(value)}`,
    `value code points: ${keyCodePoints(value)}`,
    `name: ${visibleKeyValue(key?.name)}`,
    `sequence: ${visibleKeyValue(key?.sequence)}`,
    `sequence code points: ${keyCodePoints(key?.sequence)}`,
    `ctrl: ${String(key?.ctrl ?? false)}`,
    `meta: ${String(key?.meta ?? false)}`,
    `shift: ${String(key?.shift ?? false)}`
  ];
}

async function ensureModel(state) {
  if (!state.model) {
    state.model = await loadWorkspaceModel({ rootDirectory: state.rootDirectory });
  }

  return state.model;
}

async function contextIdsForState(state) {
  const model = await ensureModel(state);

  return [...model.contexts.keys()].filter((contextId) => contextId !== '').sort();
}

function contextIdForDirectory(state, contextDirectory) {
  const contextId = path
    .relative(state.rootDirectory, contextDirectory)
    .split(path.sep)
    .join('/');

  return contextId === '' ? '' : contextId;
}

function lensContextDirectoryForState(state) {
  return state.gazeContextDirectory ?? state.currentContextDirectory;
}

export function filterFactsForLensId(facts, lens = defaultLensId) {
  return filterFactsForLens(facts, lens);
}

export async function visibleFactsForState(state) {
  const model = await ensureModel(state);
  const lensModel = presentLens({
    model,
    state: {
      ...state,
      lensContextDirectory: lensContextDirectoryForState(state)
    },
    lensId: currentLensIdForState(state)
  });

  return lensModel.facts ?? [];
}

async function visibleFactAtIndex(state, index) {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error('item number must be a positive integer');
  }

  const facts = await visibleFactsForState(state);
  const fact = facts[index - 1];

  if (!fact) {
    throw new Error(`item ${index} does not exist`);
  }

  return fact;
}

function visibleLength(line) {
  return line.replace(ansiCodePattern, '').length;
}

function truncateVisible(line, columns) {
  let result = '';
  let visible = 0;

  for (let index = 0; index < line.length && visible < columns;) {
    const ansiCode = line.slice(index).match(/^\x1b\[[0-9;]*m/u);

    if (ansiCode) {
      result += ansiCode[0];
      index += ansiCode[0].length;
      continue;
    }

    result += line[index];
    index += 1;
    visible += 1;
  }

  if (
    result.lastIndexOf(ansiTypeColor) > result.lastIndexOf(ansiResetColor)
    || result.lastIndexOf(ansiLinkColor) > result.lastIndexOf(ansiResetColor)
    || result.lastIndexOf(ansiRelationColor) > result.lastIndexOf(ansiResetColor)
  ) {
    result += ansiResetColor;
  }

  return result;
}

function fitLine(line, columns) {
  if (columns <= 0) {
    return '';
  }

  if (visibleLength(line) <= columns) {
    return line;
  }

  if (columns <= 3) {
    return '.'.repeat(columns);
  }

  return `${truncateVisible(line, columns - 3)}...`;
}

function wrapPlainText(text, columns) {
  if (columns <= 0) {
    return [text];
  }

  const remainingText = text.trim();

  if (remainingText.length === 0) {
    return [''];
  }

  const lines = [];
  let remaining = remainingText;

  while (remaining.length > columns) {
    let breakIndex = -1;

    for (let index = columns; index > 0; index -= 1) {
      if (/\s/u.test(remaining[index])) {
        breakIndex = index;
        break;
      }
    }

    if (breakIndex === -1) {
      lines.push(remaining.slice(0, columns));
      remaining = remaining.slice(columns).trimStart();
      continue;
    }

    lines.push(remaining.slice(0, breakIndex));
    remaining = remaining.slice(breakIndex + 1).trimStart();
  }

  lines.push(remaining);
  return lines;
}

function displayType(type, includeColor) {
  if (type === 'fact') {
    return '';
  }

  if (includeColor) {
    return `${ansiTypeColor}${type}${ansiResetColor} `;
  }

  return `${type} `;
}

function markdownLinksInText(text) {
  return [...text.matchAll(/\[([^\]]+)\]\([^)]+\)/gu)]
    .map((match) => match[1]);
}

function markdownLinkTargetsInText(text) {
  return [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)]
    .map((match) => match[1].trim());
}

function plainTextWithMarkdownLinks(text) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1');
}

function displayMarkdownLinks(line, linkLabels, includeColor) {
  if (!includeColor || linkLabels.length === 0) {
    return line;
  }

  return linkLabels.reduce((nextLine, label) => {
    const labelPattern = new RegExp(escapeRegExp(label), 'gu');

    return nextLine.replace(labelPattern, `${ansiLinkColor}${label}${ansiResetColor}`);
  }, line);
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&');
}

function relationSuffixText(relations, direction = '<') {
  if (!relations || relations.length === 0) {
    return '';
  }

  return `${direction}${relations.join(', ')}`;
}

function displayRelationsForFact(fact) {
  if (fact.displayRelationDirection !== '>' || !fact.relations || !fact.displayRelations) {
    return fact.displayRelations;
  }

  const linkTargets = new Set(markdownLinkTargetsInText(fact.text));

  return fact.displayRelations.filter((relation, index) => !linkTargets.has(fact.relations[index]));
}

function displayRelationSuffix(suffix, includeColor) {
  return includeColor
    ? `${ansiRelationColor}${suffix}${ansiResetColor}`
    : suffix;
}

function factBlocksForDisplay(facts, options = {}) {
  const {
    columns = 80,
    includeColor = false
  } = options;

  if (facts.length === 0) {
    return [['No facts yet.']];
  }

  const numberWidth = Math.max(2, String(facts.length).length);
  const continuationPrefix = '    ';
  const continuationColumns = Math.max(columns - continuationPrefix.length, 1);

  return facts.map((fact, factIndex) => {
    const lines = fact.text.split(/\r?\n/u);
    const displayLines = lines.length > 0 ? lines : [''];
    const type = fact.type ?? 'fact';
    const relationSuffix = relationSuffixText(displayRelationsForFact(fact), fact.displayRelationDirection);
    const firstPrefix = `${String(factIndex + 1).padStart(numberWidth)}. ${displayType(type, includeColor)}`;
    const firstColumns = Math.max(columns - visibleLength(firstPrefix), 1);

    return displayLines.flatMap((line, lineIndex) => {
      const prefix = lineIndex === 0 ? firstPrefix : continuationPrefix;
      const linkLabels = markdownLinksInText(line);
      const plainLine = plainTextWithMarkdownLinks(line);
      const displayLine = lineIndex === displayLines.length - 1
        ? `${plainLine}${relationSuffix ? ` ${relationSuffix}` : ''}`
        : plainLine;
      const wrappedLines = wrapPlainText(
        displayLine,
        lineIndex === 0 ? firstColumns : continuationColumns
      );

      return wrappedLines.map((wrappedLine, wrappedLineIndex) => {
        const linkLine = displayMarkdownLinks(wrappedLine, linkLabels, includeColor);
        const displayedLine = relationSuffix && linkLine.endsWith(relationSuffix)
          ? `${linkLine.slice(0, -relationSuffix.length)}${displayRelationSuffix(relationSuffix, includeColor)}`
          : linkLine;

        return wrappedLineIndex === 0
          ? `${prefix}${displayedLine}`
          : `${continuationPrefix}${displayedLine}`;
      });
    });
  });
}

export function buildPagedFactLines(options = {}) {
  const {
    columns = 80,
    includeColor = false,
    facts = [],
    pageStartIndex = 0,
    rows = 0
  } = options;
  const factRows = Math.max(rows, 0);

  if (factRows === 0) {
    return {
      lines: [],
      nextPageStartIndex: null,
      previousPageStartIndex: pageStartIndex > 0 ? 0 : null
    };
  }

  const factBlocks = factBlocksForDisplay(facts, { columns, includeColor });

  if (facts.length === 0) {
    return {
      lines: factBlocks[0].slice(0, factRows),
      nextPageStartIndex: null,
      previousPageStartIndex: null
    };
  }

  const startIndex = Math.min(Math.max(pageStartIndex, 0), facts.length - 1);
  const lines = [];
  let nextPageStartIndex = null;

  for (let factIndex = startIndex; factIndex < factBlocks.length; factIndex += 1) {
    const block = factBlocks[factIndex];
    const hasMoreAfter = factIndex < factBlocks.length - 1;
    const rowsNeeded = block.length + (hasMoreAfter ? 1 : 0);

    if (lines.length > 0 && lines.length + rowsNeeded > factRows) {
      lines.push('...');
      nextPageStartIndex = factIndex;
      break;
    }

    if (lines.length === 0 && block.length > factRows) {
      lines.push(...block.slice(0, Math.max(factRows - 1, 0)));
      lines.push('...');
      nextPageStartIndex = factIndex + 1 < factBlocks.length ? factIndex + 1 : null;
      break;
    }

    if (lines.length + block.length > factRows) {
      lines.push('...');
      nextPageStartIndex = factIndex;
      break;
    }

    lines.push(...block);
  }

  const previousPageStartIndex = startIndex > 0 ? Math.max(startIndex - 1, 0) : null;

  return {
    lines,
    nextPageStartIndex,
    previousPageStartIndex
  };
}

function buildTemporaryBodyLines(lines, rows, columns) {
  return {
    lines: lines
      .flatMap((line) => wrapPlainText(line, columns))
      .slice(0, rows),
    nextPageStartIndex: null,
    previousPageStartIndex: null
  };
}

export function pageNavigationForFacts(options = {}) {
  const {
    columns = 80,
    includeColor = false,
    facts = [],
    pageStartIndex = 0,
    rows = 0
  } = options;
  const currentPage = buildPagedFactLines({
    columns,
    includeColor,
    facts,
    pageStartIndex,
    rows
  });
  let previousPageStartIndex = null;
  let candidateStartIndex = 0;

  while (candidateStartIndex < pageStartIndex) {
    const candidatePage = buildPagedFactLines({
      columns,
      includeColor,
      facts,
      pageStartIndex: candidateStartIndex,
      rows
    });

    if (
      candidatePage.nextPageStartIndex === null
      || candidatePage.nextPageStartIndex >= pageStartIndex
    ) {
      previousPageStartIndex = candidateStartIndex;
      break;
    }

    candidateStartIndex = candidatePage.nextPageStartIndex;
  }

  return {
    nextPageStartIndex: currentPage.nextPageStartIndex,
    previousPageStartIndex
  };
}

export function buildTuiLines(options = {}) {
  const {
    state,
    facts = [],
    rows = 24,
    columns = 80,
    includeColor = false
  } = options;
  const visibleRows = Math.max(rows - 1, 1);
  const factRows = Math.max(visibleRows - 2, 0);
  const lens = currentLensIdForState(state);
  const gaze = currentGazeName(state);
  const lensText = lens === defaultLensId ? '' : ` | ${lens}`;
  const gazeText = gaze ? ` -> ${gaze}` : '';
  const status = state.statusMessage ? ` | ${state.statusMessage}` : '';
  const header = fitLine(`${currentContextName(state)}${gazeText}${lensText}${status}`, columns);
  const separator = '-'.repeat(Math.max(columns, 0));
  const { lines: bodyLines } = state.temporaryBodyLines
    ? buildTemporaryBodyLines(state.temporaryBodyLines, factRows, columns)
    : buildPagedFactLines({
      columns,
      includeColor,
      facts,
      pageStartIndex: state.pageStartIndex ?? 0,
      rows: factRows
    });

  return [
    header,
    separator,
    ...bodyLines.slice(0, factRows)
  ];
}

export function renderTui(options = {}) {
  const {
    rows = 24,
    includeAnsi = true
  } = options;
  const lines = buildTuiLines({
    ...options,
    includeColor: includeAnsi
  });
  const screen = lines.join('\n');

  if (!includeAnsi) {
    return `${screen}\n`;
  }

  return `\x1b[2J\x1b[H${screen}\x1b[${rows};1H`;
}

export async function completeEntry(line, state) {
  const commandCompletion = line.match(/^:(?<partial>[A-Za-z0-9_-]*)$/u);

  if (commandCompletion) {
    const partialCommand = commandCompletion.groups.partial;
    const matches = commandNames()
      .filter((commandName) => commandName.startsWith(partialCommand))
      .map((commandName) => `:${commandName} `);

    return [matches, line];
  }

  const namedContextCompletion = line.match(/^:(?:switch|gaze)\s+(.*)$/u);

  if (namedContextCompletion) {
    const partialContext = namedContextCompletion[1] ?? '';
    const matches = await matchingContextCompletions(partialContext, state);

    return [matches.map((context) => context.name), partialContext];
  }

  const namedRelationCompletion = line.match(/^:relate\s+[1-9]\d*\s+(.*)$/u);

  if (namedRelationCompletion) {
    const partialContext = namedRelationCompletion[1] ?? '';
    const matches = await matchingContextCompletions(partialContext, state);
    const relationCompletions = partialContext.includes('/')
      ? matches.map((context) => `/${context.name}`)
      : matches.map((context) => context.folder);

    return [relationCompletions, partialContext];
  }

  const namedLensCompletion = line.match(/^:lens\s+(.*)$/u);

  if (namedLensCompletion) {
    const partialLens = namedLensCompletion[1] ?? '';
    const matches = lensIds().filter((lensId) => lensId.startsWith(partialLens));

    return [matches, partialLens];
  }

  const contextCompletion = line.match(/^\/([sg])(?:(\s+)(.*))?$/u);

  if (contextCompletion) {
    const command = contextCompletion[1];

    if (!contextCompletion[2]) {
      return [[`/${command} `], line];
    }

    const partialContext = contextCompletion[3] ?? '';
    const matches = await matchingContextCompletions(partialContext, state);

    return [matches.map((context) => context.name), partialContext];
  }

  const relationCompletion = line.match(/^\/r\s+[1-9]\d*\s+(.*)$/u);

  if (relationCompletion) {
    const partialContext = relationCompletion[1] ?? '';
    const matches = await matchingContextCompletions(partialContext, state);
    const relationCompletions = partialContext.includes('/')
      ? matches.map((context) => `/${context.name}`)
      : matches.map((context) => context.folder);

    return [relationCompletions, partialContext];
  }

  const mentionCompletion = line.match(/(^|\s)(@[^\s]*)$/u);

  if (mentionCompletion) {
    const partialMention = mentionCompletion[2];
    const partialContext = partialMention.slice(1);
    const matches = await matchingContextCompletions(partialContext, state);

    return [matches.map((context) => `@${context.folder}`), partialMention];
  }

  return [[], line];
}

async function matchingContextCompletions(partialContext, state) {
  const contexts = await contextIdsForState(state);

  return contexts
    .map((contextName) => ({
      folder: contextName.split('/').at(-1) ?? contextName,
      name: contextName
    }))
    .filter((contextName) => {
      const comparableName = contextName.name.startsWith('/')
        ? contextName.name
        : `/${contextName.name}`;

      return contextName.name.startsWith(partialContext)
        || comparableName.startsWith(partialContext)
        || contextName.folder.startsWith(partialContext);
    });
}

export function createReadlineCompleter(state) {
  return (line) => completeEntry(line, state)
    .catch(() => [[], line]);
}

function clearTemporaryBody(state) {
  state.temporaryBodyLines = null;
}

function showCommandHelp(state, message = null) {
  state.statusMessage = '';
  state.temporaryBodyLines = [
    ...(message ? [message, ''] : []),
    'Commands:',
    ...commandHelp()
  ];
}

export function openEditor(filePath, options = {}) {
  const {
    editor = processEnv.EDITOR,
    spawnProcess = spawn
  } = options;

  if (!editor) {
    return Promise.reject(new Error('EDITOR is not set'));
  }

  return new Promise((resolve, reject) => {
    const child = spawnProcess(editor, [filePath], {
      shell: true,
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(signal
        ? `${editor} exited with signal ${signal}`
        : `${editor} exited with code ${code}`));
    });
  });
}

export async function refreshEditedFact(state, filePath) {
  await refreshFact(await ensureModel(state), filePath);
}

async function relationForContextReference(contextReference, state) {
  const requestedContext = contextReference.trim();

  if (requestedContext.length === 0) {
    throw new Error('usage: /r <item> <context>');
  }

  const normalizedContext = requestedContext.replace(/^\/+/u, '');
  const contexts = await contextIdsForState(state);
  const matches = contexts.filter((contextName) => {
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

async function resolveExistingContextDirectory(contextReference, state) {
  const contextDirectory = resolveContextDirectory(contextReference, {
    rootDirectory: state.rootDirectory
  });
  const normalizedContext = contextIdForDirectory(state, contextDirectory);
  const contexts = await contextIdsForState(state);

  if (!contexts.includes(normalizedContext)) {
    throw new Error(`context ${contextReference} does not exist`);
  }

  return contextDirectory;
}

export async function handleEntry(entry, state) {
  const parsedEntry = parseEntry(entry);

  if (parsedEntry.type === 'quit') {
    return { action: 'quit' };
  }

  if (parsedEntry.type === 'empty') {
    state.statusMessage = '';
    clearTemporaryBody(state);

    return { action: 'continue' };
  }

  if (parsedEntry.type === 'help') {
    showCommandHelp(state);

    return {
      action: 'continue',
      message: commandHelpText()
    };
  }

  if (parsedEntry.type === 'debug_keys') {
    state.debugKeys = !state.debugKeys;
    state.statusMessage = `key debug ${state.debugKeys ? 'on' : 'off'}`;
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }

  if (parsedEntry.type === 'usage_error') {
    state.statusMessage = parsedEntry.message;
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }

  if (parsedEntry.type === 'switch_context') {
    let nextContextDirectory;

    try {
      nextContextDirectory = await resolveExistingContextDirectory(parsedEntry.context, state);
    } catch (error) {
      state.statusMessage = error.message;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    changeLens(state, {
      ...currentLens(state),
      currentContextDirectory: nextContextDirectory
    });
    state.gazeContextDirectory = null;

    const message = `context ${path.relative(state.rootDirectory, state.currentContextDirectory)}`;

    return {
      action: 'continue',
      message
    };
  }

  if (parsedEntry.type === 'clear_gaze') {
    state.gazeContextDirectory = null;
    state.statusMessage = '';
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message: 'gaze cleared'
    };
  }

  if (parsedEntry.type === 'change_gaze') {
    try {
      state.gazeContextDirectory = await resolveExistingContextDirectory(parsedEntry.context, state);
    } catch (error) {
      state.statusMessage = error.message;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    const message = `gaze ${contextIdForDirectory(state, state.gazeContextDirectory)}`;
    state.pageStartIndex = 0;
    state.statusMessage = '';
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message
    };
  }

  if (parsedEntry.type === 'switch_lens') {
    if (!hasLens(parsedEntry.lens)) {
      state.statusMessage = `unknown lens ${parsedEntry.lens}`;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    changeLens(state, {
      ...currentLens(state),
      currentLensId: parsedEntry.lens
    });

    return {
      action: 'continue',
      message: `lens ${parsedEntry.lens}`
    };
  }

  if (parsedEntry.type === 'edit_fact') {
    try {
      const fact = await visibleFactAtIndex(state, parsedEntry.itemNumber);
      state.statusMessage = '';
      clearTemporaryBody(state);

      return {
        action: 'edit',
        filePath: fact.path,
        itemNumber: parsedEntry.itemNumber
      };
    } catch (error) {
      state.statusMessage = error.message;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }
  }

  if (parsedEntry.type === 'delete_fact') {
    try {
      const fact = await visibleFactAtIndex(state, parsedEntry.itemNumber);
      await deleteFact(fact.path);
      removeFact(await ensureModel(state), fact.path);
    } catch (error) {
      state.statusMessage = error.message;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    const message = `trashed item ${parsedEntry.itemNumber}`;
    state.pageStartIndex = 0;
    state.statusMessage = '';
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message
    };
  }

  if (parsedEntry.type === 'relate_fact') {
    try {
      const fact = await visibleFactAtIndex(state, parsedEntry.itemNumber);
      const relation = await relationForContextReference(parsedEntry.contextReference, state);
      await addFactRelation(fact.path, relation);
      await refreshFact(await ensureModel(state), fact.path);

      const message = `related item ${parsedEntry.itemNumber} to ${relation}`;
      state.statusMessage = '';
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message
      };
    } catch (error) {
      state.statusMessage = error.message;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }
  }

  if (parsedEntry.type === 'unknown_command') {
    const message = `unknown command ${parsedEntry.commandName}`;
    showCommandHelp(state, message);

    return {
      action: 'continue',
      message: `${message}; ${commandHelpText()}`
    };
  }

  if (parsedEntry.type === 'set_fact_type') {
    try {
      const fact = await visibleFactAtIndex(state, parsedEntry.itemNumber);
      await updateFactType(fact.path, parsedEntry.factType);
      await refreshFact(await ensureModel(state), fact.path);
    } catch (error) {
      state.statusMessage = error.message;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    const message = `set item ${parsedEntry.itemNumber} type to ${parsedEntry.factType}`;
    state.pageStartIndex = 0;
    state.statusMessage = '';
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message
    };
  }

  const savedPath = await saveFact(parsedEntry.title, {
    relations: state.gazeContextDirectory
      ? [contextIdForDirectory(state, state.gazeContextDirectory)]
      : [],
    rootDirectory: state.currentContextDirectory
  });
  await refreshContext(await ensureModel(state), state.currentContextDirectory);
  const message = `saved ${path.relative(state.appDirectory, savedPath)}`;
  state.pageStartIndex = 0;
  state.statusMessage = '';
  clearTemporaryBody(state);

  return {
    action: 'continue',
    message
  };
}

async function main() {
  const rootDirectory = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  const state = createPromptState({
    rootDirectory,
    model: await loadWorkspaceModel({
      rootDirectory: rootDirectory ?? path.join(defaultAppDirectory, 'notes')
    })
  });
  let facts = [];
  let editorOpen = false;
  const terminal = readline.createInterface({
    input,
    output,
    completer: createReadlineCompleter(state)
  });
  const useAlternateScreen = output.isTTY;
  const terminalRows = () => output.rows ?? 24;
  const terminalColumns = () => output.columns ?? 80;
  const factRows = () => Math.max(Math.max(terminalRows() - 1, 1) - 1, 0);

  function renderCurrentScreen() {
    output.write(renderTui({
      state,
      facts,
      rows: terminalRows(),
      columns: terminalColumns(),
      includeAnsi: output.isTTY
    }));
  }

  function redrawPrompt() {
    output.write(`> ${terminal.line}`);
  }

  function changePage(direction) {
    const navigation = pageNavigationForFacts({
      columns: terminalColumns(),
      includeColor: output.isTTY,
      facts,
      pageStartIndex: state.pageStartIndex ?? 0,
      rows: factRows()
    });
    const nextPageStartIndex = direction === 'down'
      ? navigation.nextPageStartIndex
      : navigation.previousPageStartIndex;

    if (nextPageStartIndex === null) {
      return;
    }

    state.pageStartIndex = nextPageStartIndex;
    renderCurrentScreen();
    redrawPrompt();
  }

  async function changeLens(direction) {
    const changed = direction === 'forward'
      ? navigateLensForward(state)
      : navigateLensBack(state);

    if (!changed) {
      return;
    }

    facts = await visibleFactsForState(state);
    renderCurrentScreen();
    redrawPrompt();
  }

  if (input.isTTY) {
    emitKeypressEvents(input, terminal);
  }

  const onKeypress = (value, key) => {
    if (editorOpen) {
      return;
    }

    if (state.debugKeys) {
      state.statusMessage = 'key debug on';
      state.temporaryBodyLines = keyDebugLines(value, key);
    }

    const lensNavigation = lensNavigationForKey(key);

    if (lensNavigation) {
      void changeLens(lensNavigation);
      return;
    }

    const pageNavigation = pageNavigationForKey(key);

    if (pageNavigation) {
      changePage(pageNavigation);
      return;
    }

    if (state.debugKeys) {
      renderCurrentScreen();
      redrawPrompt();
    }
  };

  terminal.on('SIGINT', () => {
    output.write('\n');
    terminal.close();
  });
  input.on('keypress', onKeypress);

  if (useAlternateScreen) {
    output.write('\x1b[?1049h');
  }

  try {
    while (true) {
      facts = await visibleFactsForState(state);
      renderCurrentScreen();

      const entry = await terminal.question('> ');
      const result = await handleEntry(entry, state);

      if (result.action === 'quit') {
        break;
      }

      if (result.action === 'edit') {
        editorOpen = true;
        terminal.pause();

        if (useAlternateScreen) {
          output.write('\x1b[?1049l');
        }

        try {
          await openEditor(result.filePath);
          await refreshEditedFact(state, result.filePath);
          state.statusMessage = `edited item ${result.itemNumber}`;
        } catch (error) {
          state.statusMessage = error.message;
        } finally {
          if (useAlternateScreen) {
            output.write('\x1b[?1049h');
          }

          terminal.resume();
          editorOpen = false;
        }
      }
    }
  } finally {
    input.off('keypress', onKeypress);

    if (useAlternateScreen) {
      output.write('\x1b[?1049l');
    }

    terminal.close();
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
