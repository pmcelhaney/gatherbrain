import path from "node:path";
import fs from "node:fs/promises";

import { Context } from "../domain/index.js";

export class Workspace {
  constructor(rootPath) {
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required");
    }

    this.rootPath = path.resolve(rootPath);
  }

  contextsDirectory() {
    return path.join(this.rootPath, "contexts");
  }

  contextDirectory(_date, context) {
    return path.join(this.contextsDirectory(), ...Context.from(context).pathSegments());
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

  async prepare() {
    await fs.mkdir(this.contextsDirectory(), { recursive: true });
    await migrateLegacyContextDirectories({
      rootPath: this.rootPath,
      contextsPath: this.contextsDirectory()
    });
  }
}

export function normalizeDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Date must use YYYY-MM-DD format");
  }

  return date;
}

async function migrateLegacyContextDirectories({ rootPath, contextsPath }) {
  let entries;

  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    if (!isLegacyContextDirectory(entry)) {
      continue;
    }

    const sourcePath = path.join(rootPath, entry.name);
    const targetPath = path.join(contextsPath, entry.name);
    await moveOrMergeDirectory(sourcePath, targetPath);
  }
}

function isLegacyContextDirectory(entry) {
  return entry.isDirectory() && entry.name !== "contexts" && !entry.name.startsWith(".");
}

async function moveOrMergeDirectory(sourcePath, targetPath) {
  try {
    await fs.rename(sourcePath, targetPath);
    return;
  } catch (error) {
    if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") {
      throw error;
    }
  }

  await mergeDirectoryContents(sourcePath, targetPath);
  await fs.rmdir(sourcePath);
}

async function mergeDirectoryContents(sourcePath, targetPath) {
  await fs.mkdir(targetPath, { recursive: true });

  const entries = await fs.readdir(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    const childSourcePath = path.join(sourcePath, entry.name);
    const childTargetPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      await moveOrMergeDirectory(childSourcePath, childTargetPath);
      continue;
    }

    await fs.rename(childSourcePath, childTargetPath);
  }
}
