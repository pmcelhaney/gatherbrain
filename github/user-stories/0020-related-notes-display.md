# 0020 — Related Notes Display

## Summary

As a user, I want every entity page to show notes that mention or reference that entity so that I can see all relevant captured notes without manually filing them.

## Details

Related notes are displayed using `<entity-query>` (story 0016), but require a compound query: notes where the current entity appears as `source` OR in `references`.

### What Counts as a Related Note

A captured-note (or any entity with `schema: captured-note`) is related to entity X if:

1. `source` equals `[[X title]]` (note was captured while viewing X), OR
2. `references` list contains `[[X title]]` (X was explicitly or automatically linked), OR
3. The note's `body` contains `[[X title]]` as a wikilink.

For MVP, conditions 1 and 2 are sufficient (body scanning is optional).

### Implementation

**Extend the query engine** (story 0009) to support OR logic for the "related notes" use case:

Add a named predefined query type:

```ts
interface RelatedNotesQuery {
  type: 'related-notes';
  entityId: string;   // the entity to find notes for
}
```

In `QueryEngine.run`, handle `RelatedNotesQuery`:
- Return all entities with `schema: captured-note` (or any schema, if you want to show all types) where:
  - `source` resolves to `entityId`, OR
  - `references` contains a wikilink that resolves to `entityId`.
- Sort by `created desc`.

**Add `<entity-related-notes>` element** as a convenience wrapper:

File: `src/elements/entity-related-notes.ts`

```html
<entity-related-notes></entity-related-notes>
```

- Runs `RelatedNotesQuery` for `context.entity.id`.
- Renders results using each entity's `summaryTemplate`.
- Shows a heading "Related Notes" (unless `no-heading` attribute is set).
- Shows "No related notes" when empty.

**Update built-in templates** (story 0006) to include `<entity-related-notes>` in the full page templates for all schemas.

### Example

Meeting page for "EA Core Weekly" shows:

```
Related Notes

2026-06-12 09:15
Send John the Tech Assembly agenda
Source: EA Core Weekly
```

The same note also appears on:
- John Smith's page (because `references` includes John Smith)
- Tech Assembly's page (because `references` includes Tech Assembly)

### Acceptance Criteria

- After capturing "Send John the Tech Assembly agenda" from EA Core Weekly, the note appears on:
  - EA Core Weekly page (source match)
  - John Smith page (references match)
  - Tech Assembly page (references match)
- Notes are shown in reverse chronological order.
- Each note renders using its `summaryTemplate`.
- The note does NOT appear on unrelated entity pages.
