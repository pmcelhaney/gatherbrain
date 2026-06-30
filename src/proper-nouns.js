const connectorWords = new Set([
  'da',
  'de',
  'del',
  'der',
  'di',
  'du',
  'la',
  'le',
  'of',
  'the',
  'van',
  'von'
]);

const wordPattern = /[A-Za-z][A-Za-z'.-]*/gu;
const segmentPattern = /[^.!?;:\n]+/gu;

function isCapitalizedWord(word) {
  return /^[A-Z][A-Za-z'.-]*$/u.test(word);
}

function wordTokens(text) {
  return [...String(text ?? '').matchAll(wordPattern)].map((match) => match[0]);
}

export function extractProperNouns(text) {
  const properNouns = [];

  for (const segmentMatch of String(text ?? '').matchAll(segmentPattern)) {
    const tokens = wordTokens(segmentMatch[0]);

    for (let index = 0; index < tokens.length; index += 1) {
      if (!isCapitalizedWord(tokens[index])) {
        continue;
      }

      const phrase = [tokens[index]];
      let cursor = index + 1;

      while (cursor < tokens.length) {
        const token = tokens[cursor];

        if (isCapitalizedWord(token)) {
          phrase.push(token);
          cursor += 1;
          continue;
        }

        const nextToken = tokens[cursor + 1];

        if (connectorWords.has(token.toLowerCase()) && isCapitalizedWord(nextToken ?? '')) {
          phrase.push(token, nextToken);
          cursor += 2;
          continue;
        }

        break;
      }

      properNouns.push(phrase.join(' '));
      index = cursor - 1;
    }
  }

  return properNouns;
}

export function createProperNounIndex(values = []) {
  const index = new Map();

  for (const value of values) {
    const count = index.get(value) ?? 0;

    index.set(value, count + 1);
  }

  return index;
}

export function mergeProperNouns(index, values = []) {
  for (const value of values) {
    index.set(value, (index.get(value) ?? 0) + 1);
  }

  return index;
}

export function properNounEntries(index) {
  return [...(index ?? new Map()).entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name, 'en-US'));
}
