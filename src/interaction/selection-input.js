import { isDateExpression } from "../domain/date-text.js";

export function parseSelectionInput(input, { actionKeywords = [] } = {}) {
  const tokens = input.trim().split(/\s+/);
  const selectors = [];

  while (tokens.length > 0 && isSelectionSelector(tokens[0])) {
    selectors.push(tokens.shift());
  }

  if (selectors.length === 0) {
    throw new Error("Selection input requires at least one selector");
  }

  const actions = parseSelectionActions(tokens, { actionKeywords });

  if (actions.length === 0) {
    throw new Error("Selection input requires an action");
  }

  return { selectors, actions };
}

export function parseSelectionActions(tokens, { actionKeywords = [] } = {}) {
  const actions = [];
  const knownActions = new Set(actionKeywords);
  let index = 0;

  while (index < tokens.length) {
    if (tokens[index].startsWith("-@") || tokens[index].startsWith("@")) {
      const contextTokens = readEscapedActionTokens(tokens, index);
      actions.push(actionFromTokens(contextTokens));
      index += contextTokens.length;
      continue;
    }

    const dateTokens = readDateActionTokens(tokens, index);
    if (dateTokens) {
      actions.push(actionFromTokens(dateTokens));
      index += dateTokens.length;
      continue;
    }

    if (knownActions.has(tokens[index])) {
      actions.push({ actionKeyword: tokens[index], args: [] });
      index += 1;
      continue;
    }

    actions.push(actionFromTokens(tokens.slice(index)));
    break;
  }

  return actions;
}

export function selectorsForSelectionActions(selectors, actions) {
  if (actions.length === 1 && actions[0].actionKeyword === "edit") {
    return [selectors.at(-1)];
  }

  return selectors;
}

function isSelectionSelector(token) {
  return /^\d+$/.test(token) || /^\.+$/.test(token);
}

function readEscapedActionTokens(tokens, startIndex) {
  const actionTokens = [tokens[startIndex]];
  let index = startIndex;

  while (tokens[index]?.endsWith("\\") && index + 1 < tokens.length) {
    index += 1;
    actionTokens.push(tokens[index]);
  }

  return actionTokens;
}

function readDateActionTokens(tokens, startIndex) {
  let match = null;

  for (let endIndex = startIndex + 1; endIndex <= tokens.length; endIndex += 1) {
    const candidate = tokens.slice(startIndex, endIndex).join(" ");

    if (isDateExpression(candidate)) {
      match = tokens.slice(startIndex, endIndex);
    }
  }

  return match;
}

function actionFromTokens(tokens) {
  return {
    actionKeyword: tokens[0],
    args: tokens.slice(1)
  };
}
