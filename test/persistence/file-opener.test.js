import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { Fact } from "../../src/domain/index.js";
import { FileOpener } from "../../src/persistence/index.js";

describe("FileOpener", () => {
  it("opens associated files relative to the fact file", async () => {
    const calls = [];
    const opener = new FileOpener({
      async execFile(command, args) {
        calls.push({ command, args });
      }
    });
    const fact = new Fact({
      id: "6f2308de-02e9-45db-8ff0-65ac793f4a24",
      content: "Launch notes",
      type: "file",
      createdAt: "2026-07-01T12:00:00.000Z",
      file: "launch-notes.txt",
      homeContext: "Steve"
    });

    const filePath = await opener.openAssociatedFile({
      fact,
      factPath: path.join("/tmp", "workspace", "2026-07-01", "Steve", "fact.md")
    });

    assert.equal(filePath, path.join("/tmp", "workspace", "2026-07-01", "Steve", "launch-notes.txt"));
    assert.deepEqual(calls, [{
      command: "open",
      args: [filePath]
    }]);
  });

  it("opens fact Markdown files in EDITOR", async () => {
    const edited = [];
    const opener = new FileOpener({
      editor: "code -w",
      async runEditor(editor, filePath) {
        edited.push({ editor, filePath });
      }
    });
    const factPath = path.join("/tmp", "workspace", "2026-07-01", "Steve", "fact.md");

    const filePath = await opener.editFactFile({ factPath });

    assert.equal(filePath, factPath);
    assert.deepEqual(edited, [{
      editor: "code -w",
      filePath: factPath
    }]);
  });

  it("requires EDITOR before editing fact Markdown files", async () => {
    const opener = new FileOpener({ editor: "" });

    await assert.rejects(
      opener.editFactFile({ factPath: "/tmp/fact.md" }),
      /EDITOR is required/
    );
  });
});
