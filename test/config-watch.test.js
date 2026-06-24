import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { watchWorkspaceConfig } from '../src/config-watch.js';

function createFakeWatchFunction(callbacks) {
  return (watchedPath, _options, callback) => {
    callbacks.set(watchedPath, callback);

    return {
      close() {
        callbacks.delete(watchedPath);
      },
      on() {}
    };
  };
}

test('config watcher reloads after workspace config changes', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-config-'));
  const callbacks = new Map();

  try {
    await mkdir(path.join(rootDirectory, '.gatherbrain'), { recursive: true });
    const changed = new Promise((resolve, reject) => {
      const watcher = watchWorkspaceConfig({
        rootDirectory,
        debounceMs: 0,
        watchFunction: createFakeWatchFunction(callbacks),
        onChange() {
          watcher.close();
          resolve();
        },
        onError: reject
      });
    });

    assert.equal(callbacks.has(rootDirectory), true);
    assert.equal(callbacks.has(path.join(rootDirectory, '.gatherbrain')), true);

    callbacks.get(path.join(rootDirectory, '.gatherbrain'))('change', 'lenses.json');
    await changed;
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test('config watcher ignores non-config root events', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-config-'));
  const callbacks = new Map();

  try {
    let changeCount = 0;
    const watcher = watchWorkspaceConfig({
      rootDirectory,
      debounceMs: 0,
      watchFunction: createFakeWatchFunction(callbacks),
      onChange() {
        changeCount += 1;
      }
    });

    callbacks.get(rootDirectory)('rename', 'fact.md');
    await delay(10);
    watcher.close();

    assert.equal(changeCount, 0);
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test('config watcher adds template directory watcher after it is created', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-config-'));
  const callbacks = new Map();
  let watcher;

  try {
    const changed = new Promise((resolve, reject) => {
      watcher = watchWorkspaceConfig({
        rootDirectory,
        debounceMs: 0,
        watchFunction: createFakeWatchFunction(callbacks),
        onChange() {
          resolve();
        },
        onError: reject
      });
    });

    await mkdir(path.join(rootDirectory, '.gatherbrain', 'templates'), { recursive: true });
    callbacks.get(rootDirectory)('rename', '.gatherbrain');
    await changed;

    assert.equal(callbacks.has(path.join(rootDirectory, '.gatherbrain')), true);
    assert.equal(callbacks.has(path.join(rootDirectory, '.gatherbrain', 'templates')), true);

    watcher.close();
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});
