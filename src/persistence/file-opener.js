import { execFile as execFileWithCallback, spawn } from "node:child_process";
import path from "node:path";
import { env } from "node:process";
import { promisify } from "node:util";

const execFile = promisify(execFileWithCallback);

export class FileOpener {
  constructor({ execFile: runCommand = execFile, runEditor = defaultRunEditor, editor = env.EDITOR } = {}) {
    this.execFile = runCommand;
    this.runEditor = runEditor;
    this.editor = editor;
  }

  async openAssociatedFile({ fact, factPath }) {
    if (!fact.file) {
      throw new Error("Fact has no associated file");
    }

    const filePath = path.resolve(path.dirname(factPath), fact.file);
    await this.execFile("open", [filePath]);
    return filePath;
  }

  async editFactFile({ factPath }) {
    if (!this.editor) {
      throw new Error("EDITOR is required to edit facts");
    }

    await this.runEditor(this.editor, factPath);
    return factPath;
  }
}

function defaultRunEditor(editor, filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", 'exec $EDITOR "$@"', "gatherbrain-editor", filePath], {
      env: {
        ...env,
        EDITOR: editor
      },
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Editor exited with ${signal ?? code}`));
    });
  });
}
