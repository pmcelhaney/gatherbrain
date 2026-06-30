export class InputBuffer {
  constructor(text = "", cursor = text.length) {
    this.text = text;
    this.cursor = clamp(cursor, 0, text.length);
  }

  insert(value) {
    if (!value) {
      return;
    }

    this.text = `${this.text.slice(0, this.cursor)}${value}${this.text.slice(this.cursor)}`;
    this.cursor += value.length;
  }

  backspace() {
    if (this.cursor === 0) {
      return;
    }

    this.text = `${this.text.slice(0, this.cursor - 1)}${this.text.slice(this.cursor)}`;
    this.cursor -= 1;
  }

  delete() {
    if (this.cursor >= this.text.length) {
      return;
    }

    this.text = `${this.text.slice(0, this.cursor)}${this.text.slice(this.cursor + 1)}`;
  }

  moveLeft() {
    this.cursor = Math.max(0, this.cursor - 1);
  }

  moveRight() {
    this.cursor = Math.min(this.text.length, this.cursor + 1);
  }

  moveHome() {
    this.cursor = 0;
  }

  moveEnd() {
    this.cursor = this.text.length;
  }

  clear() {
    this.text = "";
    this.cursor = 0;
  }

  consume() {
    const value = this.text;
    this.clear();
    return value;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
