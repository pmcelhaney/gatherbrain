import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addEnumValue,
  createEnumRegistry,
  enumValues,
  hasEnumValue,
  loadEnumRegistry
} from '../src/enums.js';

test('creates enum registries from string values', () => {
  const registry = createEnumRegistry({
    status: {
      values: ['todo', 'waiting']
    }
  });

  assert.deepEqual(enumValues('status', registry), ['todo', 'waiting']);
  assert.equal(hasEnumValue('status', 'todo', registry), true);
  assert.equal(hasEnumValue('status', 'done', registry), false);
});

test('loads default enum definitions from config', async () => {
  const registry = await loadEnumRegistry();

  assert.deepEqual(enumValues('factType', registry), ['fact', 'todo', 'waiting', 'in progress', 'done']);
});

test('loads workspace enum definitions over defaults', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-enums-'));

  try {
    await mkdir(path.join(rootDirectory, '.gatherbrain'), { recursive: true });
    await writeFile(
      path.join(rootDirectory, '.gatherbrain', 'enums.json'),
      JSON.stringify({
        enums: {
          status: {
            values: ['todo', 'waiting']
          }
        }
      })
    );

    const registry = await loadEnumRegistry({ rootDirectory });

    assert.deepEqual(enumValues('status', registry), ['todo', 'waiting']);
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test('adds enum values to workspace config while preserving default values', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-enums-'));

  try {
    assert.equal(
      await addEnumValue({
        rootDirectory,
        enumName: 'factType',
        value: 'blocked'
      }),
      'blocked'
    );

    const registry = await loadEnumRegistry({ rootDirectory });
    assert.deepEqual(enumValues('factType', registry), ['fact', 'todo', 'waiting', 'in progress', 'done', 'blocked']);

    const config = JSON.parse(await readFile(path.join(rootDirectory, '.gatherbrain', 'enums.json'), 'utf8'));
    assert.deepEqual(config.enums.factType.values, ['fact', 'todo', 'waiting', 'in progress', 'done', 'blocked']);
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});
