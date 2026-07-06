import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { AppStateRepository, Workspace } from "../../src/persistence/index.js";
import { AppState } from "../../src/state/index.js";

describe("AppStateRepository", () => {
  let rootPath;
  let repository;

  beforeEach(async () => {
    rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "gatherbrain-app-state-"));
    repository = new AppStateRepository({ workspace: new Workspace(rootPath) });
  });

  afterEach(async () => {
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  it("returns null when no state has been saved", async () => {
    assert.equal(await repository.load(), null);
  });

  it("saves and loads resumable app state", async () => {
    const state = new AppState({ currentContext: "Steve" });
    state.setQuery("type:task");

    await repository.save(state, {
      recentContexts: ["Steve", "Architecture Review Board", "  Steve  ", "", 42]
    });

    assert.deepEqual(await repository.load(), {
      currentContext: "Steve",
      recentContexts: ["Steve", "Architecture Review Board"]
    });
  });

  it("loads legacy session state as context state", async () => {
    await fs.writeFile(
      new Workspace(rootPath).appStatePath(),
      `${JSON.stringify({
        currentSession: "Architecture Review Board",
        currentQuery: "session:Architecture Review Board"
      })}\n`,
      "utf8"
    );

    assert.deepEqual(await repository.load(), {
      currentContext: "Architecture Review Board",
      recentContexts: []
    });
  });

  it("loads legacy recent sessions as recent contexts", async () => {
    await fs.writeFile(
      new Workspace(rootPath).appStatePath(),
      `${JSON.stringify({
        currentSession: "Architecture Review Board",
        recentSessions: ["Architecture Review Board", "Steve"]
      })}\n`,
      "utf8"
    );

    assert.deepEqual(await repository.load(), {
      currentContext: "Architecture Review Board",
      recentContexts: ["Architecture Review Board", "Steve"]
    });
  });
});
