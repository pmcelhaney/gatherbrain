import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { TimeBox } from "../../src/domain/index.js";
import { Workspace } from "../../src/persistence/index.js";
import { TimeBoxRepository } from "../../src/planning/index.js";

describe("TimeBoxRepository", () => {
  let rootPath;
  let repository;

  beforeEach(async () => {
    rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "gatherbrain-timeboxes-"));
    repository = new TimeBoxRepository({ workspace: new Workspace(rootPath) });
  });

  afterEach(async () => {
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  it("saves time boxes in one text file per date", async () => {
    await repository.save(buildTimeBox("first", "2026-06-30", "09:00", "10:00", "Steve"));
    await repository.save(buildTimeBox("second", "2026-06-30", "11:00", "12:00", "Counterfact"));

    const text = await fs.readFile(
      path.join(rootPath, "timeboxes", "2026-06-30.txt"),
      "utf8"
    );

    assert.equal(text, "09:00-10:00 | Steve | first\n11:00-12:00 | Counterfact | second\n");
  });

  it("loads historical date ranges", async () => {
    await repository.save(buildTimeBox("first", "2026-06-30", "09:00", "10:00", "Steve"));
    await repository.save(buildTimeBox("second", "2026-07-01", "11:00", "12:00", "Counterfact"));

    const timeBoxes = await repository.queryRange("2026-06-30", "2026-07-01");

    assert.deepEqual(timeBoxes.map((timeBox) => timeBox.id), ["first", "second"]);
  });

  it("deletes a time box from its daily file", async () => {
    const first = buildTimeBox("first", "2026-06-30", "09:00", "10:00", "Steve");
    await repository.save(first);
    await repository.save(buildTimeBox("second", "2026-06-30", "11:00", "12:00", "Counterfact"));

    await repository.delete(first);

    const timeBoxes = await repository.listByDate("2026-06-30");
    assert.deepEqual(timeBoxes.map((timeBox) => timeBox.id), ["second"]);
  });
});

function buildTimeBox(id, date, startsAt, endsAt, context) {
  return new TimeBox({ id, date, startsAt, endsAt, context });
}
