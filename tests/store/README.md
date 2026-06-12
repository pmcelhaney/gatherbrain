# tests/store

Tests for `src/store/`.

## Files

- **`entity-store.test.ts`** — Tests `EntityStore`: loading entities from a mock vault, skipping files with missing `id` or `schema`, `getById`, `getBySchema`, `findByAlias`, `search`, and title fallback from filename.
- **`file-path.test.ts`** — Tests `slugify` (lowercasing, special character removal, diacritic stripping, hyphen collapsing) and `capturedNoteFilePath` (chronological path generation, correct folder placement).
- **`parser.test.ts`** — Tests `parseEntityFile` (with and without frontmatter) and `serializeEntityFile` (round-trip fidelity).
