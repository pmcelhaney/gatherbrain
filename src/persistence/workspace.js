import path from "node:path";

import { Session } from "../domain/index.js";

export class Workspace {
  constructor(rootPath) {
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required");
    }

    this.rootPath = path.resolve(rootPath);
  }

  dateDirectory(date) {
    return path.join(this.rootPath, normalizeDate(date));
  }

  sessionDirectory(date, session) {
    return path.join(this.dateDirectory(date), Session.from(session).pathSegment());
  }

  trashDirectory(date, session) {
    return path.join(this.sessionDirectory(date, session), ".trash");
  }

  factPath({ date, session, fileName }) {
    if (typeof fileName !== "string" || fileName.trim().length === 0) {
      throw new Error("Fact file name is required");
    }

    return path.join(this.sessionDirectory(date, session), fileName);
  }

  timeBoxPath(date) {
    return path.join(this.rootPath, "timeboxes", `${normalizeDate(date)}.txt`);
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
