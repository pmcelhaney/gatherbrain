import { execFile as execFileWithCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileWithCallback);

export class ClipboardReader {
  constructor({ execFile: runCommand = execFile } = {}) {
    this.execFile = runCommand;
  }

  async read() {
    const png = await this.readPng();

    if (png) {
      return png;
    }

    const { stdout } = await this.execFile("pbpaste", [], {
      encoding: "buffer",
      maxBuffer: 50 * 1024 * 1024
    });

    if (!stdout || stdout.length === 0) {
      throw new Error("Clipboard is empty");
    }

    return {
      mediaType: "text/plain",
      extension: "txt",
      data: stdout
    };
  }

  async readPng() {
    const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "gatherbrain-clipboard-"));
    const tempFile = path.join(tempDirectory, "clipboard.png");

    try {
      await this.execFile("osascript", [
        "-e",
        "set pngData to the clipboard as «class PNGf»",
        "-e",
        `set outFile to POSIX file ${JSON.stringify(tempFile)}`,
        "-e",
        "set fileRef to open for access outFile with write permission",
        "-e",
        "set eof fileRef to 0",
        "-e",
        "write pngData to fileRef",
        "-e",
        "close access fileRef"
      ]);

      const data = await fs.readFile(tempFile);

      if (data.length === 0) {
        return null;
      }

      return {
        mediaType: "image/png",
        extension: "png",
        data
      };
    } catch {
      return null;
    } finally {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    }
  }
}
