import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CompletionService } from "../../src/interaction/index.js";
import { SearchResultSet } from "../../src/search/index.js";

describe("CompletionService", () => {
  it("completes commands", async () => {
    const service = new CompletionService();

    assert.equal(await service.complete(":s"), ":s");
    assert.equal(await service.complete(":sw"), ":sw");
    assert.equal(await service.complete(":qu"), ":quit");
  });

  it("completes contexts for @ switches and context commands", async () => {
    const service = new CompletionService({
      contextRepository: {
        async list() {
          return ["Architecture Review Board", "Steve"];
        }
      }
    });

    assert.equal(await service.complete("@Arch"), "@Architecture\\ Review\\ Board");
    assert.equal(await service.complete(":context Ste"), ":context Steve");
  });

  it("does not complete removed switch command shorthands", async () => {
    const service = new CompletionService({
      contextRepository: {
        async list() {
          return ["Architecture Review Board", "Steve"];
        }
      }
    });

    assert.equal(await service.complete(":s St"), ":s St");
    assert.equal(await service.complete(":sw St"), ":sw St");
  });

  it("completes search shortcuts", async () => {
    const service = new CompletionService();

    assert.equal(await service.complete("//cur"), "//current");
  });

  it("completes selection actions", async () => {
    const service = new CompletionService();

    assert.equal(await service.complete(". aba"), ". abandoned");
    assert.equal(await service.complete(". inp"), ". inprogress");
    assert.equal(await service.complete(". toda"), ". today");
    assert.equal(await service.complete(". tom"), ". tomorrow");
    assert.equal(await service.complete(". ed"), ". edit");
  });

  it("completes dynamic @ selection actions from known tags", async () => {
    const service = new CompletionService({
      factSource: {
        async list() {
          return [
            { tags: ["Steve Ma", "Devin"] }
          ];
        }
      }
    });

    assert.equal(await service.complete(". @"), ". @Devin");
    assert.equal(await service.complete(". @", { completionIndex: 1 }), ". @Steve\\ Ma");
    assert.equal(await service.complete(". @St"), ". @Steve\\ Ma");
    assert.equal(await service.complete("1 @St"), "1 @Steve\\ Ma");
  });

  it("completes visible selectors", async () => {
    const service = new CompletionService();
    const resultSet = new SearchResultSet([
      { id: "a" },
      { id: "b" },
      { id: "c" }
    ]);

    assert.equal(await service.complete("3", { resultSet }), "3");
  });

  it("completes capture tags from saved fact tags", async () => {
    const service = new CompletionService({
      factSource: {
        async list() {
          return [
            { tags: ["Steve Ma", "Devin"] }
          ];
        }
      },
      contextRepository: {
        async list() {
          return ["Architecture Review Board"];
        }
      }
    });

    assert.equal(await service.complete("@St"), "@Steve\\ Ma");
    assert.equal(await service.complete("Confirm when @Dev"), "Confirm when @Devin");
    assert.equal(await service.complete("@Architecture"), "@Architecture\\ Review\\ Board");
  });

  it("cycles through matching capture tag completions", async () => {
    const service = new CompletionService({
      factSource: {
        async list() {
          return [
            { tags: ["Steve Ma", "Stacy", "Stan"] }
          ];
        }
      }
    });

    assert.equal(await service.complete("@St"), "@Stacy");
    assert.equal(await service.complete("@St", { completionIndex: 1 }), "@Stan");
    assert.equal(await service.complete("@St", { completionIndex: 2 }), "@Steve\\ Ma");
    assert.equal(await service.complete("@St", { completionIndex: 3 }), "@Stacy");
  });

  it("returns matching candidates for richer completion displays", async () => {
    const service = new CompletionService({
      factSource: {
        async list() {
          return [
            { tags: ["Stephanie Garoza", "Stephanie Smith", "Steve Ma"] }
          ];
        }
      }
    });

    assert.deepEqual(await service.suggest("@Ste"), {
      input: "@Ste",
      completed: "@Stephanie\\ Garoza",
      candidates: ["@Stephanie\\ Garoza", "@Stephanie\\ Smith", "@Steve\\ Ma"]
    });
  });

  it("completes capture tags from root context directory tags", async () => {
    const service = new CompletionService({
      tagRepository: {
        async list() {
          return ["Aamir Muhammad", "cognition"];
        }
      },
      factSource: {
        async list() {
          return [];
        }
      }
    });

    assert.equal(await service.complete("@Aam"), "@Aamir\\ Muhammad");
    assert.equal(await service.complete("@aam"), "@Aamir\\ Muhammad");
    assert.equal(await service.complete("@cog"), "@cognition");
    assert.equal(await service.complete("@COG"), "@cognition");
  });

  it("matches completion prefixes case-insensitively", async () => {
    const service = new CompletionService({
      contextRepository: {
        async list() {
          return ["Architecture Review Board"];
        }
      }
    });

    assert.equal(await service.complete(":SW"), ":SW");
    assert.equal(await service.complete("@arch"), "@Architecture\\ Review\\ Board");
    assert.equal(await service.complete(":SWITCH arch"), ":SWITCH arch");
    assert.equal(await service.complete(":CONTEXT arch"), ":context Architecture Review Board");
    assert.equal(await service.complete("//CUR"), "//current");
    assert.equal(await service.complete(". INP"), ". inprogress");
  });

  it("does not complete inactive tag text", async () => {
    const service = new CompletionService({
      factSource: {
        async list() {
          return [
            { tags: ["Devin"] }
          ];
        }
      }
    });

    assert.equal(await service.complete("@Devin's"), "@Devin's");
    assert.equal(await service.complete("@Devin trial"), "@Devin trial");
  });
});
