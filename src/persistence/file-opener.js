import { execFile as execFileWithCallback } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileWithCallback);

export class FileOpener {
  constructor({ execFile: runCommand = execFile } = {}) {
    this.execFile = runCommand;
  }

  async openAssociatedFile({ fact, factPath }) {
    if (!fact.file) {
      throw new Error("Fact has no associated file");
    }

    const filePath = path.resolve(path.dirname(factPath), fact.file);
    await this.execFile("open", [filePath]);
    return filePath;
  }
}
