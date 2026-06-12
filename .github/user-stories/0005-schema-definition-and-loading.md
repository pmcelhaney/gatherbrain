# 0005 — Schema Definition Files and Loading

## Summary

As a user, I want schema definitions stored as files in my vault so that I can customize how entity types look and behave.

## Details

Schemas are defined as YAML (or JSON) files stored in a `Schemas/` folder inside the vault. The app loads these files at startup and when the vault changes.

### Schema File Format

Each schema is a YAML file, e.g. `Schemas/meeting.yaml`:

```yaml
name: meeting
description: A recurring or one-off meeting.
folder: Entities/Meetings
properties:
  title:
    type: string
    required: true
  start:
    type: datetime
  end:
    type: datetime
  attendees:
    type: relation-list
    schema: person
  agenda:
    type: text
fullPageTemplate: |
  <entity-page>
    <entity-title></entity-title>
    <entity-field name="start"></entity-field>
    <entity-relation-list name="attendees" schema="person"></entity-relation-list>
    <entity-markdown field="agenda"></entity-markdown>
    <quick-capture></quick-capture>
    <entity-query schema="next-action" where="source=current" sort="created desc"></entity-query>
  </entity-page>
summaryTemplate: |
  <span slot="title"><entity-title></entity-title></span>
pickerTemplate: |
  <strong><entity-title></entity-title></strong>
```

### Requirements

- Implement `src/schema/loader.ts` with:
  ```ts
  function loadSchemasFromVault(vault: VaultService): Promise<Schema[]>;
  ```
  - Reads all `.yaml` and `.yml` files from the `Schemas/` folder.
  - Parses each file as a `Schema` object (see story 0004).
  - Ignores files that fail to parse (logs a warning).
- Implement `src/schema/registry.ts` with a `SchemaRegistry` class:
  ```ts
  class SchemaRegistry {
    load(schemas: Schema[]): void;
    get(name: string): Schema | undefined;
    getAll(): Schema[];
    getFolder(schemaName: string): string;
  }
  ```
- If the `Schemas/` folder does not exist, return an empty list (do not throw).

### Acceptance Criteria

- Given a vault with `Schemas/meeting.yaml`, the schema is loaded and accessible via `registry.get('meeting')`.
- Missing or malformed schema files are skipped with a console warning.
- An empty `Schemas/` folder returns an empty registry without errors.
- Unit tests cover: loading a valid schema, skipping an invalid file, empty folder.
