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
        currentSession: data.currentSession ?? null,
        currentQuery: data.currentQuery ?? null
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

  async save(state) {
    const filePath = this.workspace.appStatePath();
    const data = {
      currentSession: state.currentSession?.name ?? null,
      currentQuery: state.currentQuery ?? null
    };

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}
