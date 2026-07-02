import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { PromptController } from "../../src/interaction/index.js";
import { FactRepository, Workspace } from "../../src/persistence/index.js";
import { TimeBoxRepository } from "../../src/planning/index.js";
import { AppMode, AppState } from "../../src/state/index.js";

describe("PromptController", () => {
  let rootPath;
  let state;
  let controller;
  let currentResultSet;
  let generatedIds;
  let editedFiles;

  beforeEach(async () => {
    rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "gatherbrain-capture-"));
    state = new AppState({ currentContext: "Steve" });
    generatedIds = ["5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a"];
    editedFiles = [];
    controller = new PromptController({
      state,
      factRepository: new FactRepository({ workspace: new Workspace(rootPath) }),
      factSource: new FactRepository({ workspace: new Workspace(rootPath) }),
      timeBoxRepository: new TimeBoxRepository({ workspace: new Workspace(rootPath) }),
      clock: () => new Date("2026-06-30T15:45:00.000Z"),
      idGenerator: () => generatedIds.shift() ?? "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
      currentResultSetProvider: () => currentResultSet,
      fileOpener: {
        async editFactFile({ factPath }) {
          editedFiles.push(factPath);
          return factPath;
        }
      }
    });
  });

  afterEach(async () => {
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  it("captures plain input as a fact in the current context", async () => {
    const result = await controller.submit(" Follow up with Steve. ");

    assert.equal(result.action, "capture");
    assert.equal(result.fact.id, "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a");
    assert.equal(result.fact.type, "fact");
    assert.equal(result.fact.content, "Follow up with Steve.");
    assert.equal(result.fact.homeContext.name, "Steve");
    assert.equal(state.currentMode, AppMode.CAPTURE);
    await fs.access(result.filePath);
  });

  it("captures @ tags and leaves possessives as text", async () => {
    const result = await controller.submit("@Steve\\ Ma said @Devin's trial ends.");

    assert.equal(result.fact.content, "@Steve Ma said @Devin's trial ends.");
    assert.deepEqual(result.fact.tags, ["Steve Ma", "Devin"]);
  });

  it("captures natural language dates as ISO dates", async () => {
    const result = await controller.submit("Follow up tomorrow, next Friday, and June 1.");

    assert.equal(
      result.fact.content,
      "Follow up 2026-07-01, 2026-07-03, and 2026-06-01."
    );
  });

  it("captures URL input as a bookmark without storing the URL in the body", async () => {
    const result = await controller.submit("Read the Node docs https://nodejs.org/api/test.html.");
    const markdown = await fs.readFile(result.filePath, "utf8");

    assert.equal(result.fact.type, "bookmark");
    assert.equal(result.fact.content, "Read the Node docs.");
    assert.equal(result.fact.url, "https://nodejs.org/api/test.html");
    assert.match(markdown, /^type: bookmark$/m);
    assert.match(markdown, /^url: https:\/\/nodejs\.org\/api\/test\.html$/m);
    assert.match(markdown, /\nRead the Node docs\.\n$/);
    assert.doesNotMatch(markdown.split("---").at(-1), /https:\/\/nodejs\.org/);
  });

  it("requires a current context before capture", async () => {
    state.restart();

    await assert.rejects(
      () => controller.submit("Cannot capture yet."),
      /current context is required/
    );
  });

  it("classifies non-capture prompts without executing them", async () => {
    await controller.submit("Follow up with Steve.");
    const result = await controller.submit("/Steve");

    assert.equal(result.action, "search");
    assert.equal(result.mode, AppMode.SEARCH);
    assert.equal(result.resultSet.count, 1);
    assert.equal(state.currentMode, AppMode.SEARCH);
  });

  it("uses the current query when search input is empty", async () => {
    await controller.submit("Follow up with Steve.");

    const result = await controller.submit("/");

    assert.equal(result.action, "search");
    assert.equal(result.query, "context:Steve");
    assert.equal(result.resultSet.count, 1);
  });

  it("searches natural language dates through their stored ISO form", async () => {
    await controller.submit("Follow up tomorrow.");

    const result = await controller.submit("/tomorrow");

    assert.equal(result.action, "search");
    assert.equal(result.query, "2026-07-01");
    assert.equal(result.resultSet.count, 1);
  });

  it("expands search shortcuts before normalizing date words", async () => {
    await controller.submit("Follow up with Steve.");
    const search = await controller.submit("/Steve");
    currentResultSet = search.resultSet;
    await controller.submit(". today");

    const result = await controller.submit("//today");

    assert.equal(result.action, "search");
    assert.equal(result.query, "due:2026-06-30");
    assert.equal(result.resultSet.count, 1);
  });

  it("lists all facts for empty search when no query exists", async () => {
    await controller.submit("Follow up with Steve.");
    state.restart();

    const result = await controller.submit("/");

    assert.equal(result.action, "search");
    assert.equal(result.query, "*");
    assert.equal(result.resultSet.count, 1);
  });

  it("executes commands through the interaction layer", async () => {
    const result = await controller.submit(":switch Architecture Review Board");

    assert.equal(result.action, "switch_context");
    assert.equal(state.currentContext.name, "Architecture Review Board");
  });

  it("executes selection actions against visible results", async () => {
    await controller.submit("Follow up with Steve.");
    const search = await controller.submit("/Steve");
    currentResultSet = search.resultSet;

    const result = await controller.submit(". tomorrow");

    assert.equal(result.action, "selection_action");
    const saved = await controller.factRepository.getFactById(
      "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a"
    );
    assert.equal(saved.dueDate, "2026-07-01");
  });

  it("executes selection due dates from natural date phrases", async () => {
    await controller.submit("Follow up with Steve.");
    const search = await controller.submit("/Steve");
    currentResultSet = search.resultSet;

    await controller.submit(". next Friday");

    const saved = await controller.factRepository.getFactById(
      "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a"
    );
    assert.equal(saved.dueDate, "2026-07-03");
  });

  it("edits only the last mentioned fact in a selection command", async () => {
    generatedIds.push("7f32fa70-f4b9-45fb-9ab7-2a48e9573f1b");
    await controller.submit("First follow up.");
    await controller.submit("Second follow up.");
    currentResultSet = {
      factIdForNumber(number) {
        return [
          "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
          "7f32fa70-f4b9-45fb-9ab7-2a48e9573f1b"
        ][number - 1];
      },
      factIdAtVisibleIndex(index) {
        return this.factIdForNumber(index + 1);
      }
    };

    const result = await controller.submit("1 2 edit");

    assert.equal(result.action, "selection_action");
    assert.equal(editedFiles.length, 1);
    assert.match(editedFiles[0], /7f32fa70-f4b9-45fb-9ab7-2a48e9573f1b-second-follow-up\.md$/);
  });

  it("executes plan input by saving a time box", async () => {
    const result = await controller.submit("; 9-10 Steve");

    assert.equal(result.action, "plan");
    assert.equal(result.timeBox.date, "2026-06-30");
    assert.equal(result.message, "planned 09:00-10:00 Steve");
  });

  it("executes plan input with natural language dates", async () => {
    const result = await controller.submit("; June 1 9-10 Steve");

    assert.equal(result.action, "plan");
    assert.equal(result.timeBox.date, "2026-06-01");
  });
});
