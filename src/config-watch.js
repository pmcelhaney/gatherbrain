import { existsSync, watch } from 'node:fs';
import path from 'node:path';

const configDirectoryName = '.gatherbrain';
const templateDirectoryName = 'templates';

function configEventAffectsWorkspace(filename) {
  if (filename === null || filename === undefined) {
    return true;
  }

  const workspacePath = String(filename).split(path.sep).join('/');

  return workspacePath === configDirectoryName
    || workspacePath.startsWith(`${configDirectoryName}/`);
}

export function watchWorkspaceConfig(options = {}) {
  const {
    rootDirectory,
    debounceMs = 50,
    onChange = () => {},
    onError = () => {},
    watchFunction = watch
  } = options;

  if (!rootDirectory) {
    throw new Error('rootDirectory is required');
  }

  const rootPath = path.resolve(rootDirectory);
  const configPath = path.join(rootPath, configDirectoryName);
  const templatePath = path.join(configPath, templateDirectoryName);
  const watchers = new Map();
  let closed = false;
  let changeTimer = null;
  let reloading = false;
  let reloadAgain = false;

  function closeWatchers() {
    for (const watcher of watchers.values()) {
      watcher.close();
    }

    watchers.clear();
  }

  function addWatcher(watchPath, eventFilter) {
    if (!existsSync(watchPath) || watchers.has(watchPath)) {
      return;
    }

    try {
      const watcher = watchFunction(
        watchPath,
        { persistent: false },
        (_eventType, filename) => {
          if (closed || !eventFilter(filename)) {
            return;
          }

          scheduleReload();
        }
      );

      watcher.on?.('error', (error) => {
        if (!closed) {
          onError(error);
        }
      });
      watchers.set(watchPath, watcher);
    } catch (error) {
      onError(error);
    }
  }

  function watchConfigPaths() {
    closeWatchers();
    addWatcher(rootPath, configEventAffectsWorkspace);
    addWatcher(configPath, () => true);
    addWatcher(templatePath, () => true);
  }

  async function reloadConfig() {
    if (closed) {
      return;
    }

    if (reloading) {
      reloadAgain = true;
      return;
    }

    reloading = true;

    try {
      do {
        reloadAgain = false;

        if (closed) {
          return;
        }

        watchConfigPaths();
        await onChange();
      } while (reloadAgain && !closed);
    } catch (error) {
      onError(error);
    } finally {
      reloading = false;
    }
  }

  function scheduleReload() {
    if (changeTimer) {
      clearTimeout(changeTimer);
    }

    changeTimer = setTimeout(() => {
      changeTimer = null;
      void reloadConfig();
    }, debounceMs);
  }

  watchConfigPaths();

  return {
    close() {
      closed = true;

      if (changeTimer) {
        clearTimeout(changeTimer);
        changeTimer = null;
      }

      closeWatchers();
    },
    reloadNow: reloadConfig
  };
}
