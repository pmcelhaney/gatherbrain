import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Session } from "../../src/domain/index.js";

describe("Session", () => {
  it("normalizes whitespace in names", () => {
    const session = new Session("  Architecture   Review Board  ");

    assert.equal(session.name, "Architecture Review Board");
    assert.equal(session.toString(), "Architecture Review Board");
  });

  it("normalizes shell-style escaped whitespace in names", () => {
    const session = new Session("Steve\\ Ma");

    assert.equal(session.name, "Steve Ma");
    assert.equal(session.pathSegment(), "Steve Ma");
  });

  it("normalizes slash-separated session hierarchies", () => {
    const session = new Session("  Technology Assembly / 2026-07-08  ");

    assert.equal(session.name, "Technology Assembly/2026-07-08");
    assert.deepEqual(session.pathSegments(), ["Technology Assembly", "2026-07-08"]);
  });

  it("compares sessions by canonical name", () => {
    const session = new Session("Steve Ma");

    assert.equal(session.equals(" steve   ma "), true);
    assert.equal(session.equals("steve\\ ma"), true);
    assert.equal(session.equals("Counterfact"), false);
  });

  it("provides a filesystem-safe path segment", () => {
    const session = new Session("Reading: Team/Topologies");

    assert.equal(session.pathSegment(), "Reading- Team/Topologies");
    assert.deepEqual(new Session("../Escape").pathSegments(), ["-", "Escape"]);
  });

  it("rejects empty names", () => {
    assert.throws(() => new Session("   "), /Session name is required/);
    assert.throws(() => new Session(" / "), /Session name is required/);
  });
});
