import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InputBuffer } from "../../src/terminal/index.js";

describe("InputBuffer", () => {
  it("inserts text at the cursor", () => {
    const buffer = new InputBuffer("helo", 2);

    buffer.insert("l");

    assert.equal(buffer.text, "hello");
    assert.equal(buffer.cursor, 3);
  });

  it("supports cursor movement and deletion", () => {
    const buffer = new InputBuffer("abcd");

    buffer.moveLeft();
    buffer.backspace();
    assert.equal(buffer.text, "abd");
    assert.equal(buffer.cursor, 2);

    buffer.moveHome();
    buffer.delete();
    assert.equal(buffer.text, "bd");

    buffer.moveEnd();
    buffer.insert("!");
    assert.equal(buffer.text, "bd!");
  });

  it("consumes and clears input", () => {
    const buffer = new InputBuffer("hello");

    assert.equal(buffer.consume(), "hello");
    assert.equal(buffer.text, "");
    assert.equal(buffer.cursor, 0);
  });
});
