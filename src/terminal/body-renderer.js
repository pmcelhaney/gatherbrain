import { AppMode } from "../state/index.js";
import {
  formatNaturalDate,
  replaceIsoDatesWithNaturalDates
} from "../domain/date-text.js";
import { ansi, color, padVisibleStart, wrapPlain } from "./ansi.js";

export class BodyRenderer {
  constructor({ calendarRenderer }) {
    this.calendarRenderer = calendarRenderer;
  }

  render({
    state,
    resultSet = null,
    timeBoxes = [],
    helpLines = null,
    selectionPreview = null,
    width = 80,
    height = 20,
    today = null,
    now = null,
    colorEnabled = false
  }) {
    if (helpLines) {
      return helpLines.slice(0, height);
    }

    if (state.currentMode === AppMode.PLAN) {
      return this.calendarRenderer.render({
        timeBoxes,
        planPreview: state.planPreview,
        height,
        now,
        colorEnabled
      });
    }

    if (!resultSet || resultSet.count === 0) {
      return ["..."];
    }

    const rows = resultSet.toRows();
    const numberWidth = Math.max(2, String(resultSet.count).length);
    const rendered = [];

    for (const { number, fact } of rows) {
      const isSelected = selectionPreview?.includes(fact.id) ?? false;
      const contextMarker = isFactInCurrentContext(fact, state.currentSession) ? "+" : " ";
      const basePrefix = `${contextMarker}${padVisibleStart(String(number), numberWidth)}. `;
      const prefix = isSelected && !colorEnabled ? `>${basePrefix}` : basePrefix;
      const type = displayType(fact);
      const due = fact.dueDate ? `${formatDueDate(fact.dueDate, today)} ` : "";
      const firstLinePrefix = `${color(prefix, ansi.gray, colorEnabled)}${color(type, ansi.cyan, colorEnabled)}${color(due, ansi.magenta, colorEnabled)}`;
      const continuationPrefix = " ".repeat(numberWidth + 2);
      const firstLineWidth = Math.max(1, width - prefix.length - type.length - due.length);
      const continuationWidth = Math.max(1, width - continuationPrefix.length);
      const [first, ...rest] = wrapPlain(displayContent(fact, today), firstLineWidth);

      rendered.push(highlight(`${firstLinePrefix}${renderContentLine(first, fact, colorEnabled)}`, isSelected, colorEnabled));
      for (const line of rest) {
        for (const wrapped of wrapPlain(line, continuationWidth)) {
          rendered.push(highlight(`${continuationPrefix}${renderContentLine(wrapped, fact, colorEnabled)}`, isSelected, colorEnabled));
        }
      }
    }

    if (rendered.length > height) {
      return [...rendered.slice(0, height - 1), "..."];
    }

    return rendered;
  }
}

function displayType(fact) {
  if (!fact.type || fact.type === "fact") {
    return "";
  }

  return `${fact.type} `;
}

function displayContent(fact, today) {
  const content = replaceIsoDatesWithNaturalDates(fact.content, { today });
  const appendedTags = unmentionedTags(content, fact.tags);

  if (appendedTags.length === 0) {
    return content;
  }

  return `${content} ${appendedTags.map((tag) => `>${tag}`).join(" ")}`;
}

function renderContentLine(text, fact, colorEnabled) {
  const highlighted = highlightTags(text, fact.tags, colorEnabled);
  return fact.url ? hyperlink(highlighted, fact.url) : highlighted;
}

function hyperlink(text, url) {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

function isFactInCurrentContext(fact, currentSession) {
  if (!currentSession) {
    return false;
  }

  return fact.homeSession.equals(currentSession) ||
    fact.associatedSessions.some((session) => session.equals(currentSession));
}

function highlight(text, enabled, colorEnabled) {
  if (!enabled || !colorEnabled) {
    return text;
  }

  return `${ansi.reverse}${text}${ansi.reset}`;
}

function highlightTags(text, tags = [], colorEnabled) {
  if (!colorEnabled || tags.length === 0) {
    return text;
  }

  const sortedTags = [...tags].sort((left, right) => right.length - left.length);
  let rendered = "";
  let index = 0;

  while (index < text.length) {
    if (text[index] !== "@") {
      rendered += text[index];
      index += 1;
      continue;
    }

    const tag = sortedTags.find((candidate) => isTagMention(text, index, candidate));

    if (!tag) {
      rendered += text[index];
      index += 1;
      continue;
    }

    const mention = `@${tag}`;
    rendered += color(mention, ansi.green, colorEnabled);
    index += mention.length;
    continue;
  }

  return highlightTrailingTags(rendered, tags, colorEnabled);
}

function highlightTrailingTags(text, tags = [], colorEnabled) {
  let rendered = text;

  for (const tag of tags) {
    rendered = rendered.replaceAll(`>${tag}`, color(`>${tag}`, ansi.green, colorEnabled));
  }

  return rendered;
}

function unmentionedTags(text, tags = []) {
  return tags.filter((tag) => !containsTagMention(text, tag));
}

function containsTagMention(text, tag) {
  let index = 0;

  while (index < text.length) {
    if (text[index] === "@" && isTagMention(text, index, tag)) {
      return true;
    }

    index += 1;
  }

  return false;
}

function isTagMention(text, startIndex, tag) {
  if (text.slice(startIndex + 1, startIndex + 1 + tag.length) !== tag) {
    return false;
  }

  const nextChar = text[startIndex + 1 + tag.length];
  return !nextChar || isTagStopChar(nextChar);
}

function isTagStopChar(char) {
  return /\s/.test(char) || ["'", "\"", ".", ",", ";", ":", "!", "?", "(", ")", "[", "]", "{", "}", "<", ">"].includes(char);
}

function formatDueDate(dueDate, today) {
  return formatNaturalDate(dueDate, { today });
}
