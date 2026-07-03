import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SearchShortcutRegistry } from "../../src/search/index.js";

describe("SearchShortcutRegistry", () => {
  it("expands built-in shortcuts", () => {
    const registry = new SearchShortcutRegistry();

    assert.equal(
      registry.expand("//current"),
      "(type:task OR type:inprogress OR type:waiting) AND (due<=today OR NOT due:*)"
    );
    assert.equal(registry.expand("//overdue"), "due<today");
  });

  it("rejects unknown shortcuts", () => {
    const registry = new SearchShortcutRegistry();

    assert.throws(() => registry.expand("//missing"), /Unknown search shortcut/);
    assert.throws(() => registry.expand("//context"), /Unknown search shortcut/);
  });

  it("expands configured shortcuts", () => {
    const registry = new SearchShortcutRegistry({
      inbox: 'context:"Inbox"'
    });

    assert.equal(registry.expand("//inbox"), 'context:"Inbox"');
  });
});
