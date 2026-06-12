# src/types

Shared TypeScript types and ambient type augmentations.

## Files

- **`index.ts`** — Core domain types: `PropertyType`, `PropertyDefinition` (and sub-types `EnumProperty`, `RelationProperty`, `RelationListProperty`, `PrimitiveProperty`), `Schema`, `Entity`, and `WikiLink`.
- **`file-system-access.d.ts`** — Ambient global type declarations that extend the DOM with the File System Access API (`FileSystemHandle`, `FileSystemFileHandle`, `FileSystemDirectoryHandle`, `FileSystemWritableFileStream`, and `window.showDirectoryPicker`).
