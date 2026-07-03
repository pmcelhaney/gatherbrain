import path from "node:path";

import { Context } from "../domain/index.js";

export class Workspace {
  constructor(rootPath) {
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required");
    }

    this.rootPath = path.resolve(rootPath);
  }

  contextDirectory(_date, context) {
    return path.join(this.rootPath, ...Context.from(context).pathSegments());
  }

  trashDirectory(date, context) {
    return path.join(this.contextDirectory(date, context), ".trash");
  }

  factPath({ date, context, fileName }) {
    if (typeof fileName !== "string" || fileName.trim().length === 0) {
      throw new Error("Fact file name is required");
    }

    return path.join(this.contextDirectory(date, context), fileName);
  }

  pastePath({ date, context, fileName }) {
    if (typeof fileName !== "string" || fileName.trim().length === 0) {
      throw new Error("Paste file name is required");
    }

    return path.join(this.contextDirectory(date, context), fileName);
  }

  appStatePath() {
    return path.join(this.rootPath, ".gatherbrain-state.json");
  }
}

export function normalizeDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Date must use YYYY-MM-DD format");
  }

  return date;
}
