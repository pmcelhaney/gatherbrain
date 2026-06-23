#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import readline from 'node:readline/promises';
import { env as processEnv, stdin as input, stdout as output } from 'node:process';
import {
  addFactRelation,
  ensureContextDirectory,
  listContextDirectories,
  listFacts,
  saveFact,
  updateFactType
} from './facts.js';

const defaultAppDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const quitCommands = new Set([':q', ':quit', ':exit']);
const ansiTypeColor = '\x1b[36m';
const ansiRelationColor = '\x1b[35m';
const ansiResetColor = '\x1b[39m';
const ansiCodePattern = /\x1b\[[0-9;]*m/gu;
const defaultLens = 'all';
const lensNames = new Set([defaultLens, 'todo']);
const todoLensTypes = new Set(['todo', 'waiting', 'in progress', 'fact']);

export function createPromptState(options = {}) {
  const appDirectory = options.appDirectory ?? defaultAppDirectory;
  const notesDirectory = options.notesDirectory ?? path.join(appDirectory, 'notes');

  return {
    appDirectory,
    notesDirectory,
    activeNotesDirectory: notesDirectory,
    activeLens: defaultLens,
    pageStartIndex: 0,
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

  return relativeContext.length > 0
    ? `/${relativeContext.split(path.sep).join('/')}`
    : '/';
}

function folderNameForFact(fact, state) {
  const relativeDirectory = path.dirname(path.relative(state.notesDirectory, fact.path));

  if (relativeDirectory === '.') {
    return path.basename(state.notesDirectory);
  }

  return relativeDirectory.split(path.sep).at(-1) ?? relativeDirectory;
}

function folderNameForRelation(relation) {
  return relation.replace(/^\/+/u, '').split('/').at(-1) ?? relation;
}

export function filterNotesForLens(notes, lens = defaultLens) {
  if (lens === 'todo') {
    return notes.filter((note) => todoLensTypes.has(note.type));
  }

  return notes;
}

export async function visibleFactsForState(state) {
  const contextRelation = relationForActiveContext(state);
  const facts = (await listFacts({ notesDirectory: state.notesDirectory }))
    .flatMap((fact) => {
      const insideContext = pathIsInside(state.activeNotesDirectory, fact.path);
      const relatedToContext = fact.relations?.includes(contextRelation) ?? false;

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

function relationSuffixText(relations, direction = '<') {
  if (!relations || relations.length === 0) {
    return '';
  }

  return `${direction}${relations.join(', ')}`;
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
    const relationSuffix = relationSuffixText(note.displayRelations, note.displayRelationDirection);
    const firstPrefix = `${String(noteIndex + 1).padStart(numberWidth)}. ${displayType(type, includeColor)}`;
    const firstColumns = Math.max(columns - visibleLength(firstPrefix), 1);

    return displayLines.flatMap((line, lineIndex) => {
      const prefix = lineIndex === 0 ? firstPrefix : continuationPrefix;
      const displayLine = lineIndex === displayLines.length - 1
        ? `${line}${relationSuffix ? ` ${relationSuffix}` : ''}`
        : line;
      const wrappedLines = wrapPlainText(
        displayLine,
        lineIndex === 0 ? firstColumns : continuationColumns
      );

      return wrappedLines.map((wrappedLine, wrappedLineIndex) => {
        const displayedLine = relationSuffix && wrappedLine.endsWith(relationSuffix)
          ? `${wrappedLine.slice(0, -relationSuffix.length)}${displayRelationSuffix(relationSuffix, includeColor)}`
          : wrappedLine;

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
  const { lines: bodyLines } = buildPagedNoteLines({
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

  if (!relationCompletion) {
    return [[], line];
  }

  const partialContext = relationCompletion[1] ?? '';
  const matches = await matchingContextCompletions(partialContext, state);
  const relationCompletions = partialContext.includes('/')
    ? matches.map((context) => `/${context.name}`)
    : matches.map((context) => context.folder);

  return [relationCompletions, partialContext];
}

async function matchingContextCompletions(partialContext, state) {
  const contexts = await listContextDirectories({
    notesDirectory: state.notesDirectory
  });

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

async function relationForContextReference(contextReference, state) {
  const requestedContext = contextReference.trim();

  if (requestedContext.length === 0) {
    throw new Error('usage: /r <item> <context>');
  }

  const normalizedContext = requestedContext.replace(/^\/+/u, '');
  const contexts = await listContextDirectories({
    notesDirectory: state.notesDirectory
  });
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

  return `/${matches[0]}`;
}

export async function handleEntry(entry, state) {
  const command = entry.trim();

  if (quitCommands.has(command)) {
    return { action: 'quit' };
  }

  if (command.length === 0) {
    state.statusMessage = '';

    return { action: 'continue' };
  }

  const contextSwitch = command.match(/^\/s(?:\s+(.*))?$/u);

  if (contextSwitch) {
    const contextName = contextSwitch[1]?.trim() ?? '';

    if (contextName.length === 0) {
      state.statusMessage = 'usage: /s <context>';

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    try {
      state.activeNotesDirectory = await ensureContextDirectory(contextName, {
        notesDirectory: state.notesDirectory
      });
    } catch (error) {
      state.statusMessage = error.message;

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    const message = `context ${path.relative(state.notesDirectory, state.activeNotesDirectory)}`;
    state.pageStartIndex = 0;
    state.statusMessage = '';

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

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    if (!lensNames.has(lensName)) {
      state.statusMessage = `unknown lens ${lensName}`;

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    state.activeLens = lensName;
    state.pageStartIndex = 0;
    state.statusMessage = '';

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

      return {
        action: 'edit',
        filePath: fact.path,
        itemNumber: Number(itemNumber)
      };
    } catch (error) {
      state.statusMessage = error.message;

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }
  }

  const relationCommand = command.match(/^\/r\s+([1-9]\d*)\s+(.+)$/u);

  if (relationCommand) {
    const [, itemNumber, contextReference] = relationCommand;

    try {
      const fact = await visibleFactAtIndex(state, Number(itemNumber));
      const relation = await relationForContextReference(contextReference, state);
      await addFactRelation(fact.path, relation);

      const message = `related item ${itemNumber} to ${relation}`;
      state.statusMessage = '';

      return {
        action: 'continue',
        message
      };
    } catch (error) {
      state.statusMessage = error.message;

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }
  }

  if (/^\/r(?:\s|$)/u.test(command)) {
    state.statusMessage = 'usage: /r <item> <context>';

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }

  const typeChange = command.match(/^:([A-Za-z][A-Za-z0-9_-]*)\s+([1-9]\d*)$/u);

  if (typeChange) {
    const [, type, itemNumber] = typeChange;

    try {
      const fact = await visibleFactAtIndex(state, Number(itemNumber));
      await updateFactType(fact.path, type);
    } catch (error) {
      state.statusMessage = error.message;

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    const message = `set item ${itemNumber} type to ${type}`;
    state.pageStartIndex = 0;
    state.statusMessage = '';

    return {
      action: 'continue',
      message
    };
  }

  const savedPath = await saveFact(entry, {
    notesDirectory: state.activeNotesDirectory
  });
  const message = `saved ${path.relative(state.appDirectory, savedPath)}`;
  state.pageStartIndex = 0;
  state.statusMessage = '';

  return {
    action: 'continue',
    message
  };
}

async function main() {
  const state = createPromptState();
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

  if (input.isTTY) {
    emitKeypressEvents(input, terminal);
  }

  const onKeypress = (_value, key) => {
    if (editorOpen) {
      return;
    }

    if (key?.name === 'pagedown') {
      changePage('down');
      return;
    }

    if (key?.name === 'pageup') {
      changePage('up');
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
