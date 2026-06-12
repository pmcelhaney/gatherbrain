import { describe, expect, it, vi } from 'vitest';

import { loadSchemasFromVault } from '../../src/schema/loader';
import { type VaultService } from '../../src/store/vault';

function makeMockFileHandle(content: string): FileSystemFileHandle {
  const file = { text: async () => content } as unknown as File;
  return {
    kind: 'file',
    getFile: async () => file,
  } as unknown as FileSystemFileHandle;
}

function makeMockDir(
  entries: Record<string, FileSystemHandle>,
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    [Symbol.asyncIterator]: async function* () {
      for (const [name, handle] of Object.entries(entries)) {
        yield [name, handle] as [string, FileSystemHandle];
      }
    },
    getFileHandle: async (name: string) => {
      const handle = entries[name];
      if (!handle || handle.kind !== 'file') throw new Error('Not found');
      return handle as FileSystemFileHandle;
    },
  } as unknown as FileSystemDirectoryHandle;
}

function makeMockVault(
  schemasDir?: FileSystemDirectoryHandle,
): VaultService {
  const rootEntries: Record<string, FileSystemHandle> = {};

  if (schemasDir) {
    rootEntries['Schemas'] = schemasDir;
  }

  const root: FileSystemDirectoryHandle = {
    kind: 'directory',
    getDirectoryHandle: async (name: string) => {
      if (name === 'Schemas' && schemasDir) return schemasDir;
      throw new DOMException('Not found', 'NotFoundError');
    },
  } as unknown as FileSystemDirectoryHandle;

  return {
    getHandle: () => root,
  } as unknown as VaultService;
}

const validYaml = `
name: meeting
description: A meeting schema
folder: Entities/Meetings
properties:
  title:
    type: string
    required: true
`;

const invalidYaml = `
: this is not valid yaml: [
`;

describe('loadSchemasFromVault', () => {
  it('returns empty array when Schemas/ folder does not exist', async () => {
    const vault = makeMockVault(undefined);
    const result = await loadSchemasFromVault(vault);
    expect(result).toEqual([]);
  });

  it('loads a valid schema file', async () => {
    const dir = makeMockDir({
      'meeting.yaml': makeMockFileHandle(validYaml),
    });
    const vault = makeMockVault(dir);
    const result = await loadSchemasFromVault(vault);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('meeting');
  });

  it('skips non-yaml files', async () => {
    const dir = makeMockDir({
      'readme.md': makeMockFileHandle('# readme'),
    });
    const vault = makeMockVault(dir);
    const result = await loadSchemasFromVault(vault);
    expect(result).toEqual([]);
  });

  it('skips invalid yaml files with a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dir = makeMockDir({
      'bad.yaml': makeMockFileHandle(invalidYaml),
    });
    const vault = makeMockVault(dir);
    const result = await loadSchemasFromVault(vault);
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns empty array for an empty Schemas/ folder', async () => {
    const dir = makeMockDir({});
    const vault = makeMockVault(dir);
    const result = await loadSchemasFromVault(vault);
    expect(result).toEqual([]);
  });
});
