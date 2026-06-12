# 0030 — File System Adapter Abstraction

## Summary

As a developer, I want all file system access to go through a `FileSystemAdapter` interface so that the app is testable without a real browser environment.

## Details

This story introduces a testability layer. All file I/O currently written against the File System Access API should be refactored to use this adapter.

**Note:** This story should ideally be implemented early (before or alongside story 0007), but is listed last as it is primarily an architectural concern that can be refactored in if needed.

### Interface

File: `src/store/file-system-adapter.ts`

```ts
interface FileSystemAdapter {
  /** Read the text content of a file by relative path. */
  readFile(path: string): Promise<string>;

  /** Write text content to a file (creates intermediate directories). */
  writeFile(path: string, content: string): Promise<void>;

  /** List all files recursively under a directory path, returning relative paths. */
  listFiles(directory: string, extension?: string): Promise<string[]>;

  /** Create a directory (and parents) if it doesn't exist. */
  createDirectory(path: string): Promise<void>;

  /** Check if a file or directory exists. */
  exists(path: string): Promise<boolean>;
}
```

### Implementations

**`BrowserFileSystemAdapter`** (`src/store/browser-file-system-adapter.ts`):
- Wraps the `FileSystemDirectoryHandle` from the vault.
- Implements the interface using File System Access API (`getFileHandle`, `createWritable`, etc.).

**`MemoryFileSystemAdapter`** (`src/store/memory-file-system-adapter.ts`):
- Stores files in an in-memory `Map<string, string>`.
- Used in unit tests and E2E tests.
- The adapter can be pre-seeded with files: `new MemoryFileSystemAdapter({ 'Entities/Meetings/EA Core Weekly.md': '---\nid: ...' })`.

### Dependency Injection

- `VaultService`, `EntityStore`, and all writer code should accept a `FileSystemAdapter` in their constructor.
- The app wires up `BrowserFileSystemAdapter` in production.
- Tests use `MemoryFileSystemAdapter`.

### Acceptance Criteria

- All unit tests for `EntityStore`, `EntityWriter`, and related modules use `MemoryFileSystemAdapter` and do not require a real browser or file system.
- `BrowserFileSystemAdapter` passes the same tests as `MemoryFileSystemAdapter` when run against a real directory (integration test, optional).
- No production code directly calls `FileSystemDirectoryHandle` methods outside of `BrowserFileSystemAdapter`.
