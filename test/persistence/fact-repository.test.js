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
    const saved = await repository.read(result.filePath);
    const markdown = await fs.readFile(result.filePath, "utf8");

    assert.equal(saved.content, fact.content);
    assert.equal(saved.homeSession.name, "Architecture Review Board");
    assert.doesNotMatch(markdown, /^home_session:/m);
  });

  it("creates and reads facts under slash-separated session subdirectories", async () => {
    const fact = new Fact({
      id: "a75ee82c-6b89-4676-8cb1-01222f976885",
      content: "Prep the assembly agenda.",
      type: "fact",
      createdAt: "2026-07-08T14:15:23.000Z",
      homeSession: "Technology Assembly/2026-07-08"
    });

    const result = await repository.create(fact);

    assert.equal(
      result.filePath,
      path.join(
        rootPath,
        "Technology Assembly",
        "2026-07-08",
        "a75ee82c-6b89-4676-8cb1-01222f976885-prep-the-assembly-agenda.md"
      )
    );
    assert.equal((await repository.read(result.filePath)).homeSession.name, "Technology Assembly/2026-07-08");
    assert.deepEqual((await repository.list()).map((saved) => saved.homeSession.name), [
      "Technology Assembly/2026-07-08"
    ]);
  });

  it("updates an existing fact file", async () => {
    const fact = buildFact();
    const { filePath } = await repository.create(fact);

    fact.setType("decision");
    await repository.update(filePath, fact);

    const saved = await repository.read(filePath);
    assert.equal(saved.type, "decision");
    assert.equal(saved.homeSession.name, "Architecture Review Board");
  });

  it("derives a fact home session from its containing directory", async () => {
    const filePath = path.join(rootPath, "Steve Ma", "6f2308de-02e9-45db-8ff0-65ac793f4a24-review.md");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `---
id: 6f2308de-02e9-45db-8ff0-65ac793f4a24
type: observation
created: 2026-06-30T14:15:23.000Z
associated_sessions:
due:
file:
---
Mike prefers async architecture reviews.
`, "utf8");

    const saved = await repository.read(filePath);

    assert.equal(saved.homeSession.name, "Steve Ma");
  });

  it("derives a slash-separated home session from nested containing directories", async () => {
    const filePath = path.join(
      rootPath,
      "Technology Assembly",
      "2026-07-08",
      "6f2308de-02e9-45db-8ff0-65ac793f4a24-review.md"
    );
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `---
id: 6f2308de-02e9-45db-8ff0-65ac793f4a24
type: observation
created: 2026-06-30T14:15:23.000Z
associated_sessions:
due: 
file: 
---
Mike prefers async architecture reviews.
`, "utf8");

    const saved = await repository.read(filePath);

    assert.equal(saved.homeSession.name, "Technology Assembly/2026-07-08");
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
