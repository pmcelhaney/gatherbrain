# src

Application source code.

## Files

- **`app.ts`** — `App` class: boots the application, loads vault data (schemas and entities), manages hash-based routing, and renders pages.
- **`main.ts`** — Entry point. Finds the `#app` root element and calls `App.boot()`.

## Subdirectories

- **`elements/`** — Custom HTML element base class and DOM context injection utilities.
- **`query/`** — Query engine for filtering, sorting, and limiting entity results.
- **`schema/`** — Schema definitions, built-in schemas, vault schema loader, and schema registry.
- **`services/`** — Application-level services such as client-side routing.
- **`store/`** — Vault access, entity file parsing, entity indexing, and file-path helpers.
- **`types/`** — Shared TypeScript type definitions and File System Access API type augmentations.
