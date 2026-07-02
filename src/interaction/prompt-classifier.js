import { AppMode } from "../state/index.js";

export class PromptClassifier {
  classify(input) {
    if (typeof input !== "string") {
      throw new Error("Prompt input must be a string");
    }

    const firstCharacter = input[0];

    if (firstCharacter === "/") {
      return AppMode.SEARCH;
    }

    if (firstCharacter === ":" || firstCharacter === "@") {
      return AppMode.COMMAND;
    }

    if (firstCharacter === ";") {
      return AppMode.PLAN;
    }

    if (firstCharacter === "." || isDigit(firstCharacter)) {
      return AppMode.SELECTION;
    }

    return AppMode.CAPTURE;
  }
}

function isDigit(value) {
  return typeof value === "string" && /^[0-9]$/.test(value);
}
