# src/query

Query engine for searching and filtering entities.

## Files

- **`engine.ts`** — `QueryEngine` class with a `run(query, ctx)` method that filters entities by schema, applies `eq`/`neq`/`includes` conditions (ANDed), sorts, and limits results. Wikilink values (`[[Title]]`) are resolved to entity IDs at query time. Also exports `parseQueryString`, which parses HTML attribute-style query declarations (e.g. `schema="next-action" where="source=current" sort="created desc" limit="10"`).
