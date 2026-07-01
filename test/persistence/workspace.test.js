import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { Workspace } from "../../src/persistence/index.js";

describe("Workspace", () => {
  it("builds fact and trash paths from dates and sessions", () => {
    const workspace = new Workspace("/tmp/gatherbrain");

    assert.equal(
      workspace.sessionDirectory("2026-06-30", "Reading: Team Topologies"),
      path.join("/tmp/gatherbrain", "2026-06-30", "Reading- Team Topologies")
    );
    assert.equal(
      workspace.trashDirectory("2026-06-30", "Steve"),
      path.join("/tmp/gatherbrain", "2026-06-30", "Steve", ".trash")
    );
    assert.equal(
      workspace.pastePath({ date: "2026-06-30", session: "Steve", fileName: "diagram.png" }),
      path.join("/tmp/gatherbrain", "2026-06-30", "Steve", "diagram.png")
    );
  });

  it("builds daily timebox paths", () => {
    const workspace = new Workspace("/tmp/gatherbrain");

    assert.equal(
      workspace.timeBoxPath("2026-06-30"),
      path.join("/tmp/gatherbrain", "timeboxes", "2026-06-30.txt")
    );
  });
});
