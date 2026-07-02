import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SearchShortcutRegistry } from "../../src/search/index.js";

describe("SearchShortcutRegistry", () => {
  it("expands built-in shortcuts", () => {
    const registry = new SearchShortcutRegistry();

    assert.equal(
      registry.expand("//current"),
      "(type:task OR type:inprogress OR type:waiting) AND due<=today"
    );
    assert.equal(registry.expand("//overdue"), "due<today");
    assert.equal(
      registry.expand("//session", { currentSession: { name: "Architecture Review Board" } }),
      'session:"Architecture Review Board"'
    );
  });

  it("rejects unknown shortcuts", () => {
    const registry = new SearchShortcutRegistry();

    assert.throws(() => registry.expand("//missing"), /Unknown search shortcut/);
  });
});
