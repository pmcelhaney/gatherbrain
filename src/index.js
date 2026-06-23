#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  ensureContextDirectory,
  listContextDirectories,
  listFacts,
  saveFact,
  updateFactTypeAtIndex
} from './facts.js';

const defaultAppDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const quitCommands = new Set([':q', ':quit', ':exit']);

export function createPromptState(options = {}) {
  const appDirectory = options.appDirectory ?? defaultAppDirectory;
  const notesDirectory = options.notesDirectory ?? path.join(appDirectory, 'notes');

  return {
    appDirectory,
    notesDirectory,
    activeNotesDirectory: notesDirectory,
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

function fitLine(line, columns) {
  if (columns <= 0) {
    return '';
  }

  if (line.length <= columns) {
    return line;
  }

  if (columns <= 3) {
    return '.'.repeat(columns);
  }

  return `${line.slice(0, columns - 3)}...`;
}

function noteLinesForDisplay(notes) {
  if (notes.length === 0) {
    return ['No notes yet.'];
  }

  return notes.flatMap((note, noteIndex) => {
    const lines = note.text.split(/\r?\n/u);
    const displayLines = lines.length > 0 ? lines : [''];
    const prefix = `${noteIndex + 1}. [${note.type ?? 'note'}] `;
    const continuationPrefix = ' '.repeat(prefix.length);

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
    columns = 80
  } = options;
  const visibleRows = Math.max(rows - 1, 1);
  const noteRows = Math.max(visibleRows - 1, 0);
  const status = state.statusMessage ? ` | ${state.statusMessage}` : '';
  const header = fitLine(`Context: ${currentContextName(state)}${status}`, columns);
  let bodyLines = noteLinesForDisplay(notes);

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
  const lines = buildTuiLines(options);
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

  const typeChange = command.match(/^:([A-Za-z][A-Za-z0-9_-]*)\s+([1-9]\d*)$/u);

  if (typeChange) {
    const [, type, itemNumber] = typeChange;

    try {
      await updateFactTypeAtIndex({
        index: Number(itemNumber),
        notesDirectory: state.activeNotesDirectory,
        type
      });
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
      const notes = await listFacts({ notesDirectory: state.activeNotesDirectory });
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
