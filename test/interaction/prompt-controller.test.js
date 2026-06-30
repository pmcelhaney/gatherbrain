import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { PromptController } from "../../src/interaction/index.js";
import { FactRepository, Workspace } from "../../src/persistence/index.js";
import { AppMode, AppState } from "../../src/state/index.js";

describe("PromptController", () => {
  let rootPath;
  let state;
  let controller;

  beforeEach(async () => {
    rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "gatherbrain-capture-"));
    state = new AppState({ currentSession: "Steve" });
    controller = new PromptController({
      state,
      factRepository: new FactRepository({ workspace: new Workspace(rootPath) }),
      clock: () => new Date("2026-06-30T15:45:00.000Z"),
      idGenerator: () => "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a"
    });
  });

  afterEach(async () => {
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  it("captures plain input as a fact in the current session", async () => {
    const result = await controller.submit(" Follow up with Steve. ");

    assert.equal(result.action, "capture");
    assert.equal(result.fact.id, "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a");
    assert.equal(result.fact.type, "fact");
    assert.equal(result.fact.content, "Follow up with Steve.");
    assert.equal(result.fact.homeSession.name, "Steve");
    assert.equal(state.currentMode, AppMode.CAPTURE);
    await fs.access(result.filePath);
  });

  it("requires a current session before capture", async () => {
    state.restart();

    await assert.rejects(
      () => controller.submit("Cannot capture yet."),
      /current session is required/
    );
  });

  it("classifies non-capture prompts without executing them", async () => {
    const result = await controller.submit("/Steve");

    assert.equal(result.action, "classified");
    assert.equal(result.mode, AppMode.SEARCH);
    assert.equal(state.currentMode, AppMode.SEARCH);
  });

  it("executes commands through the interaction layer", async () => {
    const result = await controller.submit(":switch Architecture Review Board");

    assert.equal(result.action, "switch_session");
    assert.equal(state.currentSession.name, "Architecture Review Board");
  });
});
