import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Fact } from "../../src/domain/index.js";
import { SearchEngine, SearchQueryParser } from "../../src/search/index.js";

describe("SearchEngine", () => {
  const parser = new SearchQueryParser();
  const engine = new SearchEngine();

  it("searches terms and session filters", () => {
    const result = engine.search(
      facts(),
      parser.parse('/session:"Architecture Review Board" AND "async architecture"')
    );

    assert.deepEqual(result.facts.map((fact) => fact.id), [
      "6f2308de-02e9-45db-8ff0-65ac793f4a24"
    ]);
    assert.equal(result.factIdForNumber(1), "6f2308de-02e9-45db-8ff0-65ac793f4a24");
  });

  it("supports due comparisons with dynamic today", () => {
    const result = engine.search(
      facts(),
      parser.parse("(type:todo OR type:waiting) AND due<=today"),
      { today: "2026-06-30" }
    );

    assert.deepEqual(result.facts.map((fact) => fact.id), [
      "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a"
    ]);
  });

  it("orders search results newest first", () => {
    const result = engine.search(facts(), { type: "all" });

    assert.deepEqual(result.facts.map((fact) => fact.id), [
      "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
      "6f2308de-02e9-45db-8ff0-65ac793f4a24",
      "a75ee82c-6b89-4676-8cb1-01222f976885"
    ]);
    assert.equal(result.factIdForNumber(1), "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a");
  });

  it("searches sessions through shorthand parser forms", () => {
    const unquoted = engine.search(
      facts(),
      parser.parse("/session:Architecture Review Board")
    );
    const shorthand = engine.search(
      facts(),
      parser.parse("/@Architecture Review Board")
    );

    assert.deepEqual(unquoted.facts.map((fact) => fact.id), [
      "6f2308de-02e9-45db-8ff0-65ac793f4a24"
    ]);
    assert.deepEqual(shorthand.facts.map((fact) => fact.id), [
      "6f2308de-02e9-45db-8ff0-65ac793f4a24"
    ]);
  });

  it("searches slash-separated session names", () => {
    const result = engine.search(
      facts(),
      parser.parse("/session:Technology Assembly/2026-07-08")
    );

    assert.deepEqual(result.facts.map((fact) => fact.id), [
      "a75ee82c-6b89-4676-8cb1-01222f976885"
    ]);
  });

  it("searches tags through terms and tag filters", () => {
    const term = engine.search(facts(), parser.parse("/Devin"));
    const tag = engine.search(facts(), parser.parse("/tag:Steve Ma"));

    assert.deepEqual(term.facts.map((fact) => fact.id), [
      "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a"
    ]);
    assert.deepEqual(tag.facts.map((fact) => fact.id), [
      "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a"
    ]);
  });
});

function facts() {
  return [
    new Fact({
      id: "6f2308de-02e9-45db-8ff0-65ac793f4a24",
      content: "Mike prefers async architecture reviews.",
      type: "observation",
      createdAt: "2026-06-30T14:15:23.000Z",
      homeSession: "Architecture Review Board",
      associatedSessions: ["Steve"]
    }),
    new Fact({
      id: "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
      content: "Follow up with Steve.",
      type: "todo",
      createdAt: "2026-06-30T15:45:00.000Z",
      dueDate: "2026-06-30",
      homeSession: "Steve",
      tags: ["Devin", "Steve Ma"]
    }),
    new Fact({
      id: "a75ee82c-6b89-4676-8cb1-01222f976885",
      content: "Prep the assembly agenda.",
      type: "fact",
      createdAt: "2026-06-30T13:00:00.000Z",
      homeSession: "Technology Assembly/2026-07-08"
    })
  ];
}
