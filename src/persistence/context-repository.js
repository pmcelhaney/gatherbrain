import fs from "node:fs/promises";
import path from "node:path";

import { Context } from "../domain/index.js";
import { Workspace } from "./workspace.js";

export class ContextRepository {
  constructor({ workspace }) {
    this.workspace = workspace instanceof Workspace ? workspace : new Workspace(workspace);
  }

  async list() {
    const names = new Map();

    for (const name of await this.listFactContexts()) {
      names.set(Context.canonicalize(name), name);
    }

    return [...names.values()].sort((left, right) => left.localeCompare(right));
  }

  async listFactContexts() {
    return findFactContextNames(this.workspace.rootPath);
  }
}

function isIgnoredWorkspaceDirectory(name) {
  return (
    name === ".trash" ||
    name.startsWith(".")
  );
}

async function findFactContextNames(rootPath) {
  const contexts = new Set();

  async function walk(directory) {
    let entries;

    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        return;
      }

      throw error;
    }

    if (entries.some((entry) => entry.isFile() && entry.name.endsWith(".md"))) {
      const relativeDirectory = path.relative(rootPath, directory);

      if (relativeDirectory) {
        contexts.add(relativeDirectory.split(path.sep).join("/"));
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || isIgnoredWorkspaceDirectory(entry.name)) {
        continue;
      }

      await walk(path.join(directory, entry.name));
    }
  }

  await walk(rootPath);
  return [...contexts];
}
