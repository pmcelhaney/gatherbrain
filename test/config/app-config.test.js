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
    assert.equal(config.selectionActions.actions.todo.action, "set_type");
  });

  it("merges user selection actions over defaults", () => {
    const config = mergeAppConfig({
      defaultFactType: "fact",
      selectionActions: {
        actions: {
          todo: { action: "set_type", value: "todo" }
        }
      }
    }, {
      defaultFactType: "note",
      selectionActions: {
        actions: {
          idea: { action: "set_type", value: "idea" }
        }
      }
    });

    assert.equal(config.defaultFactType, "note");
    assert.equal(config.selectionActions.actions.todo.value, "todo");
    assert.equal(config.selectionActions.actions.idea.value, "idea");
  });

  it("loads gatherbrain.config.json from the current directory", async () => {
    await fs.writeFile(path.join(rootPath, "gatherbrain.config.json"), JSON.stringify({
      defaultFactType: "note",
      selectionActions: {
        actions: {
          idea: { action: "set_type", value: "idea" }
        }
      }
    }), "utf8");

    const config = await loadAppConfig({ cwd: rootPath });

    assert.equal(config.defaultFactType, "note");
    assert.equal(config.selectionActions.actions.idea.value, "idea");
    assert.equal(config.selectionActions.actions.todo.value, "todo");
  });
});
