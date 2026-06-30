import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Session } from "../../src/domain/index.js";

describe("Session", () => {
  it("normalizes whitespace in names", () => {
    const session = new Session("  Architecture   Review Board  ");

    assert.equal(session.name, "Architecture Review Board");
    assert.equal(session.toString(), "Architecture Review Board");
  });

  it("compares sessions by canonical name", () => {
    const session = new Session("Steve Ma");

    assert.equal(session.equals(" steve   ma "), true);
    assert.equal(session.equals("Counterfact"), false);
  });

  it("provides a filesystem-safe path segment", () => {
    const session = new Session("Reading: Team/Topologies");

    assert.equal(session.pathSegment(), "Reading- Team-Topologies");
  });

  it("rejects empty names", () => {
    assert.throws(() => new Session("   "), /Session name is required/);
  });
});
