import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Selection } from "../../src/state/index.js";

describe("Selection", () => {
  it("deduplicates fact ids while preserving order", () => {
    const selection = new Selection(["a", "b", "a"]);

    assert.deepEqual(selection.toArray(), ["a", "b"]);
    assert.equal(selection.includes("b"), true);
  });

  it("resolves number and dot selectors through a result set", () => {
    const resultSet = {
      factIdForNumber(number) {
        return new Map([[7, "uuid-7"]]).get(number);
      },
      factIdAtVisibleIndex(index) {
        return ["uuid-first", "uuid-second"][index];
      }
    };

    const selection = Selection.resolve(["7", ".", ".."], resultSet);

    assert.deepEqual(selection.toArray(), ["uuid-7", "uuid-first", "uuid-second"]);
  });

  it("rejects unknown selector forms", () => {
    assert.throws(
      () => Selection.resolve(["abc"], {}),
      /Unsupported selector/
    );
  });
});
