import { Fact } from "../domain/index.js";

export class MarkdownFactCodec {
  serialize(fact) {
    const serializable = fact.toSerializable();
    const lines = [
      "---",
      `id: ${serializable.id}`,
      `type: ${serializable.type}`,
      `created: ${serializable.createdAt}`,
      "associated_sessions:"
    ];

    for (const session of serializable.associatedSessions) {
      lines.push(`  - ${session}`);
    }

    lines.push("tags:");
    for (const tag of serializable.tags) {
      lines.push(`  - ${tag}`);
    }

    lines.push(`due: ${serializable.dueDate ?? ""}`);
    lines.push(`file: ${serializable.file ?? ""}`);
    lines.push("---");
    lines.push(serializable.content);

    return `${lines.join("\n")}\n`;
  }

  parse(markdown, { homeSession } = {}) {
    if (typeof markdown !== "string") {
      throw new Error("Markdown fact content must be a string");
    }

    const { frontMatter, body } = splitFrontMatter(markdown);

    return new Fact({
      id: requiredValue(frontMatter, "id"),
      content: body.replace(/\n$/, ""),
      type: requiredValue(frontMatter, "type"),
      createdAt: requiredValue(frontMatter, "created"),
      dueDate: frontMatter.due || null,
      file: frontMatter.file || null,
      homeSession: requiredOption(homeSession, "homeSession"),
      associatedSessions: frontMatter.associated_sessions ?? [],
      tags: frontMatter.tags ?? []
    });
  }
}

function splitFrontMatter(markdown) {
  const lines = markdown.split(/\r?\n/);

  if (lines[0] !== "---") {
    throw new Error("Fact Markdown must start with front matter");
  }

  const endIndex = lines.indexOf("---", 1);

  if (endIndex === -1) {
    throw new Error("Fact Markdown front matter is not closed");
  }

  return {
    frontMatter: parseFrontMatter(lines.slice(1, endIndex)),
    body: lines.slice(endIndex + 1).join("\n")
  };
}

function parseFrontMatter(lines) {
  const frontMatter = {};
  let currentListKey = null;
  const listKeys = new Set(["associated_sessions", "tags"]);

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    const listMatch = line.match(/^\s*-\s+(.*)$/);

    if (listMatch && currentListKey) {
      frontMatter[currentListKey].push(listMatch[1]);
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*):(?:\s*(.*))?$/);

    if (!keyValueMatch) {
      throw new Error(`Unsupported front matter line: ${line}`);
    }

    const [, key, value = ""] = keyValueMatch;

    if (value === "") {
      frontMatter[key] = listKeys.has(key) ? [] : "";
      currentListKey = listKeys.has(key) ? key : null;
    } else {
      frontMatter[key] = value;
      currentListKey = null;
    }
  }

  return frontMatter;
}

function requiredValue(frontMatter, key) {
  if (!frontMatter[key]) {
    throw new Error(`Missing fact front matter field: ${key}`);
  }

  return frontMatter[key];
}

function requiredOption(value, key) {
  if (!value) {
    throw new Error(`Missing fact parse option: ${key}`);
  }

  return value;
}
