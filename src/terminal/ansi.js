export const ansi = Object.freeze({
  clear: "\x1b[2J",
  home: "\x1b[H",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  reset: "\x1b[0m",
  reverse: "\x1b[7m",
  gray: "\x1b[90m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  magenta: "\x1b[35m"
});

export function color(text, code, enabled = true) {
  return enabled ? `${code}${text}${ansi.reset}` : text;
}

export function visibleLength(text) {
  return stripAnsi(text).length;
}

export function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

export function padVisibleStart(text, width) {
  return `${" ".repeat(Math.max(0, width - visibleLength(text)))}${text}`;
}

export function truncateVisible(text, width) {
  const plain = stripAnsi(text);

  if (plain.length <= width) {
    return text;
  }

  return `${plain.slice(0, Math.max(0, width - 1))}…`;
}

export function wrapPlain(text, width) {
  if (width <= 0) {
    return [""];
  }

  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (!word) {
      continue;
    }

    if (word.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current || lines.length === 0) {
    lines.push(current);
  }

  return lines;
}
