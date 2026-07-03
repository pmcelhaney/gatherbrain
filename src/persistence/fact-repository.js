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
    const directory = this.workspace.contextDirectory(date, nextFact.homeContext);
    const filePath = this.workspace.factPath({
      date,
      context: nextFact.homeContext,
      fileName: fileNameForFact(nextFact)
    });

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(filePath, this.codec.serialize(nextFact), "utf8");

    return { fact: nextFact, filePath };
  }

  async read(filePath) {
    const markdown = await fs.readFile(filePath, "utf8");
    return this.codec.parse(markdown, {
      homeContext: homeContextFromPath(this.workspace.rootPath, filePath)
    });
  }

  async list() {
    const filePaths = await findMarkdownFiles(this.workspace.rootPath);
    const facts = [];

    for (const filePath of filePaths) {
      facts.push(await this.read(filePath));
    }

    return facts;
  }

  async getFactById(factId) {
    const filePath = await this.findPathByFactId(factId);

    if (!filePath) {
      throw new Error(`Fact not found: ${factId}`);
    }

    return this.read(filePath);
  }

  async findPathByFactId(factId) {
    const filePaths = await findMarkdownFiles(this.workspace.rootPath);

    for (const filePath of filePaths) {
      if (path.basename(filePath).startsWith(`${factId}-`)) {
        return filePath;
      }
    }

    return null;
  }

  async update(filePath, fact) {
    await fs.writeFile(filePath, this.codec.serialize(fact), "utf8");
    return { fact, filePath };
  }

  async saveFact(fact) {
    const filePath = await this.findPathByFactId(fact.id);

    if (!filePath) {
      return this.create(fact);
    }

    return this.update(filePath, fact);
  }

  async moveFactToContext(fact, context) {
    const filePath = await this.findPathByFactId(fact.id);

    if (!filePath) {
      throw new Error(`Fact not found: ${fact.id}`);
    }

    const nextFact = Fact.from(fact.toSerializable());
    nextFact.setHomeContext(context);
    const date = dateFromTimestamp(nextFact.createdAt);
    const targetDirectory = this.workspace.contextDirectory(date, nextFact.homeContext);
    const targetPath = path.join(targetDirectory, path.basename(filePath));

    await fs.mkdir(targetDirectory, { recursive: true });

    if (filePath !== targetPath) {
      await fs.rename(filePath, targetPath);
    }

    await fs.writeFile(targetPath, this.codec.serialize(nextFact), "utf8");
    return { fact: nextFact, filePath: targetPath };
  }

  async trash(filePath) {
    const fact = await this.read(filePath);
    const date = dateFromTimestamp(fact.createdAt);
    const trashDirectory = this.workspace.trashDirectory(date, fact.homeContext);
    const targetPath = path.join(trashDirectory, path.basename(filePath));

    await fs.mkdir(trashDirectory, { recursive: true });
    await fs.rename(filePath, targetPath);

    return { fact, filePath: targetPath };
  }

  async trashFact(fact) {
    const filePath = await this.findPathByFactId(fact.id);

    if (!filePath) {
      throw new Error(`Fact not found: ${fact.id}`);
    }

    return this.trash(filePath);
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

function homeContextFromPath(rootPath, filePath) {
  const relativePath = path.relative(rootPath, filePath);
  const directoryParts = path.dirname(relativePath).split(path.sep).filter(Boolean);
  const homeContextParts = directoryParts.at(-1) === ".trash"
    ? directoryParts.slice(0, -1)
    : directoryParts;
  const homeContext = homeContextParts.join("/");

  if (!homeContext) {
    throw new Error(`Fact path is not inside a context directory: ${filePath}`);
  }

  return homeContext;
}

async function findMarkdownFiles(rootPath) {
  const results = [];

  async function walk(directory) {
    let entries;

    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        return;
      }

      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (entry.name !== ".trash") {
          await walk(entryPath);
        }
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(entryPath);
      }
    }
  }

  await walk(rootPath);
  return results.sort();
}
