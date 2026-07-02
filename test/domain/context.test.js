import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Context } from "../../src/domain/index.js";

describe("Context", () => {
  it("normalizes whitespace in names", () => {
    const context = new Context("  Architecture   Review Board  ");

    assert.equal(context.name, "Architecture Review Board");
    assert.equal(context.toString(), "Architecture Review Board");
  });

  it("normalizes shell-style escaped whitespace in names", () => {
    const context = new Context("Steve\\ Ma");

    assert.equal(context.name, "Steve Ma");
    assert.equal(context.pathSegment(), "Steve Ma");
  });

  it("normalizes slash-separated context hierarchies", () => {
    const context = new Context("  Technology Assembly / 2026-07-08  ");

    assert.equal(context.name, "Technology Assembly/2026-07-08");
    assert.deepEqual(context.pathSegments(), ["Technology Assembly", "2026-07-08"]);
  });

  it("compares contexts by canonical name", () => {
    const context = new Context("Steve Ma");

    assert.equal(context.equals(" steve   ma "), true);
    assert.equal(context.equals("steve\\ ma"), true);
    assert.equal(context.equals("Counterfact"), false);
  });

  it("provides a filesystem-safe path segment", () => {
    const context = new Context("Reading: Team/Topologies");

    assert.equal(context.pathSegment(), "Reading- Team/Topologies");
    assert.deepEqual(new Context("../Escape").pathSegments(), ["-", "Escape"]);
  });

  it("rejects empty names", () => {
    assert.throws(() => new Context("   "), /Context name is required/);
    assert.throws(() => new Context(" / "), /Context name is required/);
  });
});
