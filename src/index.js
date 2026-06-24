#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import readline from 'node:readline/promises';
import { env as processEnv, stdin as input, stdout as output } from 'node:process';
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

const defaultAppDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const quitCommands = new Set([':q', ':quit', ':exit']);
const ansiTypeColor = '\x1b[36m';
const ansiLinkColor = '\x1b[34m';
const ansiRelationColor = '\x1b[35m';
const ansiResetColor = '\x1b[39m';
const ansiCodePattern = /\x1b\[[0-9;]*m/gu;
const defaultLens = 'all';
const lensNames = new Set([defaultLens, 'todo']);
const todoLensTypes = new Set(['todo', 'waiting', 'in progress', 'fact']);
const commandHelp = [
  '/s <context>',
  '/l <lens>',
  '/e <item>',
  '/d <item>',
  '/r <item> <context>',
  '/debug keys'
];

export function createPromptState(options = {}) {
  const appDirectory = options.appDirectory ?? defaultAppDirectory;
  const notesDirectory = options.rootDirectory ?? options.notesDirectory ?? path.join(appDirectory, 'notes');

  return {
    appDirectory,
    notesDirectory,
    activeNotesDirectory: notesDirectory,
    activeLens: defaultLens,
    model: options.model ?? null,
    pageStartIndex: 0,
    temporaryBodyLines: null,
    viewBackStack: [],
    viewForwardStack: [],
    debugKeys: false,
    statusMessage: ''
  };
}

export function currentContextName(state) {
  const relativeContext = path.relative(
    state.notesDirectory,
    state.activeNotesDirectory
  );

  return relativeContext.length > 0 ? relativeContext : path.basename(state.notesDirectory);
}

function currentLensName(state) {
  return state.activeLens ?? defaultLens;
}

function currentView(state) {
  return {
    activeLens: currentLensName(state),
    activeNotesDirectory: state.activeNotesDirectory
  };
}

function viewsAreEqual(left, right) {
  return left.activeLens === right.activeLens
    && path.resolve(left.activeNotesDirectory) === path.resolve(right.activeNotesDirectory);
}

function applyView(state, view) {
  state.activeLens = view.activeLens;
  state.activeNotesDirectory = view.activeNotesDirectory;
  state.pageStartIndex = 0;
  state.statusMessage = '';
  clearTemporaryBody(state);
}

function changeView(state, nextView) {
  const previousView = currentView(state);

  if (viewsAreEqual(previousView, nextView)) {
    state.pageStartIndex = 0;
    state.statusMessage = '';
    clearTemporaryBody(state);
    return false;
  }

  state.viewBackStack.push(previousView);
  state.viewForwardStack = [];
  applyView(state, nextView);
  return true;
}

export function navigateViewBack(state) {
  const previousView = state.viewBackStack.pop();

  if (!previousView) {
    return false;
  }

  state.viewForwardStack.push(currentView(state));
  applyView(state, previousView);
  return true;
}

export function navigateViewForward(state) {
  const nextView = state.viewForwardStack.pop();

  if (!nextView) {
    return false;
  }

  state.viewBackStack.push(currentView(state));
  applyView(state, nextView);
  return true;
}

export function viewNavigationForKey(key) {
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

function pathIsInside(directory, filePath) {
  const relativePath = path.relative(directory, filePath);

  return relativePath.length === 0
    || (
      !relativePath.startsWith(`..${path.sep}`)
      && relativePath !== '..'
      && !path.isAbsolute(relativePath)
    );
}

function relationForActiveContext(state) {
  const relativeContext = path.relative(
    state.notesDirectory,
    state.activeNotesDirectory
  );

  return relativeContext.length > 0 ? relativeContext.split(path.sep).join('/') : '';
}

function folderNameForFact(fact, state) {
  const relativeDirectory = path.dirname(path.relative(state.notesDirectory, fact.path));

  if (relativeDirectory === '.') {
    return path.basename(state.notesDirectory);
  }

  return relativeDirectory.split(path.sep).at(-1) ?? relativeDirectory;
}

function folderNameForRelation(relation) {
  return relation.split('/').at(-1) ?? relation;
}

async function ensureModel(state) {
  if (!state.model) {
    state.model = await loadWorkspaceModel({ rootDirectory: state.notesDirectory });
  }

  return state.model;
}

async function contextIdsForState(state) {
  const model = await ensureModel(state);

  return [...model.contexts.keys()].filter((contextId) => contextId !== '').sort();
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

export function filterNotesForLens(notes, lens = defaultLens) {
  if (lens === 'todo') {
    return notes.filter((note) => todoLensTypes.has(note.type));
  }

  return notes;
}

export async function visibleFactsForState(state) {
  const model = await ensureModel(state);
  const contextRelation = relationForActiveContext(state);
  const facts = factsForModel(model)
    .flatMap((fact) => {
      const insideContext = pathIsInside(state.activeNotesDirectory, fact.path);
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
            displayRelations: [folderNameForFact(fact, state)]
          }
          : {})
      }];
    });

  return filterNotesForLens(facts, currentLensName(state));
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

