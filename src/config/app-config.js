import fs from "node:fs/promises";
import path from "node:path";

import { defaultActionConfig } from "../actions/index.js";

export const DEFAULT_CONFIG_FILE = "gatherbrain.config.json";

export function defaultAppConfig() {
  return {
    defaultFactType: "fact",
    searchShortcuts: defaultSearchShortcutConfig(),
    selectionActions: defaultActionConfig()
  };
}

export function defaultSearchShortcutConfig() {
  return {
    current: "(type:task OR type:inprogress OR type:waiting) AND (due<=today OR NOT due:*)",
    overdue: "due<today",
    today: "due:today"
  };
}

export async function loadAppConfig({
  cwd = process.cwd(),
  configPath = path.join(cwd, DEFAULT_CONFIG_FILE)
} = {}) {
  let rawConfig;

  try {
    rawConfig = JSON.parse(await fs.readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return defaultAppConfig();
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${configPath}: ${error.message}`);
    }

    throw error;
  }

  return mergeAppConfig(defaultAppConfig(), rawConfig);
}

export function mergeAppConfig(baseConfig, userConfig = {}) {
  return {
    ...baseConfig,
    ...userConfig,
    searchShortcuts: {
      ...baseConfig.searchShortcuts,
      ...userConfig.searchShortcuts
    },
    selectionActions: {
      ...baseConfig.selectionActions,
      ...userConfig.selectionActions,
      actions: {
        ...baseConfig.selectionActions.actions,
        ...userConfig.selectionActions?.actions
      }
    }
  };
}
