import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SearchQueryParser } from "../../src/search/index.js";

describe("SearchQueryParser", () => {
  const parser = new SearchQueryParser();

  it("parses adjacent terms as implicit AND", () => {
    assert.deepEqual(parser.parse("/Steve Ma"), {
      type: "and",
      left: { type: "term", value: "Steve" },
      right: { type: "term", value: "Ma" }
    });
  });

  it("parses quoted phrases and field filters", () => {
    assert.deepEqual(parser.parse('/due:today AND "Steve Ma"'), {
      type: "and",
      left: { type: "field", field: "due", operator: ":", value: "today" },
      right: { type: "term", value: "Steve Ma" }
    });
  });

  it("parses quoted spaced field values", () => {
    assert.deepEqual(parser.parse('/context:"Architecture Review Board"'), {
      type: "field",
      field: "context",
      operator: ":",
      value: "Architecture Review Board"
    });
  });

  it("parses unquoted spaced context field values", () => {
    assert.deepEqual(parser.parse("/context:Architecture Review Board"), {
      type: "field",
      field: "context",
      operator: ":",
      value: "Architecture Review Board"
    });
  });

  it("parses escaped spaces in field values", () => {
    assert.deepEqual(parser.parse("/context:Project\\ Sapphire"), {
      type: "field",
      field: "context",
      operator: ":",
      value: "Project Sapphire"
    });
  });

  it("parses unquoted spaced tag field values", () => {
    assert.deepEqual(parser.parse("/tag:Steve Ma"), {
      type: "field",
      field: "tag",
      operator: ":",
      value: "Steve Ma"
    });
  });

  it("parses @ context shorthand", () => {
    assert.deepEqual(parser.parse("/@Architecture Review Board"), {
      type: "field",
      field: "context",
      operator: ":",
      value: "Architecture Review Board"
    });
  });

  it("parses legacy session filters as context filters", () => {
    assert.deepEqual(parser.parse("/session:Architecture Review Board"), {
      type: "field",
      field: "context",
      operator: ":",
      value: "Architecture Review Board"
    });
  });

  it("honors NOT before AND before OR", () => {
    assert.deepEqual(parser.parse("alpha OR NOT beta AND gamma"), {
      type: "or",
      left: { type: "term", value: "alpha" },
      right: {
        type: "and",
        left: { type: "not", expression: { type: "term", value: "beta" } },
        right: { type: "term", value: "gamma" }
      }
    });
  });
});
