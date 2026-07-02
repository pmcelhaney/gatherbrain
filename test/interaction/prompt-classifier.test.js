import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PromptClassifier } from "../../src/interaction/index.js";
import { AppMode } from "../../src/state/index.js";

describe("PromptClassifier", () => {
  const classifier = new PromptClassifier();

  it("classifies prompt prefixes into modes", () => {
    assert.equal(classifier.classify("Mike prefers async reviews."), AppMode.CAPTURE);
    assert.equal(classifier.classify("/Steve"), AppMode.SEARCH);
    assert.equal(classifier.classify(":switch Steve"), AppMode.COMMAND);
    assert.equal(classifier.classify("; 9-10 Steve"), AppMode.PLAN);
    assert.equal(classifier.classify("7 tomorrow"), AppMode.SELECTION);
    assert.equal(classifier.classify(".. task"), AppMode.SELECTION);
  });

  it("treats leading spaces as capture content", () => {
    assert.equal(classifier.classify(" /Steve"), AppMode.CAPTURE);
  });
});
