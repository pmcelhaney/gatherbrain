import fs from "node:fs/promises";

import { normalizeTags } from "../domain/index.js";
import { Workspace } from "./workspace.js";

export class TagRepository {
  constructor({ workspace }) {
    this.workspace = workspace instanceof Workspace ? workspace : new Workspace(workspace);
  }

  async list() {
    const tags = [];
    let entries;

    try {
      entries = await fs.readdir(this.workspace.rootPath, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && isWorkspaceTagDirectory(entry.name)) {
        tags.push(entry.name);
      }
    }

    return normalizeTags(tags).sort((left, right) => left.localeCompare(right, "en-US"));
  }
}

function isWorkspaceTagDirectory(name) {
  return (
    name !== "timeboxes" &&
    name !== ".trash" &&
    !name.startsWith(".") &&
    !/^\d{4}-\d{2}-\d{2}$/.test(name)
  );
}
