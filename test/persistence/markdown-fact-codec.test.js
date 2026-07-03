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
      url: "https://example.com/review",
      homeContext: "Architecture Review Board",
      associatedContexts: ["Steve", "Enterprise Architecture"]
    });

    assert.equal(codec.serialize(fact), `---
id: 6f2308de-02e9-45db-8ff0-65ac793f4a24
type: observation
created: 2026-06-30T14:15:23.000Z
associated_contexts:
  - Steve
  - Enterprise Architecture
due: 
file: review-notes.txt
url: https://example.com/review
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
associated_contexts:
  - Steve
tags:
  - Devin
  - Steve Ma
due: 2026-07-01
file: review-notes.txt
url: https://example.com/review
---
Mike prefers async architecture reviews.
`, { homeContext: "Architecture Review Board" });

    assert.equal(fact.id, "6f2308de-02e9-45db-8ff0-65ac793f4a24");
    assert.equal(fact.homeContext.name, "Architecture Review Board");
    assert.deepEqual(fact.associatedContexts.map((context) => context.name), ["Steve"]);
    assert.equal(fact.dueDate, "2026-07-01");
    assert.equal(fact.file, "review-notes.txt");
    assert.equal(fact.url, "https://example.com/review");
    assert.equal(fact.content, "Mike prefers async architecture reviews.");
  });

  it("parses facts without legacy tag metadata", () => {
    const codec = new MarkdownFactCodec();
    const fact = codec.parse(`---
id: 6f2308de-02e9-45db-8ff0-65ac793f4a24
type: observation
created: 2026-06-30T14:15:23.000Z
associated_contexts:
due: 
file: 
---
Mike prefers async architecture reviews.
`, { homeContext: "Architecture Review Board" });

    assert.equal(fact.url, null);
  });

  it("ignores legacy home_context front matter when storage context is provided", () => {
    const codec = new MarkdownFactCodec();
    const fact = codec.parse(`---
id: 6f2308de-02e9-45db-8ff0-65ac793f4a24
type: observation
created: 2026-06-30T14:15:23.000Z
home_context: Legacy Context
associated_contexts:
due: 
file: 
---
Mike prefers async architecture reviews.
`, { homeContext: "Architecture Review Board" });

    assert.equal(fact.homeContext.name, "Architecture Review Board");
  });

  it("requires storage context when parsing facts", () => {
    const codec = new MarkdownFactCodec();

    assert.throws(() => codec.parse(`---
id: 6f2308de-02e9-45db-8ff0-65ac793f4a24
type: observation
created: 2026-06-30T14:15:23.000Z
associated_contexts:
due: 
file: 
---
Mike prefers async architecture reviews.
`), /Missing fact parse option: homeContext/);
  });
});
