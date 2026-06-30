import fs from "node:fs/promises";
import path from "node:path";

import { TimeBox } from "../domain/index.js";
import { Workspace } from "../persistence/index.js";
import { TimeBoxTextCodec } from "./time-box-text-codec.js";

export class TimeBoxRepository {
  constructor({ workspace, codec = new TimeBoxTextCodec() }) {
    this.workspace = workspace instanceof Workspace ? workspace : new Workspace(workspace);
    this.codec = codec;
  }

  async save(timeBox) {
    const nextTimeBox = TimeBox.from(timeBox);
    const timeBoxes = await this.listByDate(nextTimeBox.date);
    const index = timeBoxes.findIndex((existing) => existing.id === nextTimeBox.id);

    if (index >= 0) {
      timeBoxes[index] = nextTimeBox;
    } else {
      timeBoxes.push(nextTimeBox);
    }

    await this.writeDate(nextTimeBox.date, timeBoxes);
    return nextTimeBox;
  }

  async delete(timeBox) {
    const target = TimeBox.from(timeBox);
    const timeBoxes = await this.listByDate(target.date);
    const nextTimeBoxes = timeBoxes.filter((existing) => existing.id !== target.id);

    if (nextTimeBoxes.length === timeBoxes.length) {
      throw new Error(`Time box not found: ${target.id}`);
    }

    await this.writeDate(target.date, nextTimeBoxes);
    return target;
  }

  async listByDate(date) {
    const filePath = this.workspace.timeBoxPath(date);

    try {
      return this.codec.parse(date, await fs.readFile(filePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  async queryRange(startDate, endDate) {
    const dates = enumerateDates(startDate, endDate);
    const results = [];

    for (const date of dates) {
      results.push(...await this.listByDate(date));
    }

    return results;
  }

  async writeDate(date, timeBoxes) {
    const filePath = this.workspace.timeBoxPath(date);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, this.codec.serialize(date, timeBoxes), "utf8");
  }
}

function enumerateDates(startDate, endDate) {
  const dates = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}
