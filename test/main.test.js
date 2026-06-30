import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

describe("main", () => {
  it("renders the app once for smoke testing", () => {
    const result = spawnSync("node", ["src/main.js", "--render-once"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Session: \(none\)/);
    assert.match(result.stdout, /Mode: Command/);
  });
});
