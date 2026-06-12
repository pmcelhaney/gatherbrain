import { load as loadYaml } from 'js-yaml';

import { type Schema } from '../types/index';
import { type VaultService } from '../store/vault';

async function readFileFromDir(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<string> {
  const fileHandle = await dir.getFileHandle(name);
  const file = await fileHandle.getFile();
  return file.text();
}

export async function loadSchemasFromVault(
  vault: VaultService,
): Promise<Schema[]> {
  const root = vault.getHandle();
  let schemasDir: FileSystemDirectoryHandle;

  try {
    schemasDir = await root.getDirectoryHandle('Schemas');
  } catch {
    return [];
  }

  const schemas: Schema[] = [];

  for await (const [name, handle] of schemasDir) {
    if (
      handle.kind !== 'file' ||
      (!name.endsWith('.yaml') && !name.endsWith('.yml'))
    ) {
      continue;
    }

    try {
      const content = await readFileFromDir(schemasDir, name);
      const parsed = loadYaml(content);

      if (typeof parsed !== 'object' || parsed === null) {
        console.warn(`Schema file ${name} did not parse to an object. Skipping.`);
        continue;
      }

      const candidate = parsed as Partial<Schema>;
      if (
        typeof candidate.name !== 'string' ||
        typeof candidate.folder !== 'string' ||
        typeof candidate.properties !== 'object' ||
        candidate.properties === null
      ) {
        console.warn(
          `Schema file ${name} is missing required fields (name, folder, properties). Skipping.`,
        );
        continue;
      }

      schemas.push(candidate as Schema);
    } catch (err) {
      console.warn(`Failed to parse schema file ${name}:`, err);
    }
  }

  return schemas;
}
