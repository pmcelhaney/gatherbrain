# 0007 — Entity Store: Loading Entities from Vault

## Summary

As a developer, I want a service that loads all entity files from the vault into memory so that the rest of the app can query and display them.

## Details

Implement `src/store/entity-store.ts` — the central in-memory index of all entities.

### Requirements

**Loading**

- Recursively walk all `.md` files under `Entities/` in the vault.
- For each file:
  - Read its content.
  - Parse frontmatter and body using the parser from story 0003.
  - Require `id` and `schema` fields in frontmatter; skip files missing either (log a warning).
  - Construct an `Entity` object (story 0004):
    - `id` from frontmatter
    - `schema` from frontmatter
    - `title` from frontmatter `title` field, or the filename stem if missing
    - `filePath` as the relative path within the vault
    - `frontmatter` as the raw parsed object
    - `body` as the raw Markdown body
  - Index the entity by `id`.

**EntityStore API**

```ts
class EntityStore {
  loadAll(vault: VaultService): Promise<void>;
  getById(id: string): Entity | undefined;
  getAll(): Entity[];
  getBySchema(schemaName: string): Entity[];
  findByTitle(title: string): Entity | undefined;  // exact title match
  findByAlias(alias: string): Entity | undefined;  // matches aliases list in frontmatter
  search(query: string): Entity[];  // substring match on title and aliases
}
```

**Alias support**

- The `aliases` frontmatter field is a list of strings or a single string.
- `findByAlias` matches any alias case-insensitively.

### Acceptance Criteria

- Given a vault with 10 entity files, `store.getAll()` returns 10 entities.
- Files without `id` or `schema` are skipped with a console warning.
- `getBySchema('person')` returns only person entities.
- `findByAlias('John')` returns the entity with alias `John` (case-insensitive).
- `search('tech')` returns entities whose title or aliases contain "tech".
- Unit tests cover all public methods.
