#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import readline from 'node:readline/promises';
import { env as processEnv, stdin as input, stdout as output } from 'node:process';
import {
  ensureContextDirectory,
  listContextDirectories,
  listFacts,
  saveFact,
  updateFactType
} from './facts.js';

const defaultAppDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const quitCommands = new Set([':q', ':quit', ':exit']);
const ansiTypeColor = '\x1b[36m';
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

export function filterNotesForLens(notes, lens = defaultLens) {
  if (lens === 'todo') {
    return notes.filter((note) => todoLensTypes.has(note.type));
  }

  return notes;
}

async function visibleFactsForState(state) {
  const facts = await listFacts({ notesDirectory: state.activeNotesDirectory });
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

  if (result.lastIndexOf(ansiTypeColor) > result.lastIndexOf(ansiResetColor)) {
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

function displayType(type, includeColor) {
  if (type === 'fact') {
    return '';
  }

  if (includeColor) {
    return `${ansiTypeColor}${type}${ansiResetColor} `;
  }

  return `${type} `;
}

function noteLinesForDisplay(notes, options = {}) {
  const { includeColor = false } = options;

  if (notes.length === 0) {
    return ['No notes yet.'];
  }

  return notes.flatMap((note, noteIndex) => {
    const lines = note.text.split(/\r?\n/u);
    const displayLines = lines.length > 0 ? lines : [''];
    const type = note.type ?? 'note';
    const prefix = `${noteIndex + 1}. ${displayType(type, includeColor)}`;
    const continuationPrefix = ' '.repeat(visibleLength(prefix));

    return displayLines.map((line, index) => (
      index === 0 ? `${prefix}${line}` : `${continuationPrefix}${line}`
    ));
  });
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
  const noteRows = Math.max(visibleRows - 1, 0);
  const lens = currentLensName(state);
  const lensText = lens === defaultLens ? '' : ` | Lens: ${lens}`;
  const status = state.statusMessage ? ` | ${state.statusMessage}` : '';
  const header = fitLine(`Context: ${currentContextName(state)}${lensText}${status}`, columns);
  let bodyLines = noteLinesForDisplay(notes, { includeColor });

  if (bodyLines.length > noteRows) {
    const shownRows = Math.max(noteRows - 1, 0);
    const hiddenRows = bodyLines.length - shownRows;
    bodyLines = [
      `... ${hiddenRows} earlier lines`,
      ...(shownRows > 0 ? bodyLines.slice(-shownRows) : [])
    ];
  }

  return [
    header,
    ...bodyLines.slice(0, noteRows).map((line) => fitLine(line, columns))
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

  if (!contextCompletion) {
    return [[], line];
  }

  if (!contextCompletion[1]) {
    return [['/s '], line];
  }

  const commandPrefix = `/s${contextCompletion[1]}`;
  const partialContext = contextCompletion[2] ?? '';
  const contexts = await listContextDirectories({
    notesDirectory: state.notesDirectory
  });
  const matches = contexts
    .filter((contextName) => contextName.startsWith(partialContext))
    .map((contextName) => `${commandPrefix}${contextName}`);

  return [matches, line];
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
  state.statusMessage = '';

  return {
    action: 'continue',
    message
  };
}

async function main() {
  const state = createPromptState();
  const terminal = readline.createInterface({
    input,
    output,
    completer: createReadlineCompleter(state)
  });
  const useAlternateScreen = output.isTTY;

  terminal.on('SIGINT', () => {
    output.write('\n');
    terminal.close();
  });

  if (useAlternateScreen) {
    output.write('\x1b[?1049h');
  }

  try {
    while (true) {
      const notes = await visibleFactsForState(state);
      output.write(renderTui({
        state,
        notes,
        rows: output.rows ?? 24,
        columns: output.columns ?? 80,
        includeAnsi: output.isTTY
      }));

      const entry = await terminal.question('> ');
      const result = await handleEntry(entry, state);

      if (result.action === 'quit') {
        break;
      }

      if (result.action === 'edit') {
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
        }
      }
    }
  } finally {
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
