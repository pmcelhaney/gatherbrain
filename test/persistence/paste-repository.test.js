import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { PasteRepository, Workspace } from "../../src/persistence/index.js";

describe("PasteRepository", () => {
  it("writes pasted data into the current session directory", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "gatherbrain-paste-repository-"));
    const repository = new PasteRepository({ workspace: new Workspace(rootPath) });

    const result = await repository.create({
      date: "2026-07-01",
      session: "Architecture Review Board",
      name: "Screenshot: Login Flow",
      clipboardItem: {
        mediaType: "image/png",
        extension: "png",
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47])
      }
    });

    assert.equal(result.fileName, "screenshot-login-flow.png");
    assert.equal(
      result.filePath,
      path.join(rootPath, "Architecture Review Board", "screenshot-login-flow.png")
    );
    assert.deepEqual(await fs.readFile(result.filePath), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    await fs.rm(rootPath, { recursive: true, force: true });
  });

  it("keeps existing paste files by adding a numeric suffix", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "gatherbrain-paste-collision-"));
    const repository = new PasteRepository({ workspace: rootPath });

    await repository.create({
      date: "2026-07-01",
      session: "Steve",
      name: "Clipboard Note",
      clipboardItem: {
        mediaType: "text/plain",
        extension: "txt",
        data: Buffer.from("first")
      }
    });
    const second = await repository.create({
      date: "2026-07-01",
      session: "Steve",
      name: "Clipboard Note",
      clipboardItem: {
        mediaType: "text/plain",
        extension: "txt",
        data: Buffer.from("second")
      }
    });

    assert.equal(second.fileName, "clipboard-note-2.txt");
    assert.equal(await fs.readFile(second.filePath, "utf8"), "second");

    await fs.rm(rootPath, { recursive: true, force: true });
  });
});
