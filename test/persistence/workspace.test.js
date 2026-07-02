import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { Workspace } from "../../src/persistence/index.js";

describe("Workspace", () => {
  it("builds fact and trash paths from context names", () => {
    const workspace = new Workspace("/tmp/gatherbrain");

    assert.equal(
      workspace.contextDirectory("2026-06-30", "Reading: Team Topologies"),
      path.join("/tmp/gatherbrain", "Reading- Team Topologies")
    );
    assert.equal(
      workspace.trashDirectory("2026-06-30", "Steve"),
      path.join("/tmp/gatherbrain", "Steve", ".trash")
    );
    assert.equal(
      workspace.contextDirectory("2026-07-08", "Technology Assembly/2026-07-08"),
      path.join("/tmp/gatherbrain", "Technology Assembly", "2026-07-08")
    );
    assert.equal(
      workspace.pastePath({ date: "2026-06-30", context: "Steve", fileName: "diagram.png" }),
      path.join("/tmp/gatherbrain", "Steve", "diagram.png")
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