function displayRelationsForNote(note) {
  if (note.displayRelationDirection !== '>' || !note.relations || !note.displayRelations) {
    return note.displayRelations;
  }

  const linkTargets = new Set(markdownLinkTargetsInText(note.text));

  return note.displayRelations.filter((relation, index) => !linkTargets.has(note.relations[index]));
}

function displayRelationSuffix(suffix, includeColor) {
  return includeColor
    ? `${ansiRelationColor}${suffix}${ansiResetColor}`
    : suffix;
}

function noteBlocksForDisplay(notes, options = {}) {
  const {
    columns = 80,
    includeColor = false
  } = options;

  if (notes.length === 0) {
    return [['No notes yet.']];
  }

  const numberWidth = Math.max(2, String(notes.length).length);
  const continuationPrefix = '    ';
  const continuationColumns = Math.max(columns - continuationPrefix.length, 1);

  return notes.map((note, noteIndex) => {
    const lines = note.text.split(/\r?\n/u);
    const displayLines = lines.length > 0 ? lines : [''];
    const type = note.type ?? 'note';
    const relationSuffix = relationSuffixText(displayRelationsForNote(note), note.displayRelationDirection);
    const firstPrefix = `${String(noteIndex + 1).padStart(numberWidth)}. ${displayType(type, includeColor)}`;
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

export function buildPagedNoteLines(options = {}) {
  const {
    columns = 80,
    includeColor = false,
    notes = [],
    pageStartIndex = 0,
    rows = 0
  } = options;
  const noteRows = Math.max(rows, 0);

  if (noteRows === 0) {
    return {
      lines: [],
      nextPageStartIndex: null,
      previousPageStartIndex: pageStartIndex > 0 ? 0 : null
    };
  }

  const noteBlocks = noteBlocksForDisplay(notes, { columns, includeColor });

  if (notes.length === 0) {
    return {
      lines: noteBlocks[0].slice(0, noteRows),
      nextPageStartIndex: null,
      previousPageStartIndex: null
    };
  }

  const startIndex = Math.min(Math.max(pageStartIndex, 0), notes.length - 1);
  const lines = [];
  let nextPageStartIndex = null;

  for (let noteIndex = startIndex; noteIndex < noteBlocks.length; noteIndex += 1) {
    const block = noteBlocks[noteIndex];
    const hasMoreAfter = noteIndex < noteBlocks.length - 1;
    const rowsNeeded = block.length + (hasMoreAfter ? 1 : 0);

    if (lines.length > 0 && lines.length + rowsNeeded > noteRows) {
      lines.push('...');
      nextPageStartIndex = noteIndex;
      break;
    }

    if (lines.length === 0 && block.length > noteRows) {
      lines.push(...block.slice(0, Math.max(noteRows - 1, 0)));
      lines.push('...');
      nextPageStartIndex = noteIndex + 1 < noteBlocks.length ? noteIndex + 1 : null;
      break;
    }

    if (lines.length + block.length > noteRows) {
      lines.push('...');
      nextPageStartIndex = noteIndex;
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

export function pageNavigationForNotes(options = {}) {
  const {
    columns = 80,
    includeColor = false,
    notes = [],
    pageStartIndex = 0,
    rows = 0
  } = options;
  const currentPage = buildPagedNoteLines({
    columns,
    includeColor,
    notes,
    pageStartIndex,
    rows
  });
  let previousPageStartIndex = null;
  let candidateStartIndex = 0;

  while (candidateStartIndex < pageStartIndex) {
    const candidatePage = buildPagedNoteLines({
      columns,
      includeColor,
      notes,
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
    notes = [],
    rows = 24,
    columns = 80,
    includeColor = false
  } = options;
  const visibleRows = Math.max(rows - 1, 1);
  const noteRows = Math.max(visibleRows - 2, 0);
  const lens = currentLensName(state);
  const lensText = lens === defaultLens ? '' : ` | ${lens}`;
  const status = state.statusMessage ? ` | ${state.statusMessage}` : '';
  const header = fitLine(`${currentContextName(state)}${lensText}${status}`, columns);
  const separator = '-'.repeat(Math.max(columns, 0));
  const { lines: bodyLines } = state.temporaryBodyLines
    ? buildTemporaryBodyLines(state.temporaryBodyLines, noteRows, columns)
    : buildPagedNoteLines({
      columns,
      includeColor,
      notes,
      pageStartIndex: state.pageStartIndex ?? 0,
      rows: noteRows
    });

  return [
    header,
    separator,
    ...bodyLines.slice(0, noteRows)
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
  const contextCompletion = line.match(/^\/s(?:(\s+)(.*))?$/u);

  if (contextCompletion) {
    if (!contextCompletion[1]) {
      return [['/s '], line];
    }

    const partialContext = contextCompletion[2] ?? '';
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
    ...commandHelp
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

export async function handleEntry(entry, state) {
  const command = entry.trim();

  if (quitCommands.has(command)) {
    return { action: 'quit' };
  }

  if (command.length === 0) {
    state.statusMessage = '';
    clearTemporaryBody(state);

    return { action: 'continue' };
  }

  if (command === '/') {
    showCommandHelp(state);

    return {
      action: 'continue',
      message: commandHelp.join(' | ')
    };
  }

  if (command === '/debug keys') {
    state.debugKeys = !state.debugKeys;
    state.statusMessage = `key debug ${state.debugKeys ? 'on' : 'off'}`;
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }

  const contextSwitch = command.match(/^\/s(?:\s+(.*))?$/u);

  if (contextSwitch) {
    const contextName = contextSwitch[1]?.trim() ?? '';

    if (contextName.length === 0) {
      state.statusMessage = 'usage: /s <context>';
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    let nextNotesDirectory;

    try {
      nextNotesDirectory = resolveContextDirectory(contextName, {
        notesDirectory: state.notesDirectory
      });
      const normalizedContext = path
        .relative(state.notesDirectory, nextNotesDirectory)
        .split(path.sep)
        .join('/');
      const contexts = await contextIdsForState(state);

      if (!contexts.includes(normalizedContext)) {
        throw new Error(`context ${contextName} does not exist`);
      }
    } catch (error) {
      state.statusMessage = error.message;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    changeView(state, {
      ...currentView(state),
      activeNotesDirectory: nextNotesDirectory
    });

    const message = `context ${path.relative(state.notesDirectory, state.activeNotesDirectory)}`;

    return {
      action: 'continue',
      message
    };
  }

  const lensSwitch = command.match(/^\/l(?:\s+(.*))?$/u);

  if (lensSwitch) {
    const lensName = lensSwitch[1]?.trim() ?? '';

    if (lensName.length === 0) {
      state.statusMessage = 'usage: /l <lens>';
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    if (!lensNames.has(lensName)) {
      state.statusMessage = `unknown lens ${lensName}`;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    changeView(state, {
      ...currentView(state),
      activeLens: lensName
    });

    return {
      action: 'continue',
      message: `lens ${lensName}`
    };
  }

  const editCommand = command.match(/^\/e\s+([1-9]\d*)$/u);

  if (editCommand) {
    const [, itemNumber] = editCommand;

    try {
      const fact = await visibleFactAtIndex(state, Number(itemNumber));
      state.statusMessage = '';
      clearTemporaryBody(state);

      return {
        action: 'edit',
        filePath: fact.path,
        itemNumber: Number(itemNumber)
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

  const deleteCommand = command.match(/^\/d\s+([1-9]\d*)$/u);

  if (deleteCommand) {
    const [, itemNumber] = deleteCommand;

    try {
      const fact = await visibleFactAtIndex(state, Number(itemNumber));
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

    const message = `trashed item ${itemNumber}`;
    state.pageStartIndex = 0;
    state.statusMessage = '';
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message
    };
  }

  const relationCommand = command.match(/^\/r\s+([1-9]\d*)\s+(.+)$/u);

  if (relationCommand) {
    const [, itemNumber, contextReference] = relationCommand;

    try {
      const fact = await visibleFactAtIndex(state, Number(itemNumber));
      const relation = await relationForContextReference(contextReference, state);
      await addFactRelation(fact.path, relation);
      await refreshFact(await ensureModel(state), fact.path);

      const message = `related item ${itemNumber} to ${relation}`;
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

  if (/^\/r(?:\s|$)/u.test(command)) {
    state.statusMessage = 'usage: /r <item> <context>';
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }

  if (command.startsWith('/')) {
    const message = `unknown command ${command.split(/\s/u)[0]}`;
    showCommandHelp(state, message);

    return {
      action: 'continue',
      message: `${message}; ${commandHelp.join(' | ')}`
    };
  }

  const typeChange = command.match(/^:([A-Za-z][A-Za-z0-9_-]*)\s+([1-9]\d*)$/u);

  if (typeChange) {
    const [, type, itemNumber] = typeChange;

    try {
      const fact = await visibleFactAtIndex(state, Number(itemNumber));
      await updateFactType(fact.path, type);
      await refreshFact(await ensureModel(state), fact.path);
    } catch (error) {
      state.statusMessage = error.message;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    const message = `set item ${itemNumber} type to ${type}`;
    state.pageStartIndex = 0;
    state.statusMessage = '';
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message
    };
  }

  const savedPath = await saveFact(entry, {
    notesDirectory: state.activeNotesDirectory
  });
  await refreshContext(await ensureModel(state), state.activeNotesDirectory);
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
  let notes = [];
  let editorOpen = false;
  const terminal = readline.createInterface({
    input,
    output,
    completer: createReadlineCompleter(state)
  });
  const useAlternateScreen = output.isTTY;
  const terminalRows = () => output.rows ?? 24;
  const terminalColumns = () => output.columns ?? 80;
  const noteRows = () => Math.max(Math.max(terminalRows() - 1, 1) - 1, 0);

  function renderCurrentScreen() {
    output.write(renderTui({
      state,
      notes,
      rows: terminalRows(),
      columns: terminalColumns(),
      includeAnsi: output.isTTY
    }));
  }

  function redrawPrompt() {
    output.write(`> ${terminal.line}`);
  }

  function changePage(direction) {
    const navigation = pageNavigationForNotes({
      columns: terminalColumns(),
      includeColor: output.isTTY,
      notes,
      pageStartIndex: state.pageStartIndex ?? 0,
      rows: noteRows()
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

  async function changeView(direction) {
    const changed = direction === 'forward'
      ? navigateViewForward(state)
      : navigateViewBack(state);

    if (!changed) {
      return;
    }

    notes = await visibleFactsForState(state);
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

    const viewNavigation = viewNavigationForKey(key);

    if (viewNavigation) {
      void changeView(viewNavigation);
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
      notes = await visibleFactsForState(state);
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
