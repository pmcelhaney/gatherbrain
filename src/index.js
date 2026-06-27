#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import readline from 'node:readline/promises';
import {
  argv as processArgv,
  env as processEnv,
  execPath,
  stdin as input,
  stdout as output
} from 'node:process';
import { watchWorkspaceConfig } from './config-watch.js';
import {
  commandArgumentValues,
  commandArguments,
  commandNames,
  commandHelp,
  commandHelpText,
  continuePromptedCommand,
  loadCommandRegistry,
  parseEntry
} from './commands.js';
import {
  filenameBaseForTitle,
  timestampForFilename
} from './facts.js';
import {
  loadWorkspaceModel,
  watchWorkspaceModel
} from './model.js';
import {
  appendTimebox,
  cancelTimebox,
  contextsOverlappingTime,
  plannerLines,
  resolveContextForTime,
  timeboxDate
} from './timeboxes.js';
import {
  defaultLensId,
  filterFactsForLens,
  hasLens,
  lensIds,
  loadLensRegistry,
  presentLens
} from './lenses.js';
import {
  clearTemplateCache,
  renderTemplateLines
} from './templates.js';
import { loadSettings } from './settings.js';
import {
  addWorkspaceEnumValue,
  contextDirectoryForId,
  contextDirectoryForSwitchReference,
  contextHasHiddenPathPart,
  contextIdForDirectory,
  contextIdForSwitchReference,
  contextIds,
  createContext,
  createFact,
  deleteWorkspaceFact,
  ensureWorkspaceModel,
  referencedFilePathForFact,
  relateWorkspaceFact,
  resolveExistingContextDirectory,
  resolveExistingSwitchContextDirectory,
  setWorkspaceFactProperty,
  setWorkspaceFactType,
  refreshWorkspaceFact
} from './api.js';

const defaultAppDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ansiTypeColor = '\x1b[36m';
const ansiLinkColor = '\x1b[34m';
const ansiRelationColor = '\x1b[35m';
const ansiSecondaryColor = '\x1b[2m';
const ansiResetColor = '\x1b[39m';
const ansiResetIntensity = '\x1b[22m';
const ansiCommandPromptBackground = '\x1b[48;5;236m';
const ansiPeekBackground = '\x1b[48;5;234m';
const ansiResetAll = '\x1b[0m';
const ansiCodePattern = /\x1b\[[0-9;]*m/gu;
const restartRestoreEnv = 'GATHERBRAIN_RESTORE';
const factTypeEnumName = 'factType';
const dateCompletionValues = [
  'today',
  'tomorrow',
  'yesterday',
  'next monday',
  'next tuesday',
  'next wednesday',
  'next thursday',
  'next friday',
  'next saturday',
  'next sunday',
  'in 1 day',
  'in 1 week'
];
export function createPromptState(options = {}) {
  const appDirectory = options.appDirectory ?? defaultAppDirectory;
  const rootDirectory = options.rootDirectory ?? options.notesDirectory ?? path.join(appDirectory, 'notes');

  return {
    appDirectory,
    rootDirectory,
    currentContextDirectory: rootDirectory,
    peekContextDirectory: null,
    commandRegistry: options.commandRegistry ?? null,
    lensRegistry: options.lensRegistry ?? null,
    settings: options.settings ?? null,
    currentLensId: defaultLensId,
    peekLensId: defaultLensId,
    itemNumberAssignments: new Map(),
    nextItemNumber: 1,
    model: options.model ?? null,
    pageStartIndex: 0,
    pendingCommand: null,
    pendingContextCreation: null,
    pendingFactTypeConfirmation: null,
    pendingTimeboxCancellation: null,
    temporaryBodyLines: null,
    temporaryBodyType: null,
    temporaryBodyDate: null,
    lensBackStack: [],
    lensForwardStack: [],
    debugKeys: false,
    statusMessage: '',
    now: options.now ?? (() => new Date()),
    openPath: options.openPath ?? openPath,
    readClipboard: options.readClipboard ?? readClipboard
  };
}

function resetItemNumbers(state) {
  state.itemNumberAssignments = new Map();
  state.nextItemNumber = 1;
}

function factIdentity(fact, fallbackIndex = 0) {
  return fact?.id
    ?? fact?.path
    ?? fact?.filename
    ?? `visible:${fallbackIndex}`;
}

function visibleFactsWithItemNumbers(facts, state = null) {
  if (!state) {
    return facts.map((fact, index) => ({
      ...fact,
      itemNumber: facts.length - index
    }));
  }

  if (!(state.itemNumberAssignments instanceof Map)) {
    resetItemNumbers(state);
  }

  const unassigned = facts
    .map((fact, index) => ({
      fact,
      key: factIdentity(fact, index)
    }))
    .filter(({ key }) => !state.itemNumberAssignments.has(key));

  for (const [index, { key }] of unassigned.entries()) {
    state.itemNumberAssignments.set(key, state.nextItemNumber + unassigned.length - index - 1);
  }

  state.nextItemNumber += unassigned.length;

  return facts.map((fact, index) => ({
    ...fact,
    itemNumber: state.itemNumberAssignments.get(factIdentity(fact, index))
  }));
}

export function currentContextName(state) {
  const relativeContext = path.relative(
    state.rootDirectory,
    state.currentContextDirectory
  );

  return relativeContext.length > 0 ? relativeContext : path.basename(state.rootDirectory);
}

export function currentPeekName(state) {
  if (!state.peekContextDirectory) {
    return null;
  }

  const relativeContext = path.relative(
    state.rootDirectory,
    state.peekContextDirectory
  );

  return relativeContext.length > 0 ? relativeContext : path.basename(state.rootDirectory);
}

function currentLensIdForState(state) {
  return state.peekContextDirectory
    ? state.peekLensId ?? defaultLensId
    : state.currentLensId ?? defaultLensId;
}

function currentLens(state) {
  return {
    currentLensId: currentLensIdForState(state),
    currentContextDirectory: state.peekContextDirectory ?? state.currentContextDirectory
  };
}

function lensesAreEqual(left, right) {
  return left.currentLensId === right.currentLensId
    && path.resolve(left.currentContextDirectory) === path.resolve(right.currentContextDirectory);
}

function applyLens(state, lens) {
  if (state.peekContextDirectory) {
    state.peekLensId = lens.currentLensId;
    state.peekContextDirectory = lens.currentContextDirectory;
  } else {
    state.currentLensId = lens.currentLensId;
    state.currentContextDirectory = lens.currentContextDirectory;
  }
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

function serializeLens(lens, state) {
  return {
    currentLensId: lens.currentLensId,
    currentContextId: contextIdForDirectory(state, lens.currentContextDirectory)
  };
}

export function restartSnapshotForState(state) {
  return {
    currentContextId: contextIdForDirectory(state, state.currentContextDirectory),
    peekContextId: state.peekContextDirectory
      ? contextIdForDirectory(state, state.peekContextDirectory)
      : null,
    peekLensId: state.peekLensId ?? defaultLensId,
    currentLensId: state.currentLensId ?? defaultLensId,
    lensBackStack: state.lensBackStack.map((lens) => serializeLens(lens, state)),
    lensForwardStack: state.lensForwardStack.map((lens) => serializeLens(lens, state)),
    pageStartIndex: state.pageStartIndex ?? 0
  };
}

function restoredContextDirectory(state, contextId) {
  return state.model?.contexts?.has(contextId)
    ? contextDirectoryForId(state, contextId)
    : null;
}

function restoredLensId(state, lensId) {
  return hasLens(lensId, state.lensRegistry) ? lensId : defaultLensId;
}

function restoreLensStack(stack, state) {
  return Array.isArray(stack)
    ? stack.flatMap((lens) => {
      if (!lens || typeof lens.currentContextId !== 'string') {
        return [];
      }

      const currentContextDirectory = restoredContextDirectory(state, lens.currentContextId);

      return currentContextDirectory
        ? [{
          currentLensId: restoredLensId(state, lens.currentLensId),
          currentContextDirectory
        }]
        : [];
    })
    : [];
}

export function restorePromptState(state, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return state;
  }

  const currentContextDirectory = typeof snapshot.currentContextId === 'string'
    ? restoredContextDirectory(state, snapshot.currentContextId)
    : null;

  if (currentContextDirectory) {
    state.currentContextDirectory = currentContextDirectory;
  }

  const snapshotPeekContextId = typeof snapshot.peekContextId === 'string'
    ? snapshot.peekContextId
    : snapshot.gazeContextId;
  const peekContextDirectory = typeof snapshotPeekContextId === 'string'
    ? restoredContextDirectory(state, snapshotPeekContextId)
    : null;
  state.peekContextDirectory = peekContextDirectory;
  state.peekLensId = restoredLensId(state, snapshot.peekLensId);
  state.currentLensId = restoredLensId(state, snapshot.currentLensId);
  state.lensBackStack = restoreLensStack(snapshot.lensBackStack, state);
  state.lensForwardStack = restoreLensStack(snapshot.lensForwardStack, state);
  state.pageStartIndex = Number.isInteger(snapshot.pageStartIndex) && snapshot.pageStartIndex >= 0
    ? snapshot.pageStartIndex
    : 0;

  return state;
}

export function restartSnapshotFromEnv(env = processEnv) {
  if (!env[restartRestoreEnv]) {
    return null;
  }

  try {
    return JSON.parse(env[restartRestoreEnv]);
  } catch {
    return null;
  }
}

export function restartEnvForState(state, env = processEnv) {
  return {
    ...env,
    [restartRestoreEnv]: JSON.stringify(restartSnapshotForState(state))
  };
}

export function restartAppProcess(options = {}) {
  const {
    env,
    nodePath = execPath,
    args = processArgv.slice(1),
    spawnProcess = spawn
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawnProcess(nodePath, args, {
      env,
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(signal
        ? `restart exited with signal ${signal}`
        : `restart exited with code ${code}`));
    });
  });
}

