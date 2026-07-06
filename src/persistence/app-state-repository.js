import fs from "node:fs/promises";
import path from "node:path";

import { Workspace } from "./workspace.js";

export class AppStateRepository {
  constructor({ workspace }) {
    this.workspace = workspace instanceof Workspace ? workspace : new Workspace(workspace);
  }

  async load() {
    try {
      const data = JSON.parse(await fs.readFile(this.workspace.appStatePath(), "utf8"));

      return {
        currentContext: data.currentContext ?? data.currentSession ?? null,
        recentContexts: normalizeRecentContexts(data.recentContexts ?? data.recentSessions)
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }

      if (error instanceof SyntaxError) {
        throw new Error(`Invalid app state file: ${error.message}`);
      }

      throw error;
    }
  }

  async save(state, { recentContexts = [] } = {}) {
    const filePath = this.workspace.appStatePath();
    const data = {
      currentContext: state.currentContext?.name ?? null,
      recentContexts: normalizeRecentContexts(recentContexts)
    };

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}

function normalizeRecentContexts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const contexts = [];

  for (const contextName of value) {
    if (typeof contextName !== "string") {
      continue;
    }

    const normalizedName = contextName.trim().replace(/\s+/g, " ");
    const canonicalName = normalizedName.toLowerCase();

    if (!normalizedName || seen.has(canonicalName)) {
      continue;
    }

    seen.add(canonicalName);
    contexts.push(normalizedName);
  }

  return contexts;
}
