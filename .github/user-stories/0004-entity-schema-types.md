# 0004 — Entity and Schema TypeScript Types

## Summary

As a developer, I want well-defined TypeScript types for entities, schemas, and properties so that the rest of the codebase has a shared, type-safe data model.

## Details

Create `src/types/index.ts` (or split into multiple files under `src/types/`) with the core domain types.

### Types to Define

```ts
// Property type names
type PropertyType =
  | 'string'
  | 'text'
  | 'boolean'
  | 'number'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'relation'
  | 'relation-list';

// Property definitions
interface BaseProperty {
  type: PropertyType;
  label?: string;
  required?: boolean;
  defaultValue?: unknown;
}

interface EnumProperty extends BaseProperty {
  type: 'enum';
  options: string[];
}

interface RelationProperty extends BaseProperty {
  type: 'relation';
  schema: string | 'any'; // target schema name or 'any'
}

interface RelationListProperty extends BaseProperty {
  type: 'relation-list';
  schema: string | 'any';
}

type PropertyDefinition =
  | BaseProperty
  | EnumProperty
  | RelationProperty
  | RelationListProperty;

// Schema definition
interface Schema {
  name: string;            // e.g. "meeting"
  description?: string;
  folder: string;          // e.g. "Entities/Meetings"
  properties: Record<string, PropertyDefinition>;
  defaultValues?: Record<string, unknown>;
  fullPageTemplate?: string;   // HTML string
  summaryTemplate?: string;    // HTML string
  pickerTemplate?: string;     // HTML string
}

// A resolved entity (loaded from a file)
interface Entity {
  id: string;
  schema: string;          // schema name
  title: string;
  filePath: string;        // relative path within vault
  frontmatter: Record<string, unknown>; // raw parsed frontmatter
  body: string;            // raw Markdown body
}

// A Markdown wikilink reference: [[Title]]
interface WikiLink {
  title: string;           // the title inside [[ ]]
  resolvedId?: string;     // resolved entity id if known
}
```

### Requirements

- All types are exported from `src/types/index.ts`.
- No runtime code in this module — types only.
- Add JSDoc comments on each type explaining its purpose.

### Acceptance Criteria

- TypeScript compiles with no errors when these types are imported across the project.
- All core domain concepts (entity, schema, property, wikilink) are represented.