function openCommandForPlatform(platform) {
  if (platform === 'darwin') {
    return { command: 'open', args: [] };
  }

  if (platform === 'win32') {
    return { command: 'cmd.exe', args: ['/c', 'start', ''] };
  }

  return { command: 'xdg-open', args: [] };
}

export function openPath(filePath, options = {}) {
  const {
    platform = process.platform,
    spawnProcess = spawn
  } = options;
  const { command, args } = openCommandForPlatform(platform);

  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, [...args, filePath], {
      stdio: 'ignore',
      detached: true
    });

    child.on('error', reject);
    child.on('spawn', () => {
      child.unref?.();
      resolve();
    });
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(signal
        ? `${command} exited with signal ${signal}`
        : `${command} exited with code ${code}`));
    });
  });
}

function clipboardCommandsForPlatform(platform) {
  if (platform === 'darwin') {
    return [{ command: 'pbpaste', args: [] }];
  }

  if (platform === 'win32') {
    return [{ command: 'powershell.exe', args: ['-NoProfile', '-Command', 'Get-Clipboard'] }];
  }

  return [
    { command: 'wl-paste', args: ['--no-newline'] },
    { command: 'xclip', args: ['-selection', 'clipboard', '-out'] },
    { command: 'xsel', args: ['--clipboard', '--output'] }
  ];
}

function readClipboardWithCommand(command, args, spawnProcess) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout?.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr?.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString('utf8'));
        return;
      }

      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      reject(new Error(signal
        ? `${command} exited with signal ${signal}`
        : stderr || `${command} exited with code ${code}`));
    });
  });
}

async function writeMacClipboardImage(imagePath, spawnProcess) {
  const pngClass = '\u00abclass PNGf\u00bb';
  const script = [
    'on run argv',
    'set outputPath to POSIX file (item 1 of argv)',
    `set imageData to the clipboard as ${pngClass}`,
    'set fileRef to open for access outputPath with write permission',
    'try',
    'set eof fileRef to 0',
    'write imageData to fileRef',
    'close access fileRef',
    'on error errorMessage',
    'try',
    'close access fileRef',
    'end try',
    'error errorMessage',
    'end try',
    'end run'
  ];

  await readClipboardWithCommand(
    'osascript',
    script.flatMap((line) => ['-e', line]).concat(imagePath),
    spawnProcess
  );
}

export async function readClipboard(options = {}) {
  const {
    imagePath = null,
    platform = process.platform,
    spawnProcess = spawn
  } = options;
  const commands = clipboardCommandsForPlatform(platform);
  const errors = [];

  if (platform === 'darwin' && imagePath) {
    try {
      await writeMacClipboardImage(imagePath, spawnProcess);

      return {
        type: 'file',
        extension: '.png',
        filePath: imagePath
      };
    } catch (error) {
      errors.push(error.message);
    }
  }

  for (const { command, args } of commands) {
    try {
      return {
        type: 'text',
        extension: '.txt',
        contents: await readClipboardWithCommand(command, args, spawnProcess)
      };
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(`could not read clipboard: ${errors.join('; ')}`);
}

function normalizeClipboardItem(clipboardItem) {
  return typeof clipboardItem === 'string'
    ? {
      type: 'text',
      extension: '.txt',
      contents: clipboardItem
    }
    : clipboardItem;
}

async function reserveUniqueFilePath(directory, filenameBase, extension) {
  await mkdir(directory, { recursive: true });

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const filename = `${attempt === 0 ? filenameBase : `${filenameBase}-${attempt + 1}`}${extension}`;
    const filePath = path.join(directory, filename);

    try {
      await writeFile(filePath, '', { flag: 'wx' });
      return filePath;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  throw new Error('Could not reserve a unique pasted file');
}

async function writeUniqueFile(directory, filenameBase, extension, contents) {
  await mkdir(directory, { recursive: true });

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const filename = `${attempt === 0 ? filenameBase : `${filenameBase}-${attempt + 1}`}${extension}`;
    const filePath = path.join(directory, filename);

    try {
      await writeFile(filePath, contents, { flag: 'wx' });
      return filePath;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  throw new Error('Could not create a unique pasted file');
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

async function contextIdsForState(state) {
  return contextIds(state);
}

function lensContextDirectoryForState(state) {
  return state.peekContextDirectory ?? state.currentContextDirectory;
}

export function filterFactsForLensId(facts, lens = defaultLensId) {
  return filterFactsForLens(facts, lens);
}

export async function visibleBodyForState(state) {
  const model = await ensureWorkspaceModel(state);
  const lensModel = presentLens({
    model,
    state: {
      ...state,
      lensContextDirectory: lensContextDirectoryForState(state)
    },
    lensRegistry: state.lensRegistry,
    lensId: currentLensIdForState(state)
  });

  return lensModel.body ?? {
    type: 'facts',
    template: 'facts',
    facts: lensModel.facts ?? []
  };
}

function factsForBody(body) {
  return body?.type === 'facts' && Array.isArray(body.facts)
    ? body.facts
    : [];
}

export async function visibleFactsForState(state) {
  return factsForBody(await visibleBodyForState(state));
}

async function visibleFactAtIndex(state, index) {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error('item number must be a positive integer');
  }

  const facts = visibleFactsWithItemNumbers(await visibleFactsForState(state), state);
  const fact = facts.find((candidate) => candidate.itemNumber === index);

  if (!fact) {
    throw new Error(`item ${index} does not exist`);
  }

  return fact;
}

async function visibleFactForSelector(state, selector) {
  if (Number.isInteger(selector.itemNumber)) {
    const fact = await visibleFactAtIndex(state, selector.itemNumber);

    return {
      fact,
      itemLabel: String(selector.itemNumber),
      itemNumber: selector.itemNumber
    };
  }

  if (typeof selector.itemTitle === 'string' && selector.itemTitle.length > 0) {
    const facts = visibleFactsWithItemNumbers(await visibleFactsForState(state), state);
    const matches = facts
      .map((fact) => ({
        fact,
        itemNumber: fact.itemNumber
      }))
      .filter((candidate) => candidate.fact.title === selector.itemTitle);

    if (matches.length === 0) {
      throw new Error(`fact ${selector.itemTitle} does not exist`);
    }

    if (matches.length > 1) {
      throw new Error(`fact ${selector.itemTitle} is ambiguous`);
    }

    return {
      fact: matches[0].fact,
      itemLabel: selector.itemTitle,
      itemNumber: matches[0].itemNumber
    };
  }

  throw new Error('item selector is required');
}

async function openPathForReference(state, selector) {
  if (!Number.isInteger(selector.itemNumber) && !selector.itemTitle) {
    return {
      itemLabel: null,
      filePath: state.currentContextDirectory
    };
  }

  const { fact, itemLabel } = await visibleFactForSelector(state, selector);

  return {
    itemLabel,
    filePath: referencedFilePathForFact(fact, itemLabel)
  };
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

  if (result.lastIndexOf(ansiSecondaryColor) > result.lastIndexOf(ansiResetIntensity)) {
    result += ansiResetIntensity;
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

function markdownLinksInText(text) {
  return [
    ...[...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/gu)]
      .map((match) => path.basename(match[1].trim())),
    ...[...text.matchAll(/(?<!!)\[([^\]]+)\]\([^)]+\)/gu)]
      .map((match) => match[1])
  ];
}

function markdownLinkTargetsInText(text) {
  return [...text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)]
    .map((match) => match[1].trim());
}

function plainTextWithMarkdownLinks(text) {
  return text
    .replace(/!\[[^\]]*\]\(([^)]+)\)/gu, (_match, target) => path.basename(target.trim()))
    .replace(/(?<!!)\[([^\]]+)\]\([^)]+\)/gu, '$1');
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

function displaySecondarySuffix(suffix, includeColor) {
  return includeColor
    ? `${ansiSecondaryColor}${suffix}${ansiResetIntensity}`
    : suffix;
}

