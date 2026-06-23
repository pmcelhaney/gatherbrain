#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { saveFact } from './facts.js';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const notesDirectory = path.join(appDirectory, 'notes');

const quitCommands = new Set([':q', ':quit', ':exit']);

async function main() {
  const terminal = readline.createInterface({ input, output });

  terminal.on('SIGINT', () => {
    output.write('\n');
    terminal.close();
  });

  output.write('gatherbrain\n');

  try {
    while (true) {
      const entry = await terminal.question('> ');
      const command = entry.trim();

      if (quitCommands.has(command)) {
        break;
      }

      if (command.length === 0) {
        continue;
      }

      const savedPath = await saveFact(entry, { notesDirectory });
      output.write(`saved ${path.relative(appDirectory, savedPath)}\n`);
    }
  } finally {
    terminal.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
