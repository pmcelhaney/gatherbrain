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

  it("returns no workspace tags when tags.txt is absent", async () => {
    assert.deepEqual(await new TagRepository({ workspace }).list(), []);
  });

  it("reads newline-delimited workspace tags", async () => {
    await fs.writeFile(
      path.join(rootPath, "tags.txt"),
      "Steve Ma\n\nDevin\n devin \n",
      "utf8"
    );

    assert.deepEqual(await new TagRepository({ workspace }).list(), ["Steve Ma", "Devin"]);
  });
});
