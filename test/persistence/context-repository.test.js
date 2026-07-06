import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { Fact } from "../../src/domain/index.js";
import { FactRepository, ContextRepository, Workspace } from "../../src/persistence/index.js";

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

  it("discovers contexts from fact folders", async () => {
    await new FactRepository({ workspace }).create(new Fact({
      id: "6f2308de-02e9-45db-8ff0-65ac793f4a24",
      content: "Discuss architecture.",
      type: "fact",
      createdAt: "2026-06-30T14:00:00.000Z",
      homeContext: "Architecture Review Board"
    }));

    assert.deepEqual(await new ContextRepository({ workspace }).list(), [
      "Architecture Review Board"
    ]);
  });

  it("discovers empty context directories", async () => {
    await fs.mkdir(path.join(rootPath, "contexts", "Corrine Spell"), { recursive: true });

    assert.deepEqual(await new ContextRepository({ workspace }).list(), [
      "Corrine Spell"
    ]);
  });

  it("migrates legacy root-level context directories into contexts", async () => {
    await fs.mkdir(path.join(rootPath, "Corrine Spell"), { recursive: true });

    assert.deepEqual(await new ContextRepository({ workspace }).list(), [
      "Corrine Spell"
    ]);
    await fs.access(path.join(rootPath, "contexts", "Corrine Spell"));
    await assert.rejects(() => fs.access(path.join(rootPath, "Corrine Spell")));
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
      "Technology Assembly",
      "Technology Assembly/2026-07-08"
    ]);
  });
});
