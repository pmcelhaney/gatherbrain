import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Fact } from "../../src/domain/index.js";
import { SearchEngine, SearchQueryParser } from "../../src/search/index.js";

describe("SearchEngine", () => {
  const parser = new SearchQueryParser();
  const engine = new SearchEngine();

  it("searches terms and context filters", () => {
    const result = engine.search(
      facts(),
      parser.parse('/context:"Architecture Review Board" AND "async architecture"')
    );

    assert.deepEqual(result.facts.map((fact) => fact.id), [
      "6f2308de-02e9-45db-8ff0-65ac793f4a24"
    ]);
    assert.equal(result.factIdForNumber(1), "6f2308de-02e9-45db-8ff0-65ac793f4a24");
  });

  it("supports due comparisons with dynamic today", () => {
    const result = engine.search(
      facts(),
      parser.parse("(type:task OR type:waiting) AND due<=today"),
      { today: "2026-06-30" }
    );

    assert.deepEqual(result.facts.map((fact) => fact.id), [
      "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a"
    ]);
  });

  it("supports current-task searches with undated active tasks", () => {
    const result = engine.search(
      currentShortcutFacts(),
      parser.parse("(type:task OR type:inprogress OR type:waiting) AND (due<=today OR NOT due:*)"),
      { today: "2026-06-30" }
    );

    assert.deepEqual(result.facts.map((fact) => fact.id), [
      "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
      "9c402d1d-fd46-4200-9e75-cbcdd7a57abc"
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

  it("orders current-context matches before other context matches", () => {
    const result = engine.search(facts(), { type: "all" }, {
      currentContext: "Technology Assembly/2026-07-08"
    });

    assert.deepEqual(result.facts.map((fact) => fact.id), [
      "a75ee82c-6b89-4676-8cb1-01222f976885",
      "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
      "6f2308de-02e9-45db-8ff0-65ac793f4a24"
    ]);
    assert.equal(result.factIdForNumber(1), "a75ee82c-6b89-4676-8cb1-01222f976885");
  });

  it("does not prioritize facts only associated with the current context", () => {
    const result = engine.search([
      new Fact({
        id: "11111111-1111-4111-8111-111111111111",
        content: "Home fact",
        type: "fact",
        createdAt: "2026-06-30T10:00:00.000Z",
        homeContext: "Steve"
      }),
      new Fact({
        id: "22222222-2222-4222-8222-222222222222",
        content: "Other context fact",
        type: "fact",
        createdAt: "2026-06-30T09:00:00.000Z",
        homeContext: "Architecture Review Board"
      }),
      new Fact({
        id: "33333333-3333-4333-8333-333333333333",
        content: "Associated context fact",
        type: "fact",
        createdAt: "2026-06-30T08:00:00.000Z",
        homeContext: "Enterprise Architecture",
        associatedContexts: ["Steve"]
      })
    ], { type: "all" }, {
      currentContext: "Steve"
    });

    assert.deepEqual(result.facts.map((fact) => fact.id), [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333"
    ]);
    assert.equal(result.factIdForNumber(3), "33333333-3333-4333-8333-333333333333");
  });

  it("searches contexts through shorthand parser forms", () => {
    const unquoted = engine.search(
      facts(),
      parser.parse("/context:Architecture Review Board")
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

  it("searches slash-separated context names", () => {
    const result = engine.search(
      facts(),
      parser.parse("/context:Technology Assembly/2026-07-08")
    );

    assert.deepEqual(result.facts.map((fact) => fact.id), [
      "a75ee82c-6b89-4676-8cb1-01222f976885"
    ]);
  });

  it("rejects removed tag field filters", () => {
    assert.throws(
      () => engine.search(facts(), parser.parse("/tag:Steve")),
      /Unsupported search field: tag/
    );
  });
});

function facts() {
  return [
    new Fact({
      id: "6f2308de-02e9-45db-8ff0-65ac793f4a24",
      content: "Mike prefers async architecture reviews.",
      type: "observation",
      createdAt: "2026-06-30T14:15:23.000Z",
      homeContext: "Architecture Review Board",
      associatedContexts: ["Steve"]
    }),
    new Fact({
      id: "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
      content: "Follow up with Steve.",
      type: "task",
      createdAt: "2026-06-30T15:45:00.000Z",
      dueDate: "2026-06-30",
      homeContext: "Steve"
    }),
    new Fact({
      id: "a75ee82c-6b89-4676-8cb1-01222f976885",
      content: "Prep the assembly agenda.",
      type: "fact",
      createdAt: "2026-06-30T13:00:00.000Z",
      homeContext: "Technology Assembly/2026-07-08"
    })
  ];
}

function currentShortcutFacts() {
  return [
    new Fact({
      id: "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
      content: "Follow up with Steve.",
      type: "task",
      createdAt: "2026-06-30T15:45:00.000Z",
      dueDate: "2026-06-30",
      homeContext: "Steve"
    }),
    new Fact({
      id: "9c402d1d-fd46-4200-9e75-cbcdd7a57abc",
      content: "Call Steve.",
      type: "waiting",
      createdAt: "2026-06-30T12:00:00.000Z",
      homeContext: "Steve"
    }),
    new Fact({
      id: "98f76f93-ad4c-4038-9545-ff0fb808108a",
      content: "Schedule next month.",
      type: "task",
      createdAt: "2026-06-30T11:00:00.000Z",
      dueDate: "2026-07-01",
      homeContext: "Steve"
    })
  ];
}
