# src/schema

Schema system: built-in definitions, vault loading, and registry.

## Files

- **`builtins.ts`** — `BUILTIN_SCHEMAS`: the six default schemas shipped with GatherBrain (`person`, `meeting`, `captured-note`, `next-action`, `decision`, `open-question`), each with folder, properties, and page/summary/picker templates.
- **`loader.ts`** — `loadSchemasFromVault(vault)`: reads `Schemas/*.yaml|yml` from the vault root, skips malformed files with a console warning, and returns the parsed schemas. Returns an empty array if the `Schemas/` folder does not exist.
- **`registry.ts`** — `SchemaRegistry` class: stores schemas by name; `load` adds or overrides entries, `get`/`getAll`/`getFolder` provide read access. Loading vault schemas after built-ins lets vault definitions override defaults.
