import { describe, expect, it } from 'vitest';

import { slugify, capturedNoteFilePath } from './file-path';
import { type Entity } from '../types/index';

describe('slugify', () => {
  it('lowercases and hyphenates words', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('Send John the Tech Assembly agenda!')).toBe(
      'send-john-the-tech-assembly-agenda',
    );
  });

  it('handles Unicode by stripping diacritics', () => {
    expect(slugify('Café au lait')).toBe('cafe-au-lait');
  });

  it('collapses multiple spaces and hyphens', () => {
    expect(slugify('a  b--c')).toBe('a-b-c');
  });

  it('trims leading and trailing whitespace', () => {
    expect(slugify('  hello  ')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});

describe('capturedNoteFilePath', () => {
  const sourceEntity: Entity = {
    id: 'meeting_001',
    schema: 'meeting',
    title: 'EA Core Weekly',
    filePath: 'Entities/Meetings/EA Core Weekly/ea-core-weekly.md',
    frontmatter: {},
    body: '',
  };

  it('produces a chronologically sortable path', () => {
    const date = new Date(2026, 5, 12, 9, 15, 0); // June 12 2026, 09:15:00
    const path = capturedNoteFilePath(
      sourceEntity,
      date,
      'Send John the Tech Assembly agenda',
    );

    expect(path).toBe(
      'Entities/Meetings/EA Core Weekly/2026-06-12-091500-send-john-the-tech-assembly-agenda.md',
    );
  });

  it('places the file in the source entity folder', () => {
    const date = new Date(2026, 0, 1, 0, 0, 0);
    const path = capturedNoteFilePath(sourceEntity, date, 'Test note');
    expect(path.startsWith('Entities/Meetings/EA Core Weekly/')).toBe(true);
  });
});
