import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { loadAppConfig, mergeAppConfig } from "../../src/config/index.js";

describe("app config", () => {
  let rootPath;

  beforeEach(async () => {
    rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "gatherbrain-config-"));
  });

  afterEach(async () => {
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  it("loads defaults when no config file exists", async () => {
    const config = await loadAppConfig({ cwd: rootPath });

    assert.equal(config.defaultFactType, "fact");
    assert.equal(
      config.searchShortcuts.current,
      "(type:task OR type:inprogress OR type:waiting) AND (due<=today OR NOT due:*)"
    );
    assert.equal(config.searchShortcuts.context, undefined);
    assert.equal(config.selectionActions.actions.task.action, "set_type");
  });

  it("merges user shortcuts and selection actions over defaults", () => {
    const config = mergeAppConfig({
      defaultFactType: "fact",
      searchShortcuts: {
        current: "type:task"
      },
      selectionActions: {
        actions: {
          task: { action: "set_type", value: "task" }
        }
      }
    }, {
      defaultFactType: "note",
      searchShortcuts: {
        inbox: 'context:"Inbox"'
      },
      selectionActions: {
        actions: {
          idea: { action: "set_type", value: "idea" }
        }
      }
    });

    assert.equal(config.defaultFactType, "note");
    assert.equal(config.searchShortcuts.current, "type:task");
    assert.equal(config.searchShortcuts.inbox, 'context:"Inbox"');
    assert.equal(config.selectionActions.actions.task.value, "task");
    assert.equal(config.selectionActions.actions.idea.value, "idea");
  });

  it("loads gatherbrain.config.json from the current directory", async () => {
    await fs.writeFile(path.join(rootPath, "gatherbrain.config.json"), JSON.stringify({
      defaultFactType: "note",
      searchShortcuts: {
        inbox: 'context:"Inbox"'
      },
      selectionActions: {
        actions: {
          idea: { action: "set_type", value: "idea" }
        }
      }
    }), "utf8");

    const config = await loadAppConfig({ cwd: rootPath });

    assert.equal(config.defaultFactType, "note");
    assert.equal(config.searchShortcuts.inbox, 'context:"Inbox"');
    assert.equal(config.searchShortcuts.current, "(type:task OR type:inprogress OR type:waiting) AND (due<=today OR NOT due:*)");
    assert.equal(config.selectionActions.actions.idea.value, "idea");
    assert.equal(config.selectionActions.actions.task.value, "task");
  });
});
