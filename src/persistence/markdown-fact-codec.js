import { Fact } from "../domain/index.js";

export class MarkdownFactCodec {
  serialize(fact) {
    const serializable = fact.toSerializable();
    const lines = [
      "---",
      `id: ${serializable.id}`,
      `type: ${serializable.type}`,
      `created: ${serializable.createdAt}`,
      `home_session: ${serializable.homeSession}`,
      "associated_sessions:"
    ];

    for (const session of serializable.associatedSessions) {
      lines.push(`  - ${session}`);
    }

    lines.push(`due: ${serializable.dueDate ?? ""}`);
    lines.push("---");
    lines.push(serializable.content);

    return `${lines.join("\n")}\n`;
  }

  parse(markdown) {
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
      homeSession: requiredValue(frontMatter, "home_session"),
      associatedSessions: frontMatter.associated_sessions ?? []
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
      frontMatter[key] = key === "associated_sessions" ? [] : "";
      currentListKey = key === "associated_sessions" ? key : null;
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
