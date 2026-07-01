import fs from "node:fs/promises";
import path from "node:path";

import { TimeBoxTextCodec } from "../planning/index.js";
import { Session } from "../domain/index.js";
import { Workspace } from "./workspace.js";

export class SessionRepository {
  constructor({ workspace, timeBoxCodec = new TimeBoxTextCodec() }) {
    this.workspace = workspace instanceof Workspace ? workspace : new Workspace(workspace);
    this.timeBoxCodec = timeBoxCodec;
  }

  async list() {
    const names = new Map();

    for (const name of await this.listFactSessions()) {
      names.set(Session.canonicalize(name), name);
    }

    for (const name of await this.listTimeBoxSessions()) {
      names.set(Session.canonicalize(name), name);
    }

    return [...names.values()].sort((left, right) => left.localeCompare(right));
  }

  async listFactSessions() {
    const sessions = [];
    const sessionDirectories = await listDirectories(this.workspace.rootPath);

    for (const sessionDirectory of sessionDirectories) {
      const name = path.basename(sessionDirectory);

      if (!isWorkspaceSessionDirectory(name)) {
        continue;
      }

      sessions.push(name);
    }

    return sessions;
  }

  async listTimeBoxSessions() {
    const timeBoxDirectory = path.join(this.workspace.rootPath, "timeboxes");
    const files = await listFiles(timeBoxDirectory);
    const sessions = [];

    for (const filePath of files) {
      const match = path.basename(filePath).match(/^(\d{4}-\d{2}-\d{2})\.txt$/);

      if (!match) {
        continue;
      }

      const timeBoxes = this.timeBoxCodec.parse(match[1], await fs.readFile(filePath, "utf8"));
      sessions.push(...timeBoxes.map((timeBox) => timeBox.session.name));
    }

    return sessions;
  }
}

function isWorkspaceSessionDirectory(name) {
  return (
    name !== "timeboxes" &&
    name !== ".trash" &&
    !name.startsWith(".") &&
    !/^\d{4}-\d{2}-\d{2}$/.test(name)
  );
}

async function listDirectories(directory) {
  return listEntries(directory, (entry) => entry.isDirectory());
}

async function listFiles(directory) {
  return listEntries(directory, (entry) => entry.isFile());
}

async function listEntries(directory, predicate) {
  let entries;

  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  return entries
    .filter(predicate)
    .map((entry) => path.join(directory, entry.name));
}
