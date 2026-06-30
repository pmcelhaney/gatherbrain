import fs from "node:fs/promises";
import path from "node:path";

import { Fact } from "../domain/index.js";
import { MarkdownFactCodec } from "./markdown-fact-codec.js";
import { Workspace } from "./workspace.js";

export class FactRepository {
  constructor({ workspace, codec = new MarkdownFactCodec() }) {
    this.workspace = workspace instanceof Workspace ? workspace : new Workspace(workspace);
    this.codec = codec;
  }

  async create(fact) {
    const nextFact = Fact.from(fact);
    const date = dateFromTimestamp(nextFact.createdAt);
    const directory = this.workspace.sessionDirectory(date, nextFact.homeSession);
    const filePath = this.workspace.factPath({
      date,
      session: nextFact.homeSession,
      fileName: fileNameForFact(nextFact)
    });

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(filePath, this.codec.serialize(nextFact), "utf8");

    return { fact: nextFact, filePath };
  }

  async read(filePath) {
    const markdown = await fs.readFile(filePath, "utf8");
    return this.codec.parse(markdown);
  }

  async update(filePath, fact) {
    await fs.writeFile(filePath, this.codec.serialize(fact), "utf8");
    return { fact, filePath };
  }

  async trash(filePath) {
    const fact = await this.read(filePath);
    const date = dateFromTimestamp(fact.createdAt);
    const trashDirectory = this.workspace.trashDirectory(date, fact.homeSession);
    const targetPath = path.join(trashDirectory, path.basename(filePath));

    await fs.mkdir(trashDirectory, { recursive: true });
    await fs.rename(filePath, targetPath);

    return { fact, filePath: targetPath };
  }
}

function dateFromTimestamp(date) {
  return date.toISOString().slice(0, 10);
}

function fileNameForFact(fact) {
  return `${fact.id}-${slugFor(fact.content)}.md`;
}

function slugFor(content) {
  const slug = content
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "fact";
}
