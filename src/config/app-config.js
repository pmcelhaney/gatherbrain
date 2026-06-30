import fs from "node:fs/promises";
import path from "node:path";

import { defaultActionConfig } from "../actions/index.js";

export const DEFAULT_CONFIG_FILE = "gatherbrain.config.json";

export function defaultAppConfig() {
  return {
    defaultFactType: "fact",
    selectionActions: defaultActionConfig()
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
