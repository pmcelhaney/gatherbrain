import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { TagRepository, Workspace } from "../../src/persistence/index.js";

describe("TagRepository", () => {
  let rootPath;
  let workspace;

  beforeEach(async () => {
    rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "gatherbrain-tags-"));
    workspace = new Workspace(rootPath);
  });

  afterEach(async () => {
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  it("returns no tags when root context directories are absent", async () => {
    assert.deepEqual(await new TagRepository({ workspace }).list(), []);
  });

  it("reads tags from root context directories", async () => {
    await fs.mkdir(path.join(rootPath, "Steve Ma"));
    await fs.mkdir(path.join(rootPath, "Devin"));
    await fs.mkdir(path.join(rootPath, "timeboxes"));
    await fs.mkdir(path.join(rootPath, ".gatherbrain"));

    assert.deepEqual(await new TagRepository({ workspace }).list(), ["Devin", "Steve Ma"]);
  });
});
