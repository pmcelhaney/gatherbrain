import { get, set } from 'idb-keyval';

const VAULT_HANDLE_KEY = 'vaultHandle';

export class VaultService {
  handle: FileSystemDirectoryHandle | null = null;

  async open(): Promise<void> {
    const handle = await window.showDirectoryPicker();
    this.handle = handle;
    await set(VAULT_HANDLE_KEY, handle);
  }

  async restore(): Promise<boolean> {
    const handle = await get<FileSystemDirectoryHandle>(VAULT_HANDLE_KEY);

    if (!handle) {
      this.handle = null;
      return false;
    }

    const permission = await handle.requestPermission({ mode: 'readwrite' });

    if (permission !== 'granted') {
      this.handle = null;
      return false;
    }

    this.handle = handle;
    return true;
  }

  getHandle(): FileSystemDirectoryHandle {
    if (!this.handle) {
      throw new Error('Vault has not been opened.');
    }

    return this.handle;
  }
}
