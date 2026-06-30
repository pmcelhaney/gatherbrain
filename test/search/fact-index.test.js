import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FactIndex } from "../../src/search/index.js";

describe("FactIndex", () => {
  it("caches repository list calls until invalidated", async () => {
    let calls = 0;
    const repository = {
      async list() {
        calls += 1;
        return [{ id: `fact-${calls}` }];
      }
    };
    const index = new FactIndex(repository);

    assert.deepEqual(await index.list(), [{ id: "fact-1" }]);
    assert.deepEqual(await index.list(), [{ id: "fact-1" }]);
    assert.equal(calls, 1);

    index.invalidate();

    assert.deepEqual(await index.list(), [{ id: "fact-2" }]);
    assert.equal(calls, 2);
  });
});
