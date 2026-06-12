# src/store

Vault access, entity persistence, and file-path utilities.

## Files

- **`vault.ts`** — `VaultService`: wraps the File System Access API. `open()` prompts the user to pick a directory; `restore()` retrieves a previously granted handle from IndexedDB and re-requests permission; `getHandle()` returns the active `FileSystemDirectoryHandle`.
- **`parser.ts`** — `parseEntityFile(content)`: splits a Markdown string into `frontmatter` (YAML, via gray-matter) and `body`. `serializeEntityFile(frontmatter, body)`: round-trips the pair back to a Markdown string with a YAML front-matter block.
- **`entity-store.ts`** — `EntityStore`: recursively walks `Entities/**/*.md`, parses each file, and indexes entities by `id`. Skips files missing `id` or `schema` with a console warning. Exposes `getAll`, `getById`, `getBySchema`, `findByTitle`, `findByAlias`, and `search`. Also provides `createEntity` (writes a new file and indexes it) and `updateFrontmatter` (merges a patch into an existing entity's front matter and updates the index).
- **`file-path.ts`** — `slugify(text)`: strips diacritics and non-alphanumeric characters to produce a URL-safe, hyphen-separated slug. `capturedNoteFilePath(sourceEntity, createdAt, title)`: builds a chronologically sortable file path for a captured note, placed in the same folder as its source entity.
