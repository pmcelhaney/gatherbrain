# 0008 — Entity File Writing

## Summary

As a developer, I want a service that creates and updates entity Markdown files in the vault so that captured notes and property edits are persisted.

## Details

Implement file write operations in `src/store/entity-store.ts` (extending the store from story 0007) and a helper in `src/store/writer.ts`.

### Requirements

**Creating a new entity file**

```ts
class EntityStore {
  createEntity(data: {
    id: string;
    schema: string;
    title: string;
    frontmatter: Record<string, unknown>;
    body?: string;
    filePath: string;   // relative path within vault (caller decides)
  }): Promise<Entity>;
}
```

- Serialize the entity using `serializeEntityFile` (story 0003).
- Create any intermediate directories as needed using the File System Access API.
- Write the file to the vault.
- Add the new entity to the in-memory index.
- Return the created `Entity`.

**Updating an existing entity's frontmatter**

```ts
class EntityStore {
  updateFrontmatter(
    id: string,
    patch: Record<string, unknown>
  ): Promise<Entity>;
}
```

- Look up the entity by id.
- Merge the patch into the existing frontmatter (shallow merge).
- Re-serialize and write the file.
- Update the in-memory index.
- Return the updated `Entity`.

**File path helpers** (`src/store/file-path.ts`)

```ts
function slugify(text: string): string;
// Converts text to a filename-safe, lowercase, hyphen-separated slug.
// Example: "Send John the Tech Assembly agenda" → "send-john-the-tech-assembly-agenda"

function capturedNoteFilePath(sourceEntity: Entity, createdAt: Date, title: string): string;
// Returns a relative file path for a new captured note.
// Format: {sourceFolder}/{YYYY-MM-DD-HHmmss}-{slug}.md
// Example: "Entities/Meetings/EA Core Weekly/2026-06-12-091500-send-john-the-tech-assembly-agenda.md"
```

### Acceptance Criteria

- `createEntity` writes a file to the correct path in the vault and it is readable back.
- `updateFrontmatter` updates only the specified keys, leaving others unchanged.
- `capturedNoteFilePath` produces a chronologically sortable, filesystem-safe filename.
- Writing an entity to a non-existent subdirectory creates the directory automatically.
- Unit tests cover: create, update, slugify edge cases (special chars, Unicode).
