import fs from "node:fs/promises";
import path from "node:path";

import { Workspace } from "./workspace.js";

export class PasteRepository {
  constructor({ workspace }) {
    this.workspace = workspace instanceof Workspace ? workspace : new Workspace(workspace);
  }

  async create({ date, context, name, clipboardItem }) {
    if (!clipboardItem?.data || !clipboardItem?.extension) {
      throw new Error("Clipboard item is required");
    }

    await this.workspace.prepare();
    const directory = this.workspace.contextDirectory(date, context);
    const fileName = await this.uniqueFileName({
      directory,
      name,
      extension: clipboardItem.extension
    });
    const filePath = this.workspace.pastePath({ date, context, fileName });

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(filePath, clipboardItem.data);

    return {
      fileName,
      filePath,
      mediaType: clipboardItem.mediaType
    };
  }

  async uniqueFileName({ directory, name, extension }) {
    const stem = slugFor(name);
    let suffix = "";
    let index = 2;

    while (true) {
      const fileName = `${stem}${suffix}.${extension}`;

      try {
        await fs.access(path.join(directory, fileName));
        suffix = `-${index}`;
        index += 1;
      } catch {
        return fileName;
      }
    }
  }
}

export function slugFor(value) {
  const slug = String(value)
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || "paste";
}
