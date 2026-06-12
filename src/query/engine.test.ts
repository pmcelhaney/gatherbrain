import { describe, expect, it } from 'vitest';

import { QueryEngine, parseQueryString } from './engine';
import { EntityStore } from '../store/entity-store';
import { type Entity } from '../types/index';

function makeStore(entities: Entity[]): EntityStore {
  const store = new EntityStore();
  for (const e of entities) {
    // Access private index via type cast
    (store as unknown as { index: Map<string, Entity> }).index.set(e.id, e);
  }
  return store;
}

const entities: Entity[] = [
  {
    id: 'action_001',
    schema: 'next-action',
    title: 'Send email',
    filePath: 'Entities/Actions/send-email.md',
    frontmatter: {
      id: 'action_001',
      schema: 'next-action',
      title: 'Send email',
      source: 'meeting_001',
      created: '2026-06-10T09:00:00Z',
      status: 'open',
    },
    body: '',
  },
  {
    id: 'action_002',
    schema: 'next-action',
    title: 'Review notes',
    filePath: 'Entities/Actions/review-notes.md',
    frontmatter: {
      id: 'action_002',
      schema: 'next-action',
      title: 'Review notes',
      source: 'meeting_002',
      created: '2026-06-12T10:00:00Z',
      status: 'done',
    },
    body: '',
  },
  {
    id: 'person_001',
    schema: 'person',
    title: 'Alice',
    filePath: 'Entities/People/alice.md',
    frontmatter: {
      id: 'person_001',
      schema: 'person',
      title: 'Alice',
      created: '2026-01-01T00:00:00Z',
    },
    body: '',
  },
  {
    id: 'note_001',
    schema: 'captured-note',
    title: 'Tech note',
    filePath: 'Entities/Notes/tech-note.md',
    frontmatter: {
      id: 'note_001',
      schema: 'captured-note',
      title: 'Tech note',
      references: ['[[Alice]]', 'meeting_001'],
      created: '2026-06-11T08:00:00Z',
    },
    body: '',
  },
];

describe('QueryEngine', () => {
  const store = makeStore(entities);
  const engine = new QueryEngine(store);
  const ctx = { currentEntityId: 'meeting_001' };

  it('filters by schema', () => {
    const results = engine.run({ schema: 'next-action' }, ctx);
    expect(results.every((e) => e.schema === 'next-action')).toBe(true);
    expect(results).toHaveLength(2);
  });

  it('filters with eq condition', () => {
    const results = engine.run({
      schema: 'next-action',
      where: [{ field: 'source', operator: 'eq', value: 'current' }],
    }, ctx);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('action_001');
  });

  it('filters with neq condition', () => {
    const results = engine.run({
      schema: 'next-action',
      where: [{ field: 'status', operator: 'neq', value: 'done' }],
    }, ctx);
    expect(results.every((e) => e.frontmatter['status'] !== 'done')).toBe(true);
  });

  it('filters with includes condition resolving wikilinks', () => {
    const results = engine.run({
      schema: 'captured-note',
      where: [{ field: 'references', operator: 'includes', value: 'person_001' }],
    }, ctx);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('note_001');
  });

  it('sorts by created desc', () => {
    const results = engine.run({
      schema: 'next-action',
      sort: { field: 'created', direction: 'desc' },
    }, ctx);
    expect(results[0].id).toBe('action_002');
    expect(results[1].id).toBe('action_001');
  });

  it('sorts by created asc', () => {
    const results = engine.run({
      schema: 'next-action',
      sort: { field: 'created', direction: 'asc' },
    }, ctx);
    expect(results[0].id).toBe('action_001');
    expect(results[1].id).toBe('action_002');
  });

  it('applies limit', () => {
    const results = engine.run({
      sort: { field: 'created', direction: 'desc' },
      limit: 2,
    }, ctx);
    expect(results).toHaveLength(2);
  });

  it('defaults to created desc when no sort specified', () => {
    const results = engine.run({ schema: 'next-action' }, ctx);
    const dates = results.map((e) => new Date(String(e.frontmatter['created'])).getTime());
    expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
  });
});

describe('parseQueryString', () => {
  it('parses schema attribute', () => {
    const q = parseQueryString('schema="next-action"');
    expect(q.schema).toBe('next-action');
  });

  it('parses where with eq', () => {
    const q = parseQueryString('where="source=current"');
    expect(q.where).toEqual([
      { field: 'source', operator: 'eq', value: 'current' },
    ]);
  });

  it('parses where with includes', () => {
    const q = parseQueryString('where="references includes current"');
    expect(q.where).toEqual([
      { field: 'references', operator: 'includes', value: 'current' },
    ]);
  });

  it('parses sort field and direction', () => {
    const q = parseQueryString('sort="created desc"');
    expect(q.sort).toEqual({ field: 'created', direction: 'desc' });
  });

  it('parses limit', () => {
    const q = parseQueryString('limit="10"');
    expect(q.limit).toBe(10);
  });

  it('parses a compound query string', () => {
    const q = parseQueryString(
      'schema="captured-note" where="references includes current" sort="created desc" limit="10"',
    );
    expect(q.schema).toBe('captured-note');
    expect(q.where).toEqual([
      { field: 'references', operator: 'includes', value: 'current' },
    ]);
    expect(q.sort).toEqual({ field: 'created', direction: 'desc' });
    expect(q.limit).toBe(10);
  });
});
