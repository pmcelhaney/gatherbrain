# 0002 — Vault Selection

## Summary

As a user, I want to select a local folder as my vault so that the app can read and write my entity files.

## Details

Use the browser's **File System Access API** (`window.showDirectoryPicker()`) to let the user choose a folder on their filesystem. The chosen folder handle should be persisted across sessions using IndexedDB (via the `idb-keyval` library or equivalent) so the user does not need to re-select on every visit.

### Requirements

- On first load, show a "Open Vault" button.
- Clicking the button calls `window.showDirectoryPicker()`.
- The returned `FileSystemDirectoryHandle` is stored in IndexedDB under the key `vaultHandle`.
- On subsequent loads, retrieve the stored handle and call `handle.requestPermission({ mode: 'readwrite' })` to re-verify access.
  - If permission is granted, proceed to load the vault.
  - If permission is denied or the handle is gone, show the "Open Vault" button again.
- After a vault is opened, display the vault folder name somewhere in the UI (e.g., in a header or sidebar).
- Export a `VaultService` class/module from `src/store/vault.ts` with at minimum:
  ```ts
  class VaultService {
    handle: FileSystemDirectoryHandle | null;
    open(): Promise<void>;           // calls showDirectoryPicker and persists handle
    restore(): Promise<boolean>;     // restores handle from IndexedDB
    getHandle(): FileSystemDirectoryHandle;
  }
  ```

### Acceptance Criteria

- First visit: user sees "Open Vault" button.
- After selecting a folder, the folder name is displayed.
- After refreshing the page, the vault is restored without requiring re-selection (assuming permission is granted).
- If the user denies permission on restore, the "Open Vault" button is shown again.
