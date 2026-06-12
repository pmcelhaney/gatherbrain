import { type Entity } from '../types/index';
import { parseEntityFile, serializeEntityFile } from './parser';
import { type VaultService } from './vault';

async function walkMarkdownFiles(
  dir: FileSystemDirectoryHandle,
  basePath: string,
): Promise<{ path: string; handle: FileSystemFileHandle }[]> {
  const results: { path: string; handle: FileSystemFileHandle }[] = [];

  for await (const [name, handle] of dir) {
    const entryPath = basePath ? `${basePath}/${name}` : name;

    if (handle.kind === 'file' && name.endsWith('.md')) {
      results.push({ path: entryPath, handle: handle as FileSystemFileHandle });
    } else if (handle.kind === 'directory') {
      const sub = await walkMarkdownFiles(
        handle as FileSystemDirectoryHandle,
        entryPath,
      );
      results.push(...sub);
    }
  }

  return results;
}

async function getOrCreateDirHandle(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<FileSystemDirectoryHandle> {
  const parts = relativePath.split('/').filter(Boolean);
  let current = root;

  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }

  return current;
}

export class EntityStore {
  private index: Map<string, Entity> = new Map();
  private vault: VaultService | null = null;

  async loadAll(vault: VaultService): Promise<void> {
    this.vault = vault;
    this.index.clear();
    const root = vault.getHandle();
    let entitiesDir: FileSystemDirectoryHandle;

    try {
      entitiesDir = await root.getDirectoryHandle('Entities');
    } catch {
      return;
    }

    const files = await walkMarkdownFiles(entitiesDir, 'Entities');

    for (const { path, handle } of files) {
      try {
        const file = await handle.getFile();
        const content = await file.text();
        const { frontmatter, body } = parseEntityFile(content);

        const id = frontmatter['id'];
        const schema = frontmatter['schema'];

        if (typeof id !== 'string' || !id) {
          console.warn(`Skipping ${path}: missing or invalid 'id' field.`);
          continue;
        }

        if (typeof schema !== 'string' || !schema) {
          console.warn(`Skipping ${path}: missing or invalid 'schema' field.`);
          continue;
        }

        const titleValue = frontmatter['title'];
        const title =
          typeof titleValue === 'string' && titleValue
            ? titleValue
            : path.split('/').pop()!.replace(/\.md$/, '');

        const entity: Entity = {
          id,
          schema,
          title,
          filePath: path,
          frontmatter,
          body,
        };

        this.index.set(id, entity);
      } catch (err) {
        console.warn(`Failed to load entity from ${path}:`, err);
      }
    }
  }

  getById(id: string): Entity | undefined {
    return this.index.get(id);
  }

  getAll(): Entity[] {
    return Array.from(this.index.values());
  }

  getBySchema(schemaName: string): Entity[] {
    return this.getAll().filter((e) => e.schema === schemaName);
  }

  findByTitle(title: string): Entity | undefined {
    const lower = title.toLowerCase();
    return this.getAll().find((e) => e.title.toLowerCase() === lower);
  }

  findByAlias(alias: string): Entity | undefined {
    const lower = alias.toLowerCase();

    return this.getAll().find((e) => {
      const raw = e.frontmatter['aliases'];
      if (!raw) return false;

      const aliases = Array.isArray(raw)
        ? (raw as unknown[]).map(String)
        : [String(raw)];

      return aliases.some((a) => a.toLowerCase() === lower);
    });
  }

  search(query: string): Entity[] {
    const lower = query.toLowerCase();

    return this.getAll().filter((e) => {
      if (e.title.toLowerCase().includes(lower)) return true;

      const raw = e.frontmatter['aliases'];
      if (!raw) return false;

      const aliases = Array.isArray(raw)
        ? (raw as unknown[]).map(String)
        : [String(raw)];

      return aliases.some((a) => a.toLowerCase().includes(lower));
    });
  }

  async createEntity(data: {
    id: string;
    schema: string;
    title: string;
    frontmatter: Record<string, unknown>;
    body?: string;
    filePath: string;
  }): Promise<Entity> {
    if (!this.vault) {
      throw new Error('EntityStore has not been loaded with a vault.');
    }

    const root = this.vault.getHandle();
    const parts = data.filePath.split('/');
    const fileName = parts[parts.length - 1];
    const dirPath = parts.slice(0, -1).join('/');

    const dir = await getOrCreateDirHandle(root, dirPath);
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();

    const fm: Record<string, unknown> = {
      id: data.id,
      schema: data.schema,
      title: data.title,
      ...data.frontmatter,
    };

    const content = serializeEntityFile(fm, data.body ?? '');
    await writable.write(content);
    await writable.close();

    const entity: Entity = {
      id: data.id,
      schema: data.schema,
      title: data.title,
      filePath: data.filePath,
      frontmatter: fm,
      body: data.body ?? '',
    };

    this.index.set(entity.id, entity);
    return entity;
  }

  async updateFrontmatter(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<Entity> {
    if (!this.vault) {
      throw new Error('EntityStore has not been loaded with a vault.');
    }

    const existing = this.index.get(id);

    if (!existing) {
      throw new Error(`Entity not found: ${id}`);
    }

    const root = this.vault.getHandle();
    const parts = existing.filePath.split('/');
    const fileName = parts[parts.length - 1];
    const dirPath = parts.slice(0, -1).join('/');

    const dir = await getOrCreateDirHandle(root, dirPath);
    const fileHandle = await dir.getFileHandle(fileName);
    const writable = await fileHandle.createWritable();

    const updatedFrontmatter = { ...existing.frontmatter, ...patch };
    const content = serializeEntityFile(updatedFrontmatter, existing.body);

    await writable.write(content);
    await writable.close();

    const updated: Entity = {
      ...existing,
      frontmatter: updatedFrontmatter,
    };

    this.index.set(id, updated);
    return updated;
  }
}
