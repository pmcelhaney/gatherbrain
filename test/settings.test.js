import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSettings,
  loadSettings
} from '../src/settings.js';

test('loads default workday settings', () => {
  assert.deepEqual(createSettings(), {
    workday: {
      start: '08:00',
      end: '18:00',
      startMinutes: 8 * 60,
      endMinutes: 18 * 60
    }
  });
});

test('loads workspace settings over defaults', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-settings-'));

  try {
    await mkdir(path.join(rootDirectory, '.gatherbrain'), { recursive: true });
    await writeFile(
      path.join(rootDirectory, '.gatherbrain', 'settings.json'),
      JSON.stringify({
        settings: {
          workday: {
            start: '07:30',
            end: '16:30'
          }
        }
      })
    );

    assert.deepEqual(await loadSettings({ rootDirectory }), {
      workday: {
        start: '07:30',
        end: '16:30',
        startMinutes: 7 * 60 + 30,
        endMinutes: 16 * 60 + 30
      }
    });
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test('rejects invalid workday settings', () => {
  assert.throws(
    () => createSettings({
      workday: {
        start: '18:00',
        end: '08:00'
      }
    }),
    /settings\.workday/u
  );
});
