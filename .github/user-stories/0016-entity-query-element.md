# 0016 — `<entity-query>` Custom Element

## Summary

As a user, I want an element that displays a list of entities matching a query so that page templates can show related content like next actions or decisions.

## Details

File: `src/elements/entity-query.ts`

**Attributes:**
- `schema` — filter by schema name.
- `where` — filter conditions as a simple string (see query engine story 0009 for format).
  - Example: `"source=current"`, `"references includes current"`, `"status=open"`
- `sort` — sort expression. Example: `"created desc"`, `"title asc"`.
- `limit` — maximum number of results (integer string).
- `empty-message` — text to show when no results (default: "None").

**Behavior:**

- Extends `BaseElement`.
- In `onContextReady()`:
  - Parse attributes into an `EntityQuery` object using the query string parser (story 0009).
  - Run `context.query.run(parsedQuery, { currentEntityId: entity.id })`.
  - For each result entity:
    - Look up its schema via `context.schemas.get(entity.schema)`.
    - Render its `summaryTemplate` HTML into a list item.
    - Call `injectContext` on the new list item with a context where `entity` is the result entity.
  - If no results, render the `empty-message`.
- Wrap results in a `<ul class="entity-query-results">`.

**HTML usage:**
```html
<entity-query
  schema="next-action"
  where="source=current"
  sort="created desc"
  empty-message="No next actions"
></entity-query>

<entity-query
  schema="captured-note"
  where="references includes current"
  sort="created desc"
  limit="20"
></entity-query>
```

### Acceptance Criteria

- Renders a list of next-actions where `source` equals the current entity.
- Each result renders using its schema's `summaryTemplate`.
- Custom elements inside summary templates receive context (with the result entity as `entity`).
- When zero results match, the `empty-message` is shown.
- `limit` truncates the result list.
- Updating an entity (e.g., changing status) re-runs the query and updates the list.
  - Listen for a `entity-updated` custom event dispatched on `document` after any `updateEntity` call.
