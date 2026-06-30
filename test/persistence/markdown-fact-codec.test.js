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
      homeSession: "Architecture Review Board",
      associatedSessions: ["Steve", "Enterprise Architecture"]
    });

    assert.equal(codec.serialize(fact), `---
id: 6f2308de-02e9-45db-8ff0-65ac793f4a24
type: observation
created: 2026-06-30T14:15:23.000Z
home_session: Architecture Review Board
associated_sessions:
  - Steve
  - Enterprise Architecture
due: 
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
due: 2026-07-01
---
Mike prefers async architecture reviews.
`);

    assert.equal(fact.id, "6f2308de-02e9-45db-8ff0-65ac793f4a24");
    assert.equal(fact.homeSession.name, "Architecture Review Board");
    assert.deepEqual(fact.associatedSessions.map((session) => session.name), ["Steve"]);
    assert.equal(fact.dueDate, "2026-07-01");
    assert.equal(fact.content, "Mike prefers async architecture reviews.");
  });
});
