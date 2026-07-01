import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CompletionService } from "../../src/interaction/index.js";
import { SearchResultSet } from "../../src/search/index.js";

describe("CompletionService", () => {
  it("completes commands", async () => {
    const service = new CompletionService();

    assert.equal(await service.complete(":sw"), ":switch");
    assert.equal(await service.complete(":qu"), ":quit");
  });

  it("completes sessions for switch and session commands", async () => {
    const service = new CompletionService({
      sessionRepository: {
        async list() {
          return ["Architecture Review Board", "Steve"];
        }
      }
    });

    assert.equal(await service.complete(":switch Arch"), ":switch Architecture Review Board");
    assert.equal(await service.complete(":session Ste"), ":session Steve");
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
      sessionRepository: {
        async list() {
          return ["Architecture Review Board"];
        }
      }
    });

    assert.equal(await service.complete("@St"), "@Steve\\ Ma");
    assert.equal(await service.complete("Confirm when @Dev"), "Confirm when @Devin");
    assert.equal(await service.complete("@Architecture"), "@Architecture");
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
