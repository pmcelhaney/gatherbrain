const TAG_STOP_CHARS = new Set(["'", "\"", ".", ",", ";", ":", "!", "?", "(", ")", "[", "]", "{", "}", "<", ">"]);

export function extractTags(text) {
  return scanTags(text).tags;
}

export function normalizeTaggedContent(text) {
  return scanTags(text).content;
}

export function normalizeTags(tags = []) {
  const normalizedTags = [];

  for (const tag of tags) {
    const normalizedTag = normalizeTag(tag);

    if (
      normalizedTag &&
      !normalizedTags.some((existing) => existing.toLocaleLowerCase("en-US") === normalizedTag.toLocaleLowerCase("en-US"))
    ) {
      normalizedTags.push(normalizedTag);
    }
  }

  return normalizedTags;
}

function scanTags(text) {
  if (typeof text !== "string") {
    return { tags: [], content: text };
  }

  const tags = [];
  let content = "";
  let index = 0;

  while (index < text.length) {
    if (text[index] !== "@") {
      content += text[index];
      index += 1;
      continue;
    }

    const parsed = parseTagAt(text, index);

    if (!parsed) {
      content += text[index];
      index += 1;
      continue;
    }

    tags.push(parsed.value);
    content += `@${parsed.value}`;
    index = parsed.endIndex;
  }

  return { tags: normalizeTags(tags), content };
}

function parseTagAt(text, startIndex) {
  let index = startIndex + 1;
  let value = "";

  while (index < text.length) {
    const char = text[index];

    if (char === "\\" && /\s/.test(text[index + 1] ?? "")) {
      value += text[index + 1];
      index += 2;
      continue;
    }

    if (/\s/.test(char) || TAG_STOP_CHARS.has(char)) {
      break;
    }

    value += char;
    index += 1;
  }

  const normalizedValue = normalizeTag(value);

  if (!normalizedValue) {
    return null;
  }

  return {
    value: normalizedValue,
    endIndex: index
  };
}

function normalizeTag(tag) {
  if (typeof tag !== "string") {
    return null;
  }

  const normalizedTag = tag.replace(/\\(\s)/g, "$1").trim();
  return normalizedTag.length > 0 ? normalizedTag : null;
}
