import fs from "node:fs/promises";
import path from "node:path";

import { normalizeTags } from "../domain/index.js";
import { Workspace } from "./workspace.js";

export class TagRepository {
  constructor({ workspace }) {
    this.workspace = workspace instanceof Workspace ? workspace : new Workspace(workspace);
  }

  async list() {
    let text;

    try {
      text = await fs.readFile(path.join(this.workspace.rootPath, "tags.txt"), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    }

    return normalizeTags(text.split(/\r?\n/));
  }
}
