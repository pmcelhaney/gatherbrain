# 0006 — Built-in MVP Schemas

## Summary

As a user, I want the app to ship with default schemas for the core entity types so that I don't need to create them from scratch.

## Details

The app includes built-in schema definitions for all MVP entity types. These are used as fallbacks if no schema file exists in the vault, and serve as examples the user can copy and customize.

### Built-in Schemas to Include

Implement each as a `Schema` object in `src/schema/builtins.ts`. The app merges built-ins with vault-loaded schemas (vault schemas take precedence).

#### `person`
Properties: `title` (string, required), `aliases` (relation-list / string list), `email` (string), `role` (string)  
Folder: `Entities/People`

#### `meeting`
Properties: `title` (string, required), `start` (datetime), `end` (datetime), `attendees` (relation-list → person), `agenda` (text)  
Folder: `Entities/Meetings`

#### `captured-note`
Properties: `title` (string), `created` (datetime, required), `source` (relation → any), `references` (relation-list → any)  
Folder: `Entities/Notes` (notes are stored under the source entity's folder when captured)

#### `next-action`
Properties: `title` (string, required), `created` (datetime), `source` (relation → any), `collaborators` (relation-list → person), `due` (date), `status` (enum: open, waiting, done, canceled)  
Default value for `status`: `open`  
Folder: `Entities/Actions`

#### `decision`
Properties: `title` (string, required), `created` (datetime), `source` (relation → any), `references` (relation-list → any), `status` (enum: proposed, accepted, rejected, superseded)  
Folder: `Entities/Decisions`

#### `open-question`
Properties: `title` (string, required), `created` (datetime), `source` (relation → any), `owner` (relation → person), `status` (enum: open, answered, closed)  
Folder: `Entities/Questions`

### Requirements

- Define all six schemas as typed `Schema` objects in `src/schema/builtins.ts`.
- Export a `BUILTIN_SCHEMAS: Schema[]` constant.
- Each schema must include at minimum a `fullPageTemplate` and `summaryTemplate` (even if minimal HTML).
- The `SchemaRegistry` (story 0005) should be initialized with built-ins before loading vault schemas, so vault schemas can override them.
- Write minimal HTML for each `fullPageTemplate` using the custom elements defined in later stories. Use placeholder comments where templates will grow (e.g., `<!-- TODO: add related notes -->`).

### Acceptance Criteria

- All six schemas are available via `registry.get(name)` even when the vault has no `Schemas/` folder.
- A vault schema with the same name as a built-in overrides the built-in.
- TypeScript compiles without errors.
