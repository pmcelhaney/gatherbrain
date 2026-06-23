#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ensureContextDirectory, saveFact } from './facts.js';

const defaultAppDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const quitCommands = new Set([':q', ':quit', ':exit']);

export function createPromptState(options = {}) {
  const appDirectory = options.appDirectory ?? defaultAppDirectory;
  const notesDirectory = options.notesDirectory ?? path.join(appDirectory, 'notes');

  return {
    appDirectory,
    notesDirectory,
    activeNotesDirectory: notesDirectory
  };
}

export async function handleEntry(entry, state) {
  const command = entry.trim();

  if (quitCommands.has(command)) {
    return { action: 'quit' };
  }

  if (command.length === 0) {
    return { action: 'continue' };
  }

  const contextSwitch = command.match(/^\/s(?:\s+(.*))?$/u);

  if (contextSwitch) {
    const contextName = contextSwitch[1]?.trim() ?? '';

    if (contextName.length === 0) {
      return {
        action: 'continue',
        message: 'usage: /s <context>'
      };
    }

    try {
      state.activeNotesDirectory = await ensureContextDirectory(contextName, {
        notesDirectory: state.notesDirectory
      });
    } catch (error) {
      return {
        action: 'continue',
        message: error.message
      };
    }

    return {
      action: 'continue',
      message: `context ${path.relative(state.notesDirectory, state.activeNotesDirectory)}`
    };
  }

  const savedPath = await saveFact(entry, {
    notesDirectory: state.activeNotesDirectory
  });

  return {
    action: 'continue',
    message: `saved ${path.relative(state.appDirectory, savedPath)}`
  };
}

async function main() {
  const terminal = readline.createInterface({ input, output });
  const state = createPromptState();

  terminal.on('SIGINT', () => {
    output.write('\n');
    terminal.close();
  });

  output.write('gatherbrain\n');

  try {
    while (true) {
      const entry = await terminal.question('> ');
      const result = await handleEntry(entry, state);

      if (result.action === 'quit') {
        break;
      }

      if (result.message) {
        output.write(`${result.message}\n`);
      }
    }
  } finally {
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
