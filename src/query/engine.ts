import { type Entity } from '../types/index';
import { type EntityStore } from '../store/entity-store';

export interface QueryCondition {
  field: string;
  operator: 'eq' | 'includes' | 'neq';
  value: string;
}

export interface EntityQuery {
  schema?: string;
  where?: QueryCondition[];
  sort?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  limit?: number;
}

const WIKILINK_REGEX = /^\[\[(.+?)\]\]$/;

function resolveWikilink(
  raw: unknown,
  store: EntityStore,
): string {
  if (typeof raw !== 'string') return String(raw ?? '');

  const match = WIKILINK_REGEX.exec(raw);

  if (match) {
    const title = match[1];
    const entity = store.findByTitle(title);
    return entity ? entity.id : raw;
  }

  return raw;
}

function resolveField(
  entity: Entity,
  field: string,
  store: EntityStore,
): unknown {
  const raw = entity.frontmatter[field];

  if (Array.isArray(raw)) {
    return raw.map((v) => resolveWikilink(v, store));
  }

  return resolveWikilink(raw, store);
}

function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined || value === null) return [];
  return [String(value)];
}

function resolveValue(
  value: string,
  context: { currentEntityId: string },
): string {
  return value === 'current' ? context.currentEntityId : value;
}

function matchesCondition(
  entity: Entity,
  condition: QueryCondition,
  context: { currentEntityId: string },
  store: EntityStore,
): boolean {
  const fieldValue = resolveField(entity, condition.field, store);
  const targetValue = resolveValue(condition.value, context);

  switch (condition.operator) {
    case 'eq':
      return String(fieldValue ?? '') === targetValue;

    case 'neq':
      return String(fieldValue ?? '') !== targetValue;

    case 'includes': {
      const list = toList(fieldValue);
      return list.includes(targetValue);
    }
  }
}

function compareValues(a: unknown, b: unknown, direction: 'asc' | 'desc'): number {
  const aStr = String(a ?? '');
  const bStr = String(b ?? '');

  // Try date comparison first
  const aTime = Date.parse(aStr);
  const bTime = Date.parse(bStr);

  let result: number;

  if (!isNaN(aTime) && !isNaN(bTime)) {
    result = aTime - bTime;
  } else {
    result = aStr.localeCompare(bStr);
  }

  return direction === 'asc' ? result : -result;
}

export class QueryEngine {
  constructor(private store: EntityStore) {}

  run(query: EntityQuery, context: { currentEntityId: string }): Entity[] {
    let results = this.store.getAll();

    if (query.schema) {
      results = results.filter((e) => e.schema === query.schema);
    }

    if (query.where && query.where.length > 0) {
      results = results.filter((e) =>
        query.where!.every((condition) =>
          matchesCondition(e, condition, context, this.store),
        ),
      );
    }

    const sort = query.sort ?? { field: 'created', direction: 'desc' };

    results = [...results].sort((a, b) =>
      compareValues(
        a.frontmatter[sort.field],
        b.frontmatter[sort.field],
        sort.direction,
      ),
    );

    if (query.limit !== undefined) {
      results = results.slice(0, query.limit);
    }

    return results;
  }
}

export function parseQueryString(attr: string): EntityQuery {
  const query: EntityQuery = {};
  const tokenRegex = /(\w+)="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(attr)) !== null) {
    const [, key, value] = match;

    switch (key) {
      case 'schema':
        query.schema = value;
        break;

      case 'where': {
        const conditions: QueryCondition[] = [];

        for (const clause of value.split(',').map((s) => s.trim())) {
          const includesMatch = /^(\S+)\s+includes\s+(\S+)$/.exec(clause);
          const eqMatch = /^(\S+)!=(\S+)$/.exec(clause);
          const simpleEqMatch = /^(\S+)=(\S+)$/.exec(clause);

          if (includesMatch) {
            conditions.push({
              field: includesMatch[1],
              operator: 'includes',
              value: includesMatch[2],
            });
          } else if (eqMatch) {
            conditions.push({
              field: eqMatch[1],
              operator: 'neq',
              value: eqMatch[2],
            });
          } else if (simpleEqMatch) {
            conditions.push({
              field: simpleEqMatch[1],
              operator: 'eq',
              value: simpleEqMatch[2],
            });
          }
        }

        if (conditions.length > 0) {
          query.where = conditions;
        }

        break;
      }

      case 'sort': {
        const parts = value.trim().split(/\s+/);
        const direction = parts[1] === 'desc' ? 'desc' : 'asc';
        query.sort = {
          field: parts[0],
          direction,
        };
        break;
      }

      case 'limit':
        query.limit = parseInt(value, 10);
        break;
    }
  }

  return query;
}
