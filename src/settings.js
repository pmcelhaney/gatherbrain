import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseStoredClockTime } from './timeboxes.js';

const settingsConfigPath = path.join('.gatherbrain', 'settings.json');
const defaultSettingsConfigPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'default-config',
  'settings.json'
);

function readSettingsConfigSync(configFilePath) {
  const config = JSON.parse(readFileSync(configFilePath, 'utf8'));

  if (!config || typeof config.settings !== 'object' || Array.isArray(config.settings)) {
    throw new Error(`${configFilePath} must contain a settings object`);
  }

  return config;
}

function mergeSettings(defaultSettings, localSettings) {
  return {
    ...defaultSettings,
    ...localSettings,
    workday: {
      ...defaultSettings.workday,
      ...localSettings?.workday
    }
  };
}

function normalizeSettings(settings) {
  const workday = settings?.workday ?? {};
  const start = workday.start ?? '08:00';
  const end = workday.end ?? '18:00';
  const startMinutes = parseStoredClockTime(start);
  const endMinutes = parseStoredClockTime(end);

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    throw new Error('settings.workday must contain valid HH:MM start and end values');
  }

  return {
    ...settings,
    workday: {
      start,
      end,
      startMinutes,
      endMinutes
    }
  };
}

export function createSettings(settings = readSettingsConfigSync(defaultSettingsConfigPath).settings) {
  return normalizeSettings(settings);
}

export async function loadSettings(options = {}) {
  const { rootDirectory } = options;
  const defaultSettings = readSettingsConfigSync(defaultSettingsConfigPath).settings;

  if (!rootDirectory) {
    return createSettings(defaultSettings);
  }

  const configFilePath = path.join(rootDirectory, settingsConfigPath);
  let localConfig;

  try {
    localConfig = JSON.parse(await readFile(configFilePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createSettings(defaultSettings);
    }

    throw error;
  }

  if (!localConfig || typeof localConfig.settings !== 'object' || Array.isArray(localConfig.settings)) {
    throw new Error(`${settingsConfigPath} must contain a settings object`);
  }

  return createSettings(mergeSettings(defaultSettings, localConfig.settings));
}
