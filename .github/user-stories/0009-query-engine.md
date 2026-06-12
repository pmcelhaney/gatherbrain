# 0009 — Query Engine

## Summary

As a developer, I want a query engine that filters and sorts entities so that page templates can declaratively display related content.

## Details

Implement `src/query/engine.ts`. The query engine is used by the `<entity-query>` custom element and by the related notes feature.

### Query Object

```ts
interface QueryCondition {
  field: string;
  operator: 'eq' | 'includes' | 'neq';
  value: string;  // 'current' is a special value meaning the current entity's id
}

interface EntityQuery {
  schema?: string;          // filter by schema name
  where?: QueryCondition[];
  sort?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  limit?: number;
}
```

### QueryEngine API

```ts
class QueryEngine {
  constructor(store: EntityStore) {}

  run(query: EntityQuery, context: { currentEntityId: string }): Entity[];
}
```

**Filtering rules:**

- `schema`: include only entities with the matching `schema` value.
- `where` conditions are ANDed together.
- For `eq` (`field = value`): the frontmatter field equals the value. If value is `'current'`, compare to the current entity's id.
- For `includes` (`field includes value`): the frontmatter field is a list (or a single value coerced to a list) that contains the value. Support wikilink format: `[[Entity Title]]` in stored values should resolve to entity id for comparison.
- For `neq`: negation of `eq`.
- Frontmatter values that are wikilinks (`[[Title]]`) should be resolved to their entity id for comparison.

**Sorting:**

- Sort by the named frontmatter field.
- `direction`: `asc` or `desc`.
- Dates sort correctly when the field is a date/datetime value.
- Default sort (if none specified): `created desc`.

**Limit:** truncate results to the given count.

### Query String Parsing

For use in HTML attributes, support parsing a simple query string format:

```ts
function parseQueryString(attr: string): EntityQuery;
```

Examples:
- `schema="next-action" where="source=current" sort="created desc"`
- `schema="captured-note" where="references includes current" sort="created desc" limit="10"`

### Acceptance Criteria

- `run({ schema: 'next-action', where: [{ field: 'source', operator: 'eq', value: 'current' }] }, ctx)` returns only next-actions whose `source` is the current entity.
- Sorting by `created desc` puts the newest first.
- `includes` correctly matches wikilink-stored relations.
- The query string parser round-trips the examples above.
- Unit tests cover: schema filter, eq/includes/neq, sort asc/desc, limit, wikilink resolution.
