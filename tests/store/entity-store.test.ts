import { describe, expect, it, vi } from 'vitest';

import { EntityStore } from '../../src/store/entity-store';
import { type VaultService } from '../../src/store/vault';

type FileEntry = { kind: 'file'; content: string };
type DirEntry = { kind: 'directory'; children: FileTree };
type FileTree = Record<string, FileEntry | DirEntry>;

function makeMockFileHandle(content: string): FileSystemFileHandle {
  const file = { text: async () => content } as unknown as File;
  return {
    kind: 'file',
    getFile: async () => file,
    createWritable: async () => {
      let written = '';
      return {
        write: async (data: string) => { written = data; },
        close: async () => {},
        _getWritten: () => written,
      } as unknown as FileSystemWritableFileStream;
    },
  } as unknown as FileSystemFileHandle;
}

function makeMockDirHandle(tree: FileTree): FileSystemDirectoryHandle {
  const handle: FileSystemDirectoryHandle = {
    kind: 'directory',
    [Symbol.asyncIterator]: async function* () {
      for (const [name, entry] of Object.entries(tree)) {
        if (entry.kind === 'file') {
          yield [name, makeMockFileHandle(entry.content)] as [string, FileSystemHandle];
        } else {
          yield [name, makeMockDirHandle(entry.children)] as [string, FileSystemHandle];
        }
      }
    },
    getDirectoryHandle: async (name: string, opts?: { create?: boolean }) => {
      const entry = tree[name];
      if (entry?.kind === 'directory') {
        return makeMockDirHandle(entry.children);
      }
      if (opts?.create) {
        tree[name] = { kind: 'directory', children: {} };
        return makeMockDirHandle((tree[name] as DirEntry).children);
      }
      throw new DOMException('Not found', 'NotFoundError');
    },
    getFileHandle: async (name: string, opts?: { create?: boolean }) => {
      const entry = tree[name];
      if (entry?.kind === 'file') {
        return makeMockFileHandle(entry.content);
      }
      if (opts?.create) {
        tree[name] = { kind: 'file', content: '' };
        return makeMockFileHandle('');
      }
      throw new DOMException('Not found', 'NotFoundError');
    },
  } as unknown as FileSystemDirectoryHandle;
  return handle;
}

function makeVault(entitiesTree: FileTree): VaultService {
  const rootTree: FileTree = {
    Entities: { kind: 'directory', children: entitiesTree },
  };
  const root = makeMockDirHandle(rootTree);
  return { getHandle: () => root } as unknown as VaultService;
}

const entity1 = `---
id: person_001
schema: person
title: Alice
---
Hello`;

const entity2 = `---
id: person_002
schema: person
title: Bob
aliases:
  - Robert
  - Bobby
---
World`;

const entity3 = `---
id: meeting_001
schema: meeting
title: Weekly Sync
---
`;

const missingId = `---
schema: person
title: NoId
---`;

const missingSchema = `---
id: nope_001
title: NoSchema
---`;

describe('EntityStore', () => {
  it('loads all entities from vault', async () => {
    const vault = makeVault({
      People: {
        kind: 'directory',
        children: {
          'alice.md': { kind: 'file', content: entity1 },
          'bob.md': { kind: 'file', content: entity2 },
        },
      },
      Meetings: {
        kind: 'directory',
        children: {
          'sync.md': { kind: 'file', content: entity3 },
        },
      },
    });

    const store = new EntityStore();
    await store.loadAll(vault);

    expect(store.getAll()).toHaveLength(3);
  });

  it('skips files missing id with a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const vault = makeVault({
      'bad.md': { kind: 'file', content: missingId },
    });
    const store = new EntityStore();
    await store.loadAll(vault);

    expect(store.getAll()).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('skips files missing schema with a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const vault = makeVault({
      'bad.md': { kind: 'file', content: missingSchema },
    });
    const store = new EntityStore();
    await store.loadAll(vault);

    expect(store.getAll()).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns empty when Entities/ folder does not exist', async () => {
    const root = {
      kind: 'directory',
      getDirectoryHandle: async () => {
        throw new DOMException('Not found', 'NotFoundError');
      },
    } as unknown as FileSystemDirectoryHandle;
    const vault = { getHandle: () => root } as unknown as VaultService;

    const store = new EntityStore();
    await store.loadAll(vault);

    expect(store.getAll()).toHaveLength(0);
  });

  it('getById returns correct entity', async () => {
    const vault = makeVault({
      'alice.md': { kind: 'file', content: entity1 },
    });
    const store = new EntityStore();
    await store.loadAll(vault);

    expect(store.getById('person_001')?.title).toBe('Alice');
    expect(store.getById('unknown')).toBeUndefined();
  });

  it('getBySchema filters by schema', async () => {
    const vault = makeVault({
      'alice.md': { kind: 'file', content: entity1 },
      'sync.md': { kind: 'file', content: entity3 },
    });
    const store = new EntityStore();
    await store.loadAll(vault);

    const people = store.getBySchema('person');
    expect(people).toHaveLength(1);
    expect(people[0].id).toBe('person_001');
  });

  it('findByAlias finds entity case-insensitively', async () => {
    const vault = makeVault({
      'bob.md': { kind: 'file', content: entity2 },
    });
    const store = new EntityStore();
    await store.loadAll(vault);

    expect(store.findByAlias('bobby')?.id).toBe('person_002');
    expect(store.findByAlias('ROBERT')?.id).toBe('person_002');
  });

  it('search returns entities with matching title or alias', async () => {
    const vault = makeVault({
      'alice.md': { kind: 'file', content: entity1 },
      'bob.md': { kind: 'file', content: entity2 },
    });
    const store = new EntityStore();
    await store.loadAll(vault);

    const results = store.search('bob');
    expect(results.some((e) => e.id === 'person_002')).toBe(true);
  });

  it('uses filename stem as title when title is missing', async () => {
    const noTitle = `---\nid: test_001\nschema: test\n---\n`;
    const vault = makeVault({
      'my-entity.md': { kind: 'file', content: noTitle },
    });
    const store = new EntityStore();
    await store.loadAll(vault);

    expect(store.getById('test_001')?.title).toBe('my-entity');
  });
});
