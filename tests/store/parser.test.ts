import { describe, expect, it } from 'vitest';

import { parseEntityFile, serializeEntityFile } from '../../src/store/parser';

describe('parseEntityFile', () => {
  it('parses a file with frontmatter and body', () => {
    const parsed = parseEntityFile('---\ntitle: Test\ncount: 3\n---\nHello world');

    expect(parsed).toEqual({
      frontmatter: {
        title: 'Test',
        count: 3,
      },
      body: 'Hello world',
    });
  });

  it('returns empty frontmatter when none is present', () => {
    const parsed = parseEntityFile('Just body content');

    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe('Just body content');
  });

  it('returns an empty body when no body is present', () => {
    const parsed = parseEntityFile('---\ntitle: Test\n---');

    expect(parsed.frontmatter).toEqual({ title: 'Test' });
    expect(parsed.body).toBe('');
  });
});

describe('serializeEntityFile', () => {
  it('round trips frontmatter and body', () => {
    const originalFrontmatter = {
      title: 'Round Trip',
      tags: ['a', 'b'],
    };
    const originalBody = 'Body text';

    const serialized = serializeEntityFile(originalFrontmatter, originalBody);
    const reparsed = parseEntityFile(serialized);

    expect(reparsed).toEqual({
      frontmatter: originalFrontmatter,
      body: originalBody,
    });
  });
});
