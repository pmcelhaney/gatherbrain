# tests/schema

Tests for `src/schema/`.

## Files

- **`builtins.test.ts`** — Verifies that all six built-in schemas are present and have required fields (folder, templates).
- **`loader.test.ts`** — Tests `loadSchemasFromVault`: missing folder, valid YAML, non-YAML files, invalid YAML, and empty folder.
- **`registry.test.ts`** — Tests `SchemaRegistry`: loading, retrieval by name, override semantics, `getAll`, and `getFolder` fallback.
