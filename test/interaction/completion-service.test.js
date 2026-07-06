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

  it("completes contexts for @ switches", async () => {
    const service = new CompletionService({
      contextRepository: {
        async list() {
          return ["Architecture Review Board", "Steve"];
        }
      }
    });

    assert.equal(await service.complete("@Arch"), "@Architecture\\ Review\\ Board");
    assert.equal(await service.complete(":context Ste"), ":context Ste");
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
    assert.equal(await service.complete(". -d"), ". -due");
    assert.equal(await service.complete(". ed"), ". edit");
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

  it("completes leading context switches and inline context references", async () => {
    const service = new CompletionService({
      contextRepository: {
        async list() {
          return ["Architecture Review Board", "Devin", "Steve Ma"];
        }
      }
    });

    assert.equal(await service.complete("@St"), "@Steve\\ Ma");
    assert.equal(await service.complete("Confirm when @Dev"), "Confirm when @Devin");
    assert.equal(await service.complete("@Architecture"), "@Architecture\\ Review\\ Board");
    assert.equal(await service.complete(". @Dev"), ". @Devin");
    assert.equal(await service.complete("1 -@St"), "1 -@Steve\\ Ma");
  });

  it("completes associated contexts from facts", async () => {
    const service = new CompletionService({
      contextRepository: {
        async list() {
          return ["AI Enablement"];
        }
      },
      factSource: {
        async list() {
          return [
            {
              homeContext: { name: "AI Enablement" },
              associatedContexts: [{ name: "Corrine Spell" }]
            }
          ];
        }
      }
    });

    assert.equal(await service.complete("@Corr"), "@Corrine\\ Spell");
    assert.equal(await service.complete("Mention @Corr"), "Mention @Corrine\\ Spell");
    assert.equal(await service.complete(". @Corr"), ". @Corrine\\ Spell");
  });

  it("cycles through matching context switch completions", async () => {
    const service = new CompletionService({
      contextRepository: {
        async list() {
          return ["Steve Ma", "Stacy", "Stan"];
        }
      }
    });

    assert.equal(await service.complete("@St"), "@Steve\\ Ma");
    assert.equal(await service.complete("@St", { completionIndex: 1 }), "@Stacy");
    assert.equal(await service.complete("@St", { completionIndex: 2 }), "@Stan");
    assert.equal(await service.complete("@St", { completionIndex: 3 }), "@Steve\\ Ma");
  });

  it("returns matching candidates for richer completion displays", async () => {
    const service = new CompletionService({
      contextRepository: {
        async list() {
          return ["Stephanie Garoza", "Stephanie Smith", "Steve Ma"];
        }
      }
    });

    assert.deepEqual(await service.suggest("@Ste"), {
      input: "@Ste",
      completed: "@Stephanie\\ Garoza",
      candidates: ["@Stephanie\\ Garoza", "@Stephanie\\ Smith", "@Steve\\ Ma"]
    });
    assert.deepEqual(await service.suggest("Ask @Ste"), {
      input: "Ask @Ste",
      completed: "Ask @Stephanie\\ Garoza",
      candidates: ["Ask @Stephanie\\ Garoza", "Ask @Stephanie\\ Smith", "Ask @Steve\\ Ma"]
    });
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
    assert.equal(await service.complete(":CONTEXT arch"), ":CONTEXT arch");
    assert.equal(await service.complete("//CUR"), "//current");
    assert.equal(await service.complete(". INP"), ". inprogress");
  });

  it("does not complete inactive @ text", async () => {
    const service = new CompletionService({
      contextRepository: {
        async list() {
          return ["Devin"];
        }
      }
    });

    assert.equal(await service.complete("@Devin's"), "@Devin's");
    assert.equal(await service.complete("@Devin trial"), "@Devin trial");
  });
});
