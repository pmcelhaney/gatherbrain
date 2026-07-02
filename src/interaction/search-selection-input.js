import { parseSelectionInput } from "./selection-input.js";

export function parseSearchSelectionInput(input, { actionKeywords = [] } = {}) {
  const delimiterIndex = searchSelectionDelimiterIndex(input);

  if (delimiterIndex === -1) {
    return null;
  }

  const searchInput = input.slice(0, delimiterIndex).trim();
  const selectionInput = input.slice(delimiterIndex + 1).trim();

  if (!selectionInput) {
    return null;
  }

  const { selectors, actions } = parseSelectionInput(selectionInput, {
    actionKeywords
  });

  return {
    searchInput,
    selectionInput,
    selectors,
    actions
  };
}

export function searchSelectionDelimiterIndex(input) {
  if (typeof input !== "string" || !input.trimStart().startsWith("/")) {
    return -1;
  }

  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (char === "\\" && index + 1 < input.length) {
      index += 1;
      continue;
    }

    if (char === "\"") {
      quoted = !quoted;
      continue;
    }

    if (char === ";" && !quoted) {
      return index;
    }
  }

  return -1;
}
