import { describe, expect, it } from 'vitest';

import { SchemaRegistry } from './registry';
import { type Schema } from '../types/index';

const testSchema: Schema = {
  name: 'meeting',
  folder: 'Entities/Meetings',
  properties: {
    title: { type: 'string', required: true },
  },
};

const anotherSchema: Schema = {
  name: 'person',
  folder: 'Entities/People',
  properties: {
    title: { type: 'string', required: true },
  },
};

describe('SchemaRegistry', () => {
  it('returns undefined for unknown schema', () => {
    const registry = new SchemaRegistry();
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('returns a loaded schema by name', () => {
    const registry = new SchemaRegistry();
    registry.load([testSchema]);
    expect(registry.get('meeting')).toEqual(testSchema);
  });

  it('returns all loaded schemas', () => {
    const registry = new SchemaRegistry();
    registry.load([testSchema, anotherSchema]);
    expect(registry.getAll()).toHaveLength(2);
    expect(registry.getAll()).toContain(testSchema);
    expect(registry.getAll()).toContain(anotherSchema);
  });

  it('vault schemas override built-ins when loaded after', () => {
    const registry = new SchemaRegistry();
    registry.load([testSchema]);

    const override: Schema = { ...testSchema, description: 'overridden' };
    registry.load([override]);

    expect(registry.get('meeting')?.description).toBe('overridden');
  });

  it('returns the folder for a known schema', () => {
    const registry = new SchemaRegistry();
    registry.load([testSchema]);
    expect(registry.getFolder('meeting')).toBe('Entities/Meetings');
  });

  it('returns a default folder for an unknown schema', () => {
    const registry = new SchemaRegistry();
    expect(registry.getFolder('unknown')).toBe('Entities/unknown');
  });
});
