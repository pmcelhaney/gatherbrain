import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { Fact, TimeBox } from "../../src/domain/index.js";
import { FactRepository, ContextRepository, Workspace } from "../../src/persistence/index.js";
import { TimeBoxRepository } from "../../src/planning/index.js";

describe("ContextRepository", () => {
  let rootPath;
  let workspace;

  beforeEach(async () => {
    rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "gatherbrain-contexts-"));
    workspace = new Workspace(rootPath);
  });

  afterEach(async () => {
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  it("discovers contexts from fact folders and timebox files", async () => {
    await new FactRepository({ workspace }).create(new Fact({
      id: "6f2308de-02e9-45db-8ff0-65ac793f4a24",
      content: "Discuss architecture.",
      type: "fact",
      createdAt: "2026-06-30T14:00:00.000Z",
      homeContext: "Architecture Review Board"
    }));
    await new TimeBoxRepository({ workspace }).save(new TimeBox({
      id: "reading",
      date: "2026-06-30",
      startsAt: "09:00",
      endsAt: "10:00",
      context: "Reading"
    }));

    assert.deepEqual(await new ContextRepository({ workspace }).list(), [
      "Architecture Review Board",
      "Reading"
    ]);
  });

  it("discovers nested contexts from fact folders", async () => {
    await new FactRepository({ workspace }).create(new Fact({
      id: "a75ee82c-6b89-4676-8cb1-01222f976885",
      content: "Prep the assembly agenda.",
      type: "fact",
      createdAt: "2026-07-08T14:00:00.000Z",
      homeContext: "Technology Assembly/2026-07-08"
    }));

    assert.deepEqual(await new ContextRepository({ workspace }).list(), [
      "Technology Assembly/2026-07-08"
    ]);
  });
});
