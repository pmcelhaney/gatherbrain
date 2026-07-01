import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { Fact } from "../../src/domain/index.js";
import { FactRepository, Workspace } from "../../src/persistence/index.js";

describe("FactRepository", () => {
  let rootPath;
  let repository;

  beforeEach(async () => {
    rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "gatherbrain-facts-"));
    repository = new FactRepository({ workspace: new Workspace(rootPath) });
  });

  afterEach(async () => {
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  it("creates facts under root-level home session directories", async () => {
    const fact = buildFact();

    const result = await repository.create(fact);

    assert.equal(
      result.filePath,
      path.join(
        rootPath,
        "Architecture Review Board",
        "6f2308de-02e9-45db-8ff0-65ac793f4a24-mike-prefers-async-architecture-reviews.md"
      )
    );
    assert.equal(await repository.read(result.filePath).then((saved) => saved.content), fact.content);
  });

  it("updates an existing fact file", async () => {
    const fact = buildFact();
    const { filePath } = await repository.create(fact);

    fact.setType("decision");
    await repository.update(filePath, fact);

    const saved = await repository.read(filePath);
    assert.equal(saved.type, "decision");
  });

  it("lists and looks up active facts by id", async () => {
    const { fact } = await repository.create(buildFact());

    assert.deepEqual((await repository.list()).map((saved) => saved.id), [fact.id]);
    assert.equal((await repository.getFactById(fact.id)).content, fact.content);
  });

  it("saves and trashes facts by id", async () => {
    const { fact } = await repository.create(buildFact());

    fact.setType("waiting");
    await repository.saveFact(fact);
    assert.equal((await repository.getFactById(fact.id)).type, "waiting");

    await repository.trashFact(fact);

    assert.deepEqual(await repository.list(), []);
    await assert.rejects(() => repository.getFactById(fact.id), /Fact not found/);
  });

  it("moves deleted facts into home session trash", async () => {
    const { filePath } = await repository.create(buildFact());

    const result = await repository.trash(filePath);

    assert.equal(path.basename(result.filePath), path.basename(filePath));
    assert.match(result.filePath, /Architecture Review Board\/\.trash/);
    await assert.rejects(() => fs.access(filePath));
    await fs.access(result.filePath);
  });
});

function buildFact() {
  return new Fact({
    id: "6f2308de-02e9-45db-8ff0-65ac793f4a24",
    content: "Mike prefers async architecture reviews.",
    type: "observation",
    createdAt: "2026-06-30T14:15:23.000Z",
    homeSession: "Architecture Review Board",
    associatedSessions: ["Steve"]
  });
}