function formattedDisplayLines(text, options = {}) {
  const {
    columns,
    continuationColumns,
    continuationPrefix,
    firstColumns,
    includeColor,
    relationSuffix = '',
    secondarySuffix = ''
  } = options;
  const lines = text.split(/\r?\n/u);
  const displayLines = lines.length > 0 ? lines : [''];

  return displayLines.flatMap((line, lineIndex) => {
    const linkLabels = markdownLinksInText(line);
    const plainLine = plainTextWithMarkdownLinks(line);
    const trailingSuffix = lineIndex === displayLines.length - 1
      ? [relationSuffix, secondarySuffix].filter((part) => part.length > 0).join(' ')
      : '';
    const displayLine = lineIndex === displayLines.length - 1
      ? `${plainLine}${trailingSuffix ? ` ${trailingSuffix}` : ''}`
      : plainLine;
    const wrappedLines = wrapPlainText(
      displayLine,
      lineIndex === 0 ? firstColumns : continuationColumns
    );

    return wrappedLines.map((wrappedLine, wrappedLineIndex) => {
      const linkLine = displayMarkdownLinks(wrappedLine, linkLabels, includeColor);
      let displayedLine = linkLine;

      if (
        relationSuffix
        && secondarySuffix
        && displayedLine.endsWith(`${relationSuffix} ${secondarySuffix}`)
      ) {
        displayedLine = `${displayedLine.slice(0, -(relationSuffix.length + secondarySuffix.length + 1))}${displayRelationSuffix(relationSuffix, includeColor)} ${displaySecondarySuffix(secondarySuffix, includeColor)}`;
      } else {
        if (relationSuffix && displayedLine.endsWith(relationSuffix)) {
          displayedLine = `${displayedLine.slice(0, -relationSuffix.length)}${displayRelationSuffix(relationSuffix, includeColor)}`;
        }

        if (secondarySuffix && displayedLine.endsWith(secondarySuffix)) {
          displayedLine = `${displayedLine.slice(0, -secondarySuffix.length)}${displaySecondarySuffix(secondarySuffix, includeColor)}`;
        }
      }

      return lineIndex === 0 && wrappedLineIndex === 0
        ? displayedLine
        : `${continuationPrefix}${displayedLine}`;
    });
  });
}

function factViewModelsForDisplay(facts, options = {}) {
  const {
    columns = 80,
    includeColor = false,
    template = 'facts',
    templateRootDirectory = null
  } = options;

  const numberWidth = Math.max(2, ...facts.map((fact) => String(fact.itemNumber ?? 0).length));
  const continuationPrefix = '    ';
  const continuationColumns = Math.max(columns - continuationPrefix.length, 1);

  return facts.map((fact, factIndex) => {
    const itemNumber = fact.itemNumber ?? facts.length - factIndex;
    const bodyText = fact.text ?? '';
    const titleText = fact.title?.trim() ?? '';
    const displayText = bodyText.length > 0 ? bodyText : titleText;
    const type = fact.type ?? 'fact';
    const relationSuffix = relationSuffixText(displayRelationsForFact(fact), fact.displayRelationDirection);
    const secondarySuffix = `[${itemNumber}]`;
    const displayType = type === 'fact' ? '' : type;
    const sourceContext = fact.sourceContext ?? '';
    const sourceContextShort = fact.sourceContextShort ?? '';
    const firstPrefix = [
      sourceContextShort,
      displayType
    ].filter((part) => part.length > 0).join(' ');
    const firstPrefixWithSpacing = firstPrefix.length > 0 ? `${firstPrefix} ` : '';
    const firstColumns = Math.max(columns - visibleLength(firstPrefixWithSpacing), 1);
    const displayOptions = {
      columns,
      continuationColumns,
      continuationPrefix,
      firstColumns,
      includeColor,
      relationSuffix,
      secondarySuffix
    };
    const bodyLines = formattedDisplayLines(bodyText, displayOptions);
    const displayLines = formattedDisplayLines(displayText, displayOptions);

    if (bodyText.length === 0 && titleText.length > 0) {
      bodyLines.splice(0, bodyLines.length, ...displayLines);
    }

    const viewModel = {
      number: String(itemNumber).padStart(numberWidth),
      numberSuffix: secondarySuffix,
      type: displayType,
      sourceContext,
      sourceContextShort,
      title: titleText,
      body: bodyLines.join('\n'),
      display: displayLines.join('\n')
    };

    return {
      ...viewModel,
      blockLines: renderTemplateLines(template, {
        emptyText: 'No facts yet.',
        facts: [viewModel],
        hasFacts: true,
        includeColor
      }, {
        rootDirectory: templateRootDirectory
      })
    };
  });
}

export function buildPagedFactLines(options = {}) {
  const {
    columns = 80,
    includeColor = false,
    facts = [],
    pageStartIndex = 0,
    rows = 0,
    template = 'facts',
    templateRootDirectory = null,
    state = null
  } = options;
  const factRows = Math.max(rows, 0);

  if (factRows === 0) {
    return {
      lines: [],
      nextPageStartIndex: null,
      previousPageStartIndex: pageStartIndex > 0 ? 0 : null
    };
  }

  if (facts.length === 0) {
    const lines = renderTemplateLines(template, {
      emptyText: 'No facts yet.',
      facts: [],
      hasFacts: false,
      includeColor
    }, {
      rootDirectory: templateRootDirectory
    });

    return {
      lines: lines.slice(0, factRows),
      nextPageStartIndex: null,
      previousPageStartIndex: null
    };
  }

  const numberedFacts = visibleFactsWithItemNumbers(facts, state);
  const factViewModels = factViewModelsForDisplay(numberedFacts, {
    columns,
    includeColor,
    template,
    templateRootDirectory
  });
  const startIndex = Math.min(Math.max(pageStartIndex, 0), facts.length - 1);
  const lines = [];
  const pageFacts = [];
  let nextPageStartIndex = null;
  let renderPageTemplate = true;

  for (let factIndex = startIndex; factIndex < factViewModels.length; factIndex += 1) {
    const fact = factViewModels[factIndex];
    const hasMoreAfter = factIndex < factViewModels.length - 1;
    const rowsNeeded = fact.blockLines.length + (hasMoreAfter ? 1 : 0);

    if (lines.length > 0 && lines.length + rowsNeeded > factRows) {
      nextPageStartIndex = factIndex;
      break;
    }

    if (lines.length === 0 && fact.blockLines.length > factRows) {
      lines.push(...fact.blockLines.slice(0, Math.max(factRows - 1, 0)));
      lines.push('...');
      nextPageStartIndex = factIndex + 1 < factViewModels.length ? factIndex + 1 : null;
      renderPageTemplate = false;
      break;
    }

    if (lines.length + fact.blockLines.length > factRows) {
      nextPageStartIndex = factIndex;
      break;
    }

    pageFacts.push(fact);
    lines.push(...fact.blockLines);
  }

  const previousPageStartIndex = startIndex > 0 ? Math.max(startIndex - 1, 0) : null;
  const pageLines = renderPageTemplate
    ? renderTemplateLines(template, {
      emptyText: 'No facts yet.',
      facts: pageFacts,
      hasFacts: pageFacts.length > 0,
      includeColor
    }, {
      rootDirectory: templateRootDirectory
    })
    : lines;

  if (nextPageStartIndex !== null && renderPageTemplate) {
    pageLines.push('...');
  }

  return {
    lines: pageLines,
    nextPageStartIndex,
    previousPageStartIndex
  };
}

function temporaryBodyPage(lines, rows, columns, pageStartIndex = 0) {
  const wrappedLines = lines.flatMap((line) => wrapPlainText(line, columns));
  const startIndex = Math.min(Math.max(pageStartIndex, 0), Math.max(wrappedLines.length - 1, 0));

  return {
    lines: wrappedLines.slice(startIndex, startIndex + rows),
    nextPageStartIndex: startIndex + rows < wrappedLines.length ? startIndex + rows : null,
    previousPageStartIndex: startIndex > 0 ? Math.max(startIndex - rows, 0) : null
  };
}

function buildTemporaryBodyLines(lines, rows, columns, pageStartIndex = 0) {
  return temporaryBodyPage(lines, rows, columns, pageStartIndex);
}

function pageNavigationForTemporaryBody(options = {}) {
  const {
    columns = 80,
    lines = [],
    pageStartIndex = 0,
    rows = 0
  } = options;

  return temporaryBodyPage(lines, rows, columns, pageStartIndex);
}

