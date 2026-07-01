import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Fact, Session } from "../../src/domain/index.js";

describe("Fact", () => {
  it("requires exactly one home session", () => {
    assert.throws(
      () => new Fact({
        id: "6f2308de-02e9-45db-8ff0-65ac793f4a24",
        content: "Architecture review should stay async.",
        type: "observation",
        createdAt: "2026-06-30T10:15:23-04:00"
      }),
      /Fact home session is required/
    );
  });

  it("does not duplicate the home session in associated sessions", () => {
    const fact = new Fact({
      id: "6f2308de-02e9-45db-8ff0-65ac793f4a24",
      content: "Mike prefers async architecture reviews.",
      type: "observation",
      createdAt: "2026-06-30T10:15:23-04:00",
      homeSession: "Architecture Review Board",
      associatedSessions: ["Steve", " architecture review board ", "Steve"]
    });

    assert.deepEqual(
      fact.associatedSessions.map((session) => session.name),
      ["Steve"]
    );
  });

  it("applies domain changes", () => {
    const fact = new Fact({
      id: "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
      content: "Follow up with Steve.",
      type: "todo",
      createdAt: new Date("2026-06-30T11:45:00-04:00"),
      homeSession: new Session("Steve")
    });

    fact.setType("waiting");
    fact.setDueDate("2026-07-01");
    fact.associateSession("Architecture Review Board");
    fact.dissociateSession("architecture review board");

    assert.equal(fact.type, "waiting");
    assert.equal(fact.dueDate, "2026-07-01");
    assert.deepEqual(fact.associatedSessions, []);
  });

  it("serializes without storage details", () => {
    const fact = new Fact({
      id: "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
      content: "Follow up with Steve.",
      type: "todo",
      createdAt: "2026-06-30T15:45:00.000Z",
      dueDate: "2026-07-01",
      file: "launch-notes.txt",
      homeSession: "Steve",
      associatedSessions: ["Architecture Review Board"],
      tags: ["Devin", " devin ", "Steve Ma"]
    });

    assert.deepEqual(fact.toSerializable(), {
      id: "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
      content: "Follow up with Steve.",
      type: "todo",
      createdAt: "2026-06-30T15:45:00.000Z",
      dueDate: "2026-07-01",
      file: "launch-notes.txt",
      homeSession: "Steve",
      associatedSessions: ["Architecture Review Board"],
      tags: ["Devin", "Steve Ma"]
    });
  });

  it("validates due dates as local dates", () => {
    assert.throws(
      () => new Fact({
        id: "5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a",
        content: "Bad due date",
        type: "todo",
        createdAt: "2026-06-30T10:15:23-04:00",
        homeSession: "Steve",
        dueDate: "tomorrow"
      }),
      /Due date must use YYYY-MM-DD format/
    );
  });

  it("requires UUID ids", () => {
    assert.throws(
      () => new Fact({
        id: "202606301145",
        content: "Bad id",
        type: "todo",
        createdAt: "2026-06-30T10:15:23-04:00",
        homeSession: "Steve"
      }),
      /Fact id must be a UUID/
    );
  });
});
