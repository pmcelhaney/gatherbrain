import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Fact } from "../../src/domain/index.js";
import { MarkdownFactCodec } from "../../src/persistence/index.js";

describe("MarkdownFactCodec", () => {
  it("serializes facts to spec-shaped front matter", () => {
    const codec = new MarkdownFactCodec();
    const fact = new Fact({
      id: "6f2308de-02e9-45db-8ff0-65ac793f4a24",
      content: "Mike prefers async architecture reviews.",
      type: "observation",
      createdAt: "2026-06-30T14:15:23.000Z",
      dueDate: null,
      file: "review-notes.txt",
      homeSession: "Architecture Review Board",
      associatedSessions: ["Steve", "Enterprise Architecture"],
      tags: ["Devin", "Steve Ma"]
    });

    assert.equal(codec.serialize(fact), `---
id: 6f2308de-02e9-45db-8ff0-65ac793f4a24
type: observation
created: 2026-06-30T14:15:23.000Z
home_session: Architecture Review Board
associated_sessions:
  - Steve
  - Enterprise Architecture
tags:
  - Devin
  - Steve Ma
due: 
file: review-notes.txt
---
Mike prefers async architecture reviews.
`);
  });

  it("parses facts from Markdown", () => {
    const codec = new MarkdownFactCodec();
    const fact = codec.parse(`---
id: 6f2308de-02e9-45db-8ff0-65ac793f4a24
type: observation
created: 2026-06-30T14:15:23.000Z
home_session: Architecture Review Board
associated_sessions:
  - Steve
tags:
  - Devin
  - Steve Ma
due: 2026-07-01
file: review-notes.txt
---
Mike prefers async architecture reviews.
`);

    assert.equal(fact.id, "6f2308de-02e9-45db-8ff0-65ac793f4a24");
    assert.equal(fact.homeSession.name, "Architecture Review Board");
    assert.deepEqual(fact.associatedSessions.map((session) => session.name), ["Steve"]);
    assert.equal(fact.dueDate, "2026-07-01");
    assert.equal(fact.file, "review-notes.txt");
    assert.deepEqual(fact.tags, ["Devin", "Steve Ma"]);
    assert.equal(fact.content, "Mike prefers async architecture reviews.");
  });

  it("parses facts without tags for backward compatibility", () => {
    const codec = new MarkdownFactCodec();
    const fact = codec.parse(`---
id: 6f2308de-02e9-45db-8ff0-65ac793f4a24
type: observation
created: 2026-06-30T14:15:23.000Z
home_session: Architecture Review Board
associated_sessions:
due: 
file: 
---
Mike prefers async architecture reviews.
`);

    assert.deepEqual(fact.tags, []);
  });
});
