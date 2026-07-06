import { AppMode } from "../state/index.js";
import {
  formatNaturalDate,
  replaceIsoDatesWithNaturalDates
} from "../domain/date-text.js";
import { ansi, color, padVisibleStart, wrapPlain } from "./ansi.js";

export class BodyRenderer {
  render({
    state,
    resultSet = null,
    helpLines = null,
    selectionPreview = null,
    width = 80,
    height = 20,
    today = null,
    colorEnabled = false
  }) {
    if (helpLines) {
      return helpLines.slice(0, height);
    }

    if (!resultSet || resultSet.count === 0) {
      return ["..."];
    }

    const rows = resultSet.toRows();
    const numberWidth = Math.max(2, String(resultSet.count).length);
    const rendered = [];

    for (const { number, fact } of rows) {
      const isSelected = selectionPreview?.includes(fact.id) ?? false;
      const basePrefix = `${padVisibleStart(String(number), numberWidth)}. `;
      const prefix = isSelected && !colorEnabled ? `>${basePrefix}` : basePrefix;
      const type = displayType(fact);
      const due = fact.dueDate ? `${formatDueDate(fact.dueDate, today)} ` : "";
      const home = displayHomeContext(fact, state);
      const firstLinePrefix = `${color(prefix, ansi.gray, colorEnabled)}${color(type, ansi.cyan, colorEnabled)}${color(due, ansi.magenta, colorEnabled)}${colorIfPresent(home, ansi.gray, colorEnabled)}`;
      const continuationPrefix = " ".repeat(numberWidth + 2);
      const firstLineWidth = Math.max(1, width - prefix.length - type.length - due.length - home.length);
      const continuationWidth = Math.max(1, width - continuationPrefix.length);
      const [first, ...rest] = wrapPlain(displayContentWithAssociations(fact, today), firstLineWidth);

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

function displayHomeContext(fact, state) {
  if (state.currentMode !== AppMode.SEARCH || isFactInCurrentContext(fact, state.currentContext)) {
    return "";
  }

  return `[${fact.homeContext.name}] `;
}

function colorIfPresent(text, code, enabled) {
  return text ? color(text, code, enabled) : "";
}

function displayContent(fact, today) {
  return replaceIsoDatesWithNaturalDates(fact.content, { today });
}

function displayContentWithAssociations(fact, today) {
  const suffix = displayAssociationSuffix(fact);
  return suffix ? `${displayContent(fact, today)} ${suffix}` : displayContent(fact, today);
}

function displayAssociationSuffix(fact) {
  const markers = associationMarkerNames(fact).map((name) => `>${name}`);
  return markers.join(" ");
}

function renderContentLine(text, fact, colorEnabled) {
  const content = highlightAssociationMarkers(
    highlightInlineContextReferences(text, fact, colorEnabled),
    fact,
    colorEnabled
  );
  return fact.url ? hyperlink(content, fact.url) : content;
}

function hyperlink(text, url) {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

function highlightInlineContextReferences(text, fact, colorEnabled) {
  if (!colorEnabled) {
    return text;
  }

  const contextNames = contextReferenceNames(fact);
  const pattern = contextReferencePattern(contextNames);
  if (!pattern) {
    return text;
  }

  return text.replace(pattern, (reference) => color(reference, ansi.green, true));
}

function hasInlineContextReference(text, context) {
  const pattern = contextReferencePattern([context?.name].filter(Boolean));
  return pattern ? pattern.test(text) : false;
}

function contextReferencePattern(contextNames) {
  const referenceNames = [
    ...new Set(contextNames.flatMap((name) => [
      name,
      escapedContextReferenceName(name)
    ]))
  ].filter(Boolean);

  if (referenceNames.length === 0) {
    return null;
  }

  referenceNames.sort((left, right) => right.length - left.length);
  return new RegExp(
    `@(?:${referenceNames.map(escapeRegex).join("|")})(?![\\\\\\p{L}\\p{N}_-]|\\s+\\p{Lu})`,
    "gu"
  );
}

function escapedContextReferenceName(name) {
  return String(name).replaceAll(" ", "\\ ");
}

function contextReferenceNames(fact) {
  const names = [
    fact.homeContext?.name,
    ...fact.associatedContexts.map((context) => context.name)
  ].filter(Boolean);

  return [...new Set(names)].sort((left, right) => right.length - left.length);
}

function associationMarkerNames(fact) {
  return fact.associatedContexts
    .map((context) => context.name)
    .filter((name) => !hasInlineContextReference(fact.content, { name }));
}

function highlightAssociationMarkers(text, fact, colorEnabled) {
  if (!colorEnabled) {
    return text;
  }

  const markerNames = associationMarkerNames(fact);
  if (markerNames.length === 0) {
    return text;
  }

  markerNames.sort((left, right) => right.length - left.length);
  const pattern = new RegExp(
    `(^|\\s)(>${markerNames.map(escapeRegex).join("|>")})(?=\\s|$)`,
    "gu"
  );
  return text.replace(pattern, (_, prefix, marker) => `${prefix}${color(marker, ansi.green, true)}`);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isFactInCurrentContext(fact, currentContext) {
  if (!currentContext) {
    return false;
  }

  return fact.homeContext.equals(currentContext);
}

function highlight(text, enabled, colorEnabled) {
  if (!enabled || !colorEnabled) {
    return text;
  }

  return `${ansi.reverse}${text.replaceAll(ansi.reset, `${ansi.reset}${ansi.reverse}`)}${ansi.reset}`;
}

function formatDueDate(dueDate, today) {
  return formatNaturalDate(dueDate, { today });
}