export function pageNavigationForFacts(options = {}) {
  const {
    columns = 80,
    includeColor = false,
    body = null,
    facts = [],
    pageStartIndex = 0,
    state = null,
    templateRootDirectory = null,
    rows = 0
  } = options;
  const currentPage = buildPagedFactLines({
    columns,
    includeColor,
    facts: body ? factsForBody(body) : facts,
    state,
    template: body?.template ?? 'facts',
    templateRootDirectory,
    pageStartIndex,
    rows
  });
  let previousPageStartIndex = null;
  let candidateStartIndex = 0;

  while (candidateStartIndex < pageStartIndex) {
    const candidatePage = buildPagedFactLines({
      columns,
      includeColor,
      facts: body ? factsForBody(body) : facts,
      state,
      template: body?.template ?? 'facts',
      templateRootDirectory,
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

export function pageNavigationForBody(options = {}) {
  if (options.state?.temporaryBodyLines) {
    return pageNavigationForTemporaryBody({
      columns: options.columns,
      lines: options.state.temporaryBodyLines,
      pageStartIndex: options.pageStartIndex,
      rows: options.rows
    });
  }

  return pageNavigationForFacts({
    ...options,
    body: options.body
  });
}

function promptQuestionForState(state = {}) {
  if (
    !state.pendingCommand
    && !state.pendingContextCreation
    && !state.pendingFactTypeConfirmation
    && !state.pendingTimeboxCancellation
  ) {
    return '';
  }

  return state.statusMessage
    || state.pendingCommand?.argument?.prompt
    || state.pendingTimeboxCancellation?.prompt
    || '';
}

function promptLabelWithDefault(prompt, defaultValue) {
  return defaultValue === undefined
    ? prompt
    : `${prompt} [${defaultValue}]`;
}

function pendingCommandForParsedEntry(parsedEntry, state) {
  const values = { ...parsedEntry.values };
  const argument = { ...parsedEntry.argument };
  let prompt = parsedEntry.prompt;

  if (parsedEntry.commandName === 'paste' && argument.name === 'title') {
    const timestamp = timestampForFilename(state.now());
    const defaultValue = `Pasted ${timestamp}`;

    values.timestamp = timestamp;
    argument.defaultValue = defaultValue;
    prompt = promptLabelWithDefault(prompt, defaultValue);
  }

  return {
    pendingCommand: {
      commandName: parsedEntry.commandName,
      ...(state.commandRegistry ? { registry: state.commandRegistry } : {}),
      values,
      argument
    },
    prompt
  };
}

export function buildTuiLines(options = {}) {
  const {
    state,
    body = null,
    facts = [],
    rows = 24,
    columns = 80,
    includeColor = false
  } = options;
  const visibleRows = Math.max(rows - 1, 1);
  const promptQuestion = promptQuestionForState(state);
  const factRows = Math.max(visibleRows - 2, 0);
  const lens = currentLensIdForState(state);
  const peek = currentPeekName(state);
  const lensText = lens === defaultLensId ? '' : ` | ${lens}`;
  const peekText = peek ? ` -> ${peek}` : '';
  const status = state.statusMessage && !promptQuestion ? ` | ${state.statusMessage}` : '';
  const header = fitLine(`${currentContextName(state)}${peekText}${lensText}${status}`, columns);
  const separator = '-'.repeat(Math.max(columns, 0));
  const bodyFacts = body ? factsForBody(body) : facts;
  const { lines: bodyLines } = state.temporaryBodyLines
    ? buildTemporaryBodyLines(state.temporaryBodyLines, factRows, columns, state.pageStartIndex ?? 0)
    : buildPagedFactLines({
      columns,
      includeColor,
      facts: bodyFacts,
      state,
      template: body?.template ?? 'facts',
      templateRootDirectory: state.rootDirectory,
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

  const screenBackground = options.state?.peekContextDirectory ? ansiPeekBackground : '';
  const resetBackground = screenBackground ? ansiResetAll : '';

  return `${screenBackground}\x1b[2J\x1b[H${screen}\x1b[${rows};1H${resetBackground}`;
}

function commandModePromptActive(line, state = {}) {
  return line.startsWith(':')
    || line.startsWith('%')
    || Boolean(state.pendingCommand)
    || Boolean(state.pendingContextCreation)
    || Boolean(state.pendingFactTypeConfirmation)
    || Boolean(state.pendingTimeboxCancellation);
}

export function renderPromptLine(line, options = {}) {
  const {
    includeAnsi = true,
    state = {}
  } = options;
  const prompt = `> ${line}`;

  if (!includeAnsi || !commandModePromptActive(line, state)) {
    return prompt;
  }

  return `${ansiCommandPromptBackground}${prompt}\x1b[K${ansiResetAll}`;
}

export function renderQuestionPrompt(options = {}) {
  const {
    includeAnsi = true,
    state = {}
  } = options;
  const question = promptQuestionForState(options.state);

  if (!question) {
    return renderPromptLine('', options);
  }

  const prompt = `${question} > `;

  if (!includeAnsi || !commandModePromptActive('', state)) {
    return prompt;
  }

  return `${ansiCommandPromptBackground}${prompt}\x1b[K${ansiResetAll}`;
}

function startsWithCaseInsensitive(value, prefix) {
  return value.toLowerCase().startsWith(prefix.toLowerCase());
}

function hasWordStartCaseInsensitive(value, prefix) {
  if (prefix.length === 0) {
    return true;
  }

  return value
    .split(/[^\p{L}\p{N}]+/u)
    .filter((part) => part.length > 0)
    .some((part) => startsWithCaseInsensitive(part, prefix));
}

function completionMatchRank(value, prefix) {
  if (prefix.length === 0 || startsWithCaseInsensitive(value, prefix)) {
    return 0;
  }

  return hasWordStartCaseInsensitive(value, prefix) ? 1 : null;
}

function rankedCompletionMatches(values, rankForValue) {
  return values
    .map((value, index) => ({
      index,
      rank: rankForValue(value),
      value
    }))
    .filter((match) => match.rank !== null)
    .toSorted((left, right) => left.rank - right.rank || left.index - right.index)
    .map((match) => match.value);
}

function commandArgumentsForCompletion(commandName, state) {
  const matchingCommandName = commandNames(state.commandRegistry)
    .find((candidate) => candidate.toLowerCase() === commandName.toLowerCase());

  return matchingCommandName
    ? commandArguments(matchingCommandName, state.commandRegistry)
    : null;
}

export async function completeEntry(line, state) {
  if (state.pendingTimeboxCancellation) {
    const matches = state.pendingTimeboxCancellation.matches
      .map((_match, index) => String(index + 1))
      .filter((value) => startsWithCaseInsensitive(value, line));

    return [matches, line];
  }

  if (state.pendingFactTypeConfirmation) {
    const matches = ['yes', 'no'].filter((value) => startsWithCaseInsensitive(value, line));

    return [matches, line];
  }

  if (state.pendingContextCreation) {
    const matches = ['yes', 'no'].filter((value) => startsWithCaseInsensitive(value, line));

    return [matches, line];
  }

  if (state.pendingCommand?.argument?.type === 'fact') {
    const matches = await matchingFactCompletions(line, state);

    return [matches, line];
  }

  if (state.pendingCommand?.argument?.type === 'context') {
    const matches = await matchingContextCompletions(line, state);

    return [matches.map((context) => context.name), line];
  }

  if (state.pendingCommand?.argument?.type === 'lens') {
    const matches = lensIds(state.lensRegistry).filter((lensId) => startsWithCaseInsensitive(lensId, line));

    return [matches, line];
  }

  if (enumCompletableArgument(state.pendingCommand?.argument)) {
    const matches = commandArgumentValues(state.pendingCommand.argument, state.commandRegistry)
      .filter((value) => startsWithCaseInsensitive(value, line));

    return [matches, line];
  }

  const commandCompletion = line.match(/^:(?<partial>[A-Za-z0-9_-]*)$/u);

  if (commandCompletion) {
    const partialCommand = commandCompletion.groups.partial;
    const matches = commandNames(state.commandRegistry)
      .filter((commandName) => startsWithCaseInsensitive(commandName, partialCommand))
      .map((commandName) => `:${commandName} `);

    return [matches, line];
  }

  const typedFactCompletion = line.match(/^%(?<partial>[^\s]*)$/u);

  if (typedFactCompletion) {
    const partialType = typedFactCompletion.groups.partial ?? '';
    const matches = commandArgumentValues({
      type: 'factType',
      enum: factTypeEnumName
    }, state.commandRegistry)
      .filter((value) => startsWithCaseInsensitive(value, partialType))
      .map((value) => `%${value} `);

    return [matches, line];
  }

  const typedFactTypeCompletion = line.match(/^\.(?<partial>[^\s]*)$/u);

  if (typedFactTypeCompletion) {
    const partialType = typedFactTypeCompletion.groups.partial ?? '';
    const matches = commandArgumentValues({
      type: 'factType',
      enum: factTypeEnumName
    }, state.commandRegistry)
      .filter((value) => startsWithCaseInsensitive(value, partialType))
      .map((value) => `.${value} `);

    return [matches, line];
  }

  const typedFactTypeItemCompletion = line.match(/^\.(?<type>[^\s]+(?:\s+[^\s]+)*)\s+(?<partial>.*)$/u);

  if (typedFactTypeItemCompletion) {
    const normalizedType = matchingFactTypeForState(typedFactTypeItemCompletion.groups.type, state);

    if (normalizedType) {
      const matches = await matchingFactCompletions(typedFactTypeItemCompletion.groups.partial ?? '', state);

      return [matches, typedFactTypeItemCompletion.groups.partial ?? ''];
    }
  }

  const trailingNamedArgumentCompletion = await matchingTrailingNamedArgument(line, state);

  if (trailingNamedArgumentCompletion) {
    return trailingNamedArgumentCompletion;
  }

  const namedEnumCompletion = matchingNamedEnumArgument(line, state);

  if (namedEnumCompletion) {
    return namedEnumCompletion;
  }

  const namedFactCompletion = await matchingNamedFactArgument(line, state);

  if (namedFactCompletion) {
    return namedFactCompletion;
  }

  const namedContextCompletion = line.match(/^:(?<commandName>[A-Za-z][A-Za-z0-9_-]*)\s+(?<partial>.*)$/u);
  const namedContextArguments = namedContextCompletion
    ? commandArgumentsForCompletion(namedContextCompletion.groups.commandName, state)
    : null;

  const cancelContextCompletion = await matchingCancelContextCompletion(line, state);

  if (cancelContextCompletion) {
    return cancelContextCompletion;
  }

  if (
    namedContextCompletion
    && namedContextArguments?.length === 1
    && namedContextArguments.at(0)?.type === 'context'
  ) {
    const partialContext = namedContextCompletion.groups.partial ?? '';
    const matches = namedContextCompletion.groups.commandName.toLowerCase() === 'switch'
      ? await matchingSwitchContextCompletions(partialContext, state)
      : await matchingContextCompletions(partialContext, state);

    return [matches.map((context) => context.name), partialContext];
  }

  const namedRelationCompletion = line.match(/^:(?<commandName>[A-Za-z][A-Za-z0-9_-]*)\s+[1-9]\d*\s+(?<partial>.*)$/u);
  const namedRelationArguments = namedRelationCompletion
    ? commandArgumentsForCompletion(namedRelationCompletion.groups.commandName, state)
    : null;

  if (
    namedRelationCompletion
    && namedRelationArguments?.length > 1
    && namedRelationArguments.at(0)?.type === 'fact'
    && namedRelationArguments.at(-1)?.type === 'context'
  ) {
    const partialContext = namedRelationCompletion.groups.partial ?? '';
    const matches = await matchingContextCompletions(partialContext, state);
    const relationCompletions = partialContext.includes('/')
      ? matches.map((context) => `/${context.name}`)
      : matches.map((context) => context.folder);

    return [relationCompletions, partialContext];
  }

  const namedContextArgumentCompletion = await matchingNamedContextArgument(line, state);

  if (namedContextArgumentCompletion) {
    return namedContextArgumentCompletion;
  }

  const namedLensCompletion = line.match(/^:(?<commandName>[A-Za-z][A-Za-z0-9_-]*)\s+(?<partial>.*)$/u);
  const namedLensArguments = namedLensCompletion
    ? commandArgumentsForCompletion(namedLensCompletion.groups.commandName, state)
    : null;

  if (namedLensCompletion && namedLensArguments?.at(-1)?.type === 'lens') {
    const partialLens = namedLensCompletion.groups.partial ?? '';
    const matches = lensIds(state.lensRegistry).filter((lensId) => startsWithCaseInsensitive(lensId, partialLens));

    return [matches, partialLens];
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

async function matchingTrailingNamedArgument(line, state) {
  const match = line.match(/^:(?<commandName>[A-Za-z][A-Za-z0-9_-]*)\s+(?<args>.*)$/u);

  if (!match) {
    return null;
  }

  const argumentsDefinition = commandArgumentsForCompletion(match.groups.commandName, state);
  const [itemArgument, trailingArgument] = argumentsDefinition ?? [];

  if (
    argumentsDefinition?.length !== 2
    || itemArgument.type !== 'fact'
    || !['factType', 'date'].includes(trailingArgument.type)
  ) {
    return null;
  }

  const args = match.groups.args ?? '';
  const split = await trailingArgumentSplitForArgs(args, state);

  if (!split) {
    return null;
  }

  const matches = trailingArgumentCompletionValues(trailingArgument, state)
    .filter((value) => startsWithCaseInsensitive(value, split.partialValue));

  return [matches, split.partialValue];
}

async function matchingCancelContextCompletion(line, state) {
  const match = line.match(/^:cancel\s+(?<range>\S+)\s+(?<partial>.*)$/iu);

  if (!match) {
    return null;
  }

  const argumentsDefinition = commandArgumentsForCompletion('cancel', state);

  if (!argumentsDefinition) {
    return null;
  }

  const parsedRange = parseEntry(`:cancel ${match.groups.range} /`, state.commandRegistry).range;

  if (!parsedRange) {
    return null;
  }

  const partialContext = match.groups.partial ?? '';
  const date = timeboxDate(state.now());
  const contexts = await contextsOverlappingTime(state.rootDirectory, {
    date,
    range: parsedRange
  });
  const matches = rankedCompletionMatches(contexts, (context) => contextCompletionMatchRank({
    folder: context.split('/').filter(Boolean).at(-1) ?? '/',
    name: context
  }, partialContext));

  return [matches, partialContext];
}

async function trailingArgumentSplitForArgs(args, state) {
  const trimmedArgs = args.trim();

  if (trimmedArgs.length === 0) {
    return null;
  }

  const facts = await visibleFactsForState(state);

  if (args.endsWith(' ')) {
    return factSelectorIsComplete(trimmedArgs, facts)
      ? { partialValue: '' }
      : null;
  }

  const tokens = trimmedArgs.split(/\s+/u);

  for (let splitIndex = tokens.length - 1; splitIndex >= 1; splitIndex -= 1) {
    const itemValue = tokens.slice(0, splitIndex).join(' ');

    if (factSelectorIsComplete(itemValue, facts)) {
      return {
        partialValue: tokens.slice(splitIndex).join(' ')
      };
    }
  }

  return null;
}

function factSelectorIsComplete(value, facts) {
  return /^[1-9]\d*$/u.test(value)
    || facts.some((fact) => fact.title?.toLowerCase() === value.toLowerCase());
}

function trailingArgumentCompletionValues(argument, state) {
  if (enumCompletableArgument(argument)) {
    return commandArgumentValues(argument, state.commandRegistry);
  }

  if (argument.type === 'date') {
    return dateCompletionValues;
  }

  return [];
}

async function matchingNamedFactArgument(line, state) {
  const argumentCompletion = await matchingFactArgument(line, state);

  if (argumentCompletion?.argument?.type !== 'fact') {
    return null;
  }

  const matches = await matchingFactCompletions(argumentCompletion.partialValue, state);

  return [matches, argumentCompletion.partialValue];
}

async function matchingNamedContextArgument(line, state) {
  const argumentCompletion = matchingNamedArgument(line, state);

  if (argumentCompletion?.argument?.type !== 'context') {
    return null;
  }

  const matches = await matchingContextCompletions(argumentCompletion.partialValue, state);

  return [matches.map((context) => context.name), argumentCompletion.partialValue];
}

function matchingNamedEnumArgument(line, state) {
  const argumentCompletion = matchingNamedArgument(line, state);

  if (!argumentCompletion || !enumCompletableArgument(argumentCompletion.argument)) {
    return null;
  }

  const matches = commandArgumentValues(argumentCompletion.argument, state.commandRegistry)
    .filter((value) => startsWithCaseInsensitive(value, argumentCompletion.partialValue));

  return matches.length > 0 ? [matches, argumentCompletion.partialValue] : null;
}

function matchingNamedArgument(line, state) {
  const match = line.match(/^:(?<commandName>[A-Za-z][A-Za-z0-9_-]*)(?:\s+(?<args>.*))?$/u);

  if (!match) {
    return null;
  }

  const args = match.groups.args ?? '';
  const argumentsDefinition = commandArgumentsForCompletion(match.groups.commandName, state);

  if (!argumentsDefinition || argumentsDefinition.length === 0) {
    return null;
  }

  const tokens = args.length > 0 ? args.split(/\s+/u) : [];
  const argumentIndex = args.endsWith(' ') ? tokens.length : Math.max(tokens.length - 1, 0);
  const argument = argumentsDefinition[argumentIndex];

  if (!argument) {
    return null;
  }

  const partialValue = args.endsWith(' ') ? '' : (tokens.at(-1) ?? '');

  return {
    argument,
    partialValue
  };
}

async function matchingFactArgument(line, state) {
  const match = line.match(/^:(?<commandName>[A-Za-z][A-Za-z0-9_-]*)(?:\s+(?<args>.*))?$/u);

  if (!match) {
    return null;
  }

  const args = match.groups.args ?? '';
  const argumentsDefinition = commandArgumentsForCompletion(match.groups.commandName, state);

  if (!argumentsDefinition || argumentsDefinition.length === 0) {
    return null;
  }

  const factArgumentIndex = argumentsDefinition.findIndex((argument) => argument.type === 'fact');

  if (factArgumentIndex === -1) {
    return null;
  }

  const factArgument = argumentsDefinition[factArgumentIndex];

  if (argumentsDefinition.length === 1 && factArgumentIndex === 0) {
    return {
      argument: factArgument,
      partialValue: args
    };
  }

  if (
    argumentsDefinition.length === 2
    && factArgumentIndex === 0
    && ['factType', 'date'].includes(argumentsDefinition[1].type)
  ) {
    const trailingSplit = await trailingArgumentSplitForArgs(args, state);

    if (trailingSplit) {
      return null;
    }

    return {
      argument: factArgument,
      partialValue: args
    };
  }

  const tokens = args.length > 0 ? args.split(/\s+/u) : [];
  const argumentIndex = args.endsWith(' ') ? tokens.length : Math.max(tokens.length - 1, 0);

  return argumentsDefinition[argumentIndex]?.type === 'fact'
    ? {
      argument: argumentsDefinition[argumentIndex],
      partialValue: args.endsWith(' ') ? '' : (tokens.at(-1) ?? '')
    }
    : null;
}

function enumCompletableArgument(argument) {
  return ['enum', 'factType'].includes(argument?.type) && Boolean(argument.enum);
}

async function matchingFactCompletions(partialTitle, state) {
  const facts = await visibleFactsForState(state);

  const titles = facts
    .map((fact) => fact.title ?? '')
    .filter((title) => title.length > 0)
    .filter((title, index, allTitles) => allTitles.indexOf(title) === index);

  return rankedCompletionMatches(titles, (title) => completionMatchRank(title, partialTitle));
}

async function matchingContextCompletions(partialContext, state) {
  const contexts = await contextIdsForState(state);

  const contextNames = contexts
    .map((contextName) => ({
      folder: contextName.split('/').at(-1) ?? contextName,
      name: contextName
    }));

  return rankedCompletionMatches(contextNames, (contextName) => contextCompletionMatchRank(contextName, partialContext));
}

function contextCompletionMatchRank(contextName, partialContext) {
  const comparableName = contextName.name.startsWith('/')
    ? contextName.name
    : `/${contextName.name}`;

  if (
    partialContext.length === 0
    || startsWithCaseInsensitive(contextName.name, partialContext)
    || startsWithCaseInsensitive(comparableName, partialContext)
    || startsWithCaseInsensitive(contextName.folder, partialContext)
  ) {
    return 0;
  }

  return hasWordStartCaseInsensitive(contextName.name, partialContext)
    || hasWordStartCaseInsensitive(contextName.folder, partialContext)
    ? 1
    : null;
}

function contextReferenceParts(contextReference) {
  return contextReference.split('/').filter((pathPart) => pathPart.length > 0);
}

async function matchingSwitchContextCompletions(partialContext, state) {
  const contexts = await contextIdsForState(state);
  const currentContextId = contextIdForDirectory(state, state.currentContextDirectory);

  if (partialContext.startsWith('/')) {
    const partialId = contextReferenceParts(partialContext).join('/');

    return contexts
      .filter((contextId) => startsWithCaseInsensitive(contextId, partialId))
      .map((contextId) => ({ name: `/${contextId}` }));
  }

  if (partialContext.startsWith('./') || partialContext === '.') {
    const childPartial = partialContext === '.' ? '' : partialContext.slice(2);
    const prefix = currentContextId.length > 0 ? `${currentContextId}/` : '';

    return contexts
      .filter((contextId) => startsWithCaseInsensitive(contextId, `${prefix}${childPartial}`))
      .filter((contextId) => contextId !== currentContextId)
      .map((contextId) => ({ name: `./${contextId.slice(prefix.length)}` }));
  }

  if (partialContext.startsWith('../') || partialContext === '..') {
    const pathParts = partialContext.split('/');
    const partialName = partialContext.endsWith('/') ? '' : pathParts.at(-1);
    const baseReference = partialContext.endsWith('/')
      ? partialContext
      : pathParts.slice(0, -1).join('/');
    const referencePrefix = baseReference.endsWith('/') ? baseReference : `${baseReference}/`;
    const baseId = contextIdForSwitchReference(referencePrefix, state);
    const targetPrefix = [
      ...(baseId.length > 0 ? [baseId] : []),
      ...(partialName ? [partialName] : [])
    ].join('/');

    return contexts
      .filter((contextId) => targetPrefix.length === 0 || startsWithCaseInsensitive(contextId, targetPrefix))
      .filter((contextId) => contextId !== baseId)
      .map((contextId) => ({
        name: `${referencePrefix}${baseId.length === 0 ? contextId : contextId.slice(baseId.length + 1)}`
      }));
  }

  return matchingContextCompletions(partialContext, state);
}

export function createReadlineCompleter(state) {
  return (line) => completeEntry(line, state)
    .catch(() => [[], line]);
}

function clearTemporaryBody(state) {
  state.temporaryBodyLines = null;
  state.temporaryBodyType = null;
  state.temporaryBodyDate = null;
}

function showCommandHelp(state, message = null) {
  state.statusMessage = '';
  state.temporaryBodyLines = [
    ...(message ? [message, ''] : []),
    'Commands:',
    ...commandHelp(state.commandRegistry)
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
  await refreshWorkspaceFact(state, filePath);
}

export async function reloadWorkspaceConfig(state) {
  clearTemplateCache({ rootDirectory: state.rootDirectory });
  state.commandRegistry = await loadCommandRegistry({
    rootDirectory: state.rootDirectory
  });
  state.lensRegistry = await loadLensRegistry({
    rootDirectory: state.rootDirectory
  });
  state.settings = await loadSettings({
    rootDirectory: state.rootDirectory
  });
}

function contextCreationPrompt(contextDirectory) {
  return `Create ${contextDirectory}? [y/N]`;
}

function parseConfirmation(value) {
  const normalizedValue = value.trim().toLowerCase();

  if (['y', 'yes'].includes(normalizedValue)) {
    return true;
  }

  if (['', 'n', 'no'].includes(normalizedValue)) {
    return false;
  }

  return null;
}

function factTypeValuesForState(state) {
  return commandArgumentValues({
    type: 'factType',
    enum: factTypeEnumName
  }, state.commandRegistry);
}

function matchingFactTypeForState(factType, state) {
  return factTypeValuesForState(state)
    .find((value) => value.toLowerCase() === factType.toLowerCase());
}

function factTypeConfirmationPrompt(factType) {
  return `Fact type "${factType}" is not listed. Add it? [y/N]`;
}

async function saveCreatedFact(parsedEntry, state) {
  const savedFact = await createFact(state, {
    title: parsedEntry.title,
    type: parsedEntry.factType ?? 'fact'
  });
  const message = `saved ${savedFact.relativePath}`;
  state.pageStartIndex = 0;
  state.statusMessage = '';
  clearTemporaryBody(state);

  return {
    action: 'continue',
    message
  };
}

async function switchToContextDirectory(contextDirectory, state) {
  state.peekContextDirectory = null;
  state.peekLensId = defaultLensId;
  resetItemNumbers(state);
  changeLens(state, {
    ...currentLens(state),
    currentContextDirectory: contextDirectory
  });

  const contextId = path.relative(state.rootDirectory, state.currentContextDirectory);

  return contextId.length > 0 ? `context ${contextId}` : 'context /';
}

async function handlePendingContextCreation(entry, state) {
  const pendingContextCreation = state.pendingContextCreation;
  state.pendingContextCreation = null;

  const confirmation = parseConfirmation(entry);

  if (confirmation === null) {
    state.pendingContextCreation = pendingContextCreation;
    state.statusMessage = 'please answer yes or no';
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }

  if (!confirmation) {
    state.statusMessage = `context ${pendingContextCreation.context} not created`;
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }

  try {
    await createContext(state, pendingContextCreation.directory);
  } catch (error) {
    state.statusMessage = error.message;
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }

  const message = await switchToContextDirectory(pendingContextCreation.directory, state);

  return {
    action: 'continue',
    message
  };
}

async function handlePendingFactTypeConfirmation(entry, state) {
  const pendingFactTypeConfirmation = state.pendingFactTypeConfirmation;
  state.pendingFactTypeConfirmation = null;

  const confirmation = parseConfirmation(entry);

  if (confirmation === null) {
    state.pendingFactTypeConfirmation = pendingFactTypeConfirmation;
    state.statusMessage = 'please answer yes or no';
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }

  if (!confirmation) {
    state.statusMessage = `fact type ${pendingFactTypeConfirmation.factType} not added`;
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }

  try {
    const factType = await addWorkspaceEnumValue(state, factTypeEnumName, pendingFactTypeConfirmation.factType);

    await reloadWorkspaceConfig(state);

    return saveCreatedFact({
      title: pendingFactTypeConfirmation.title,
      type: 'create_fact',
      factType
    }, state);
  } catch (error) {
    state.statusMessage = error.message;
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }
}

function timeboxContextIdForReference(contextReference, state) {
  const contextId = contextIdForSwitchReference(contextReference, state);

  if (contextId === '') {
    throw new Error('root context cannot be stored as a timebox');
  }

  if (!state.model?.contexts?.has(contextId)) {
    throw new Error(`context ${contextReference} does not exist`);
  }

  return contextId;
}

function timeboxContextLabel(contextId) {
  return contextId === '' ? '/' : `/${contextId}`;
}

function dateForTimeboxCommand(state) {
  return timeboxDate(state.now());
}

async function showPlanner(state) {
  const date = dateForTimeboxCommand(state);

  return refreshPlannerView(state, {
    date,
    resetPage: true,
    statusMessage: `plan ${date}`
  });
}

async function refreshPlannerView(state, options = {}) {
  const date = options.date ?? state.temporaryBodyDate ?? dateForTimeboxCommand(state);

  state.settings ??= await loadSettings({ rootDirectory: state.rootDirectory });
  state.temporaryBodyLines = await plannerLines(state.rootDirectory, date, {
    workday: state.settings.workday
  });
  state.temporaryBodyType = 'plan';
  state.temporaryBodyDate = date;

  if (options.resetPage) {
    state.pageStartIndex = 0;
  }

  state.statusMessage = options.statusMessage ?? `plan ${date}`;

  return {
    action: 'continue',
    message: state.statusMessage
  };
}

async function refreshPlannerViewIfActive(state, statusMessage) {
  if (state.temporaryBodyType !== 'plan') {
    state.statusMessage = '';
    clearTemporaryBody(state);

    return false;
  }

  await refreshPlannerView(state, {
    resetPage: false,
    statusMessage
  });

  return true;
}

function setStatusPreservingPlannerView(state, statusMessage) {
  state.statusMessage = statusMessage;

  if (state.temporaryBodyType !== 'plan') {
    clearTemporaryBody(state);
  }
}

async function planTimebox(parsedEntry, state) {
  try {
    await ensureWorkspaceModel(state);
    const contextId = timeboxContextIdForReference(parsedEntry.context, state);
    const timebox = await appendTimebox(state.rootDirectory, {
      context: timeboxContextLabel(contextId),
      date: dateForTimeboxCommand(state),
      range: parsedEntry.range
    });

    await refreshPlannerViewIfActive(state, `planned ${timebox.start}-${timebox.end} ${timebox.context}`);

    return {
      action: 'continue',
      message: `planned ${timebox.start}-${timebox.end} ${timebox.context}`
    };
  } catch (error) {
    setStatusPreservingPlannerView(state, error.message);

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }
}

function cancellationPrompt(matches) {
  return [
    'Cancel which timebox?',
    ...matches.map((match, index) => `${index + 1}. ${match.start}-${match.end} ${match.context}`)
  ].join(' ');
}

async function cancelPlannedTimebox(parsedEntry, state) {
  try {
    await ensureWorkspaceModel(state);
    const contextId = timeboxContextIdForReference(parsedEntry.context, state);
    const date = dateForTimeboxCommand(state);
    const context = timeboxContextLabel(contextId);
    const result = await cancelTimebox(state.rootDirectory, {
      context,
      date,
      range: parsedEntry.range
    });

    if (result.matches.length === 0) {
      setStatusPreservingPlannerView(state, `no timebox matches ${parsedEntry.range.start}-${parsedEntry.range.end} ${context}`);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    if (result.matches.length > 1) {
      state.pendingTimeboxCancellation = {
        context,
        date,
        range: parsedEntry.range,
        matches: result.matches,
        prompt: cancellationPrompt(result.matches)
      };
      state.statusMessage = state.pendingTimeboxCancellation.prompt;
      setStatusPreservingPlannerView(state, state.pendingTimeboxCancellation.prompt);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    const cancelled = result.cancelled[0];
    const message = `cancelled ${cancelled.start}-${cancelled.end} ${cancelled.context}`;
    await refreshPlannerViewIfActive(state, message);

    return {
      action: 'continue',
      message
    };
  } catch (error) {
    setStatusPreservingPlannerView(state, error.message);

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }
}

async function handlePendingTimeboxCancellation(entry, state) {
  const pendingTimeboxCancellation = state.pendingTimeboxCancellation;
  const choice = Number(entry.trim());

  if (!Number.isInteger(choice) || choice < 1 || choice > pendingTimeboxCancellation.matches.length) {
    state.statusMessage = `choose 1-${pendingTimeboxCancellation.matches.length}`;

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }

  state.pendingTimeboxCancellation = null;

  const chosenTimebox = pendingTimeboxCancellation.matches[choice - 1];
  const result = await cancelTimebox(state.rootDirectory, {
    context: pendingTimeboxCancellation.context,
    date: pendingTimeboxCancellation.date,
    index: chosenTimebox.index,
    range: pendingTimeboxCancellation.range
  });
  const cancelled = result.cancelled[0];
  const message = `cancelled ${cancelled.start}-${cancelled.end} ${cancelled.context}`;
  await refreshPlannerViewIfActive(state, message);

  return {
    action: 'continue',
    message
  };
}

async function switchToCurrentTimebox(state) {
  try {
    await ensureWorkspaceModel(state);
    const now = state.now();
    const context = await resolveContextForTime(state.rootDirectory, {
      date: timeboxDate(now),
      now
    });
    const contextId = context === '/' ? '' : context.replace(/^\/+/u, '');

    if (contextId.length > 0 && !state.model?.contexts?.has(contextId)) {
      throw new Error(`context ${context} does not exist`);
    }

    const message = await switchToContextDirectory(contextDirectoryForId(state, contextId), state);

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

export async function handleEntry(entry, state) {
  if (state.pendingTimeboxCancellation) {
    return handlePendingTimeboxCancellation(entry, state);
  }

  if (state.pendingFactTypeConfirmation) {
    return handlePendingFactTypeConfirmation(entry, state);
  }

  if (state.pendingContextCreation) {
    return handlePendingContextCreation(entry, state);
  }

  const pendingCommand = state.pendingCommand;
  const parsedEntry = pendingCommand
    ? continuePromptedCommand(pendingCommand, entry)
    : parseEntry(entry, state.commandRegistry);
  state.pendingCommand = null;

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
      message: commandHelpText(state.commandRegistry)
    };
  }

  if (parsedEntry.type === 'prompt_command_argument') {
    const promptState = pendingCommandForParsedEntry(parsedEntry, state);

    state.pendingCommand = promptState.pendingCommand;
    state.statusMessage = promptState.prompt;
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message: promptState.prompt
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

  if (parsedEntry.type === 'restart_app') {
    return {
      action: 'restart',
      snapshot: restartSnapshotForState(state)
    };
  }

  if (parsedEntry.type === 'show_plan') {
    return showPlanner(state);
  }

  if (parsedEntry.type === 'plan_timebox') {
    return planTimebox(parsedEntry, state);
  }

  if (parsedEntry.type === 'cancel_timebox') {
    return cancelPlannedTimebox(parsedEntry, state);
  }

  if (parsedEntry.type === 'switch_to_current_timebox') {
    return switchToCurrentTimebox(state);
  }

  if (parsedEntry.type === 'paste_clipboard') {
    let reservedImagePath = null;

    try {
      const timestamp = parsedEntry.timestamp ?? timestampForFilename(state.now());
      const factTitle = parsedEntry.title ?? `Pasted ${timestamp}`;
      const pastedFilenameBase = filenameBaseForTitle(factTitle);
      reservedImagePath = await reserveUniqueFilePath(state.currentContextDirectory, pastedFilenameBase, '.png');
      const clipboardItem = normalizeClipboardItem(await state.readClipboard({ imagePath: reservedImagePath }));
      let pastedFilePath;

      if (clipboardItem?.type === 'file') {
        pastedFilePath = clipboardItem.filePath;
      } else {
        await rm(reservedImagePath, { force: true });
        pastedFilePath = await writeUniqueFile(
          state.currentContextDirectory,
          pastedFilenameBase,
          clipboardItem?.extension ?? '.txt',
          clipboardItem?.contents ?? ''
        );
      }

      const pastedFilename = path.basename(pastedFilePath);
      const pastedAltText = path.parse(pastedFilename).name;
      const fact = await createFact(state, {
        title: factTitle,
        body: clipboardItem?.type === 'file' ? `1. ![${pastedAltText}](${pastedFilename})` : '',
        contextLinks: [],
        relatePeek: false,
        properties: {
          file: pastedFilename
        }
      });
      state.pageStartIndex = 0;
      state.statusMessage = '';
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: `pasted ${path.relative(state.appDirectory, pastedFilePath)} and ${fact.relativePath}`
      };
    } catch (error) {
      if (reservedImagePath) {
        await rm(reservedImagePath, { force: true });
      }

      state.statusMessage = error.message;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }
  }

  if (parsedEntry.type === 'usage_error') {
    if (pendingCommand) {
      state.pendingCommand = pendingCommand;
    }

    state.statusMessage = pendingCommand?.argument?.prompt
      ? `${parsedEntry.message}. ${pendingCommand.argument.prompt}`
      : parsedEntry.message;
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message: state.statusMessage
    };
  }

  if (parsedEntry.type === 'create_fact' && parsedEntry.confirmFactType) {
    const existingFactType = matchingFactTypeForState(parsedEntry.factType, state);

    if (existingFactType) {
      parsedEntry.factType = existingFactType;
    } else {
      state.pendingFactTypeConfirmation = {
        factType: parsedEntry.factType,
        title: parsedEntry.title
      };
      state.statusMessage = factTypeConfirmationPrompt(parsedEntry.factType);
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }
  }

  if (parsedEntry.type === 'switch_context') {
    let nextContextDirectory;

    try {
      nextContextDirectory = await resolveExistingSwitchContextDirectory(parsedEntry.context, state);
    } catch (error) {
      let contextDirectory;

      try {
        contextDirectory = contextDirectoryForSwitchReference(parsedEntry.context, state);
      } catch (contextError) {
        state.statusMessage = contextError.message;
        clearTemporaryBody(state);

        return {
          action: 'continue',
          message: state.statusMessage
        };
      }

      if (contextHasHiddenPathPart(contextDirectory, state)) {
        state.statusMessage = 'context cannot contain hidden folders';
        clearTemporaryBody(state);

        return {
          action: 'continue',
          message: state.statusMessage
        };
      }

      state.pendingContextCreation = {
        context: parsedEntry.context,
        directory: contextDirectory
      };
      state.statusMessage = contextCreationPrompt(contextDirectory);
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    const message = await switchToContextDirectory(nextContextDirectory, state);

    return {
      action: 'continue',
      message
    };
  }

  if (parsedEntry.type === 'clear_peek' || parsedEntry.type === 'clear_gaze') {
    state.peekContextDirectory = null;
    state.peekLensId = defaultLensId;
    resetItemNumbers(state);
    state.statusMessage = '';
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message: 'peek cleared'
    };
  }

  if (parsedEntry.type === 'change_peek' || parsedEntry.type === 'change_gaze') {
    try {
      state.peekContextDirectory = await resolveExistingContextDirectory(parsedEntry.context, state);
    } catch (error) {
      state.statusMessage = error.message;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    const message = `peek ${contextIdForDirectory(state, state.peekContextDirectory)}`;
    state.peekLensId = defaultLensId;
    resetItemNumbers(state);
    state.pageStartIndex = 0;
    state.statusMessage = '';
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message
    };
  }

  if (parsedEntry.type === 'switch_lens') {
    if (!hasLens(parsedEntry.lens, state.lensRegistry)) {
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
      const { fact, itemLabel, itemNumber } = await visibleFactForSelector(state, parsedEntry);
      state.statusMessage = '';
      clearTemporaryBody(state);

      return {
        action: 'edit',
        filePath: fact.path,
        itemLabel,
        itemNumber
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

  if (parsedEntry.type === 'open_reference') {
    try {
      const { filePath, itemLabel } = await openPathForReference(state, parsedEntry);
      await state.openPath(filePath);
      state.statusMessage = '';
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: itemLabel
          ? `opened item ${itemLabel} file`
          : `opened ${path.relative(state.appDirectory, filePath)}`
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
    let itemLabel;

    try {
      const resolvedFact = await visibleFactForSelector(state, parsedEntry);
      itemLabel = resolvedFact.itemLabel;
      const { fact } = resolvedFact;

      await deleteWorkspaceFact(state, fact);
    } catch (error) {
      state.statusMessage = error.message;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    const message = `trashed item ${itemLabel}`;
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
      const { fact, itemLabel } = await visibleFactForSelector(state, parsedEntry);
      const relation = await relateWorkspaceFact(state, fact, parsedEntry.contextReference);

      const message = `related item ${itemLabel} to ${relation}`;
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
      message: `${message}; ${commandHelpText(state.commandRegistry)}`
    };
  }

  if (parsedEntry.type === 'set_fact_type') {
    let itemLabel;

    try {
      const resolvedFact = await visibleFactForSelector(state, parsedEntry);
      itemLabel = resolvedFact.itemLabel;
      const { fact } = resolvedFact;

      await setWorkspaceFactType(state, fact, parsedEntry.factType);
    } catch (error) {
      state.statusMessage = error.message;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    const message = `set item ${itemLabel} type to ${parsedEntry.factType}`;
    state.pageStartIndex = 0;
    state.statusMessage = '';
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message
    };
  }

  if (parsedEntry.type === 'set_fact_property') {
    let itemLabel;

    try {
      const resolvedFact = await visibleFactForSelector(state, parsedEntry);
      itemLabel = resolvedFact.itemLabel;
      const { fact } = resolvedFact;

      await setWorkspaceFactProperty(state, fact, parsedEntry.property, parsedEntry.value);
    } catch (error) {
      state.statusMessage = error.message;
      clearTemporaryBody(state);

      return {
        action: 'continue',
        message: state.statusMessage
      };
    }

    const message = `set item ${itemLabel} ${parsedEntry.property} to ${parsedEntry.value}`;
    state.pageStartIndex = 0;
    state.statusMessage = '';
    clearTemporaryBody(state);

    return {
      action: 'continue',
      message
    };
  }

  return saveCreatedFact(parsedEntry, state);
}

async function main() {
  const rootDirectory = processArgv[2] ? path.resolve(processArgv[2]) : undefined;
  const effectiveRootDirectory = rootDirectory ?? path.join(defaultAppDirectory, 'notes');
  const state = createPromptState({
    rootDirectory,
    commandRegistry: await loadCommandRegistry({
      rootDirectory: effectiveRootDirectory
    }),
    lensRegistry: await loadLensRegistry({
      rootDirectory: effectiveRootDirectory
    }),
    settings: await loadSettings({
      rootDirectory: effectiveRootDirectory
    }),
    model: await loadWorkspaceModel({
      rootDirectory: effectiveRootDirectory
    })
  });
  restorePromptState(state, restartSnapshotFromEnv());
  let body = {
    type: 'facts',
    template: 'facts',
    facts: []
  };
  let editorOpen = false;
  let restartEnv = null;
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
      body,
      rows: terminalRows(),
      columns: terminalColumns(),
      includeAnsi: output.isTTY
    }));
  }

  function redrawPrompt() {
    output.write(renderPromptLine(terminal.line, {
      includeAnsi: output.isTTY,
      state
    }));
  }

  function changePage(direction) {
    const navigation = pageNavigationForBody({
      state,
      body,
      columns: terminalColumns(),
      includeColor: output.isTTY,
      pageStartIndex: state.pageStartIndex ?? 0,
      state,
      templateRootDirectory: state.rootDirectory,
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

    body = await visibleBodyForState(state);
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
  const modelWatcher = watchWorkspaceModel(state.model, {
    onChange: async () => {
      body = await visibleBodyForState(state);

      if (!editorOpen) {
        renderCurrentScreen();
        redrawPrompt();
      }
    },
    onError: (error) => {
      state.statusMessage = error.message;

      if (!editorOpen) {
        renderCurrentScreen();
        redrawPrompt();
      }
    }
  });
  const configWatcher = watchWorkspaceConfig({
    rootDirectory: state.rootDirectory,
    onChange: async () => {
      await reloadWorkspaceConfig(state);
      body = await visibleBodyForState(state);

      if (!editorOpen) {
        renderCurrentScreen();
        redrawPrompt();
      }
    },
    onError: (error) => {
      state.statusMessage = error.message;

      if (!editorOpen) {
        renderCurrentScreen();
        redrawPrompt();
      }
    }
  });

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
      body = await visibleBodyForState(state);
      renderCurrentScreen();

      const entry = await terminal.question(renderQuestionPrompt({
        includeAnsi: output.isTTY,
        state
      }));
      const result = await handleEntry(entry, state);

      if (result.action === 'quit') {
        break;
      }

      if (result.action === 'restart') {
        restartEnv = restartEnvForState(state);
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
          state.statusMessage = `edited item ${result.itemLabel}`;
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
    configWatcher.close();
    modelWatcher.close();
    input.off('keypress', onKeypress);

    if (useAlternateScreen) {
      output.write('\x1b[?1049l');
    }

    terminal.close();
  }

  if (restartEnv) {
    await restartAppProcess({ env: restartEnv });
  }
}

const invokedPath = processArgv[1]
  ? pathToFileURL(path.resolve(processArgv[1])).href
  : null;

if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
