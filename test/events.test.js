import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eventLogFilePath,
  logEvent
} from '../src/events.js';
import {
  createPromptState,
  handleEntry
} from '../src/index.js';

test('logs events to one TSV file per date', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-events-'));

  try {
    await logEvent({
      rootDirectory,
      now: () => new Date('2026-06-27T13:14:15.016Z')
    }, 'fact.created', {
      factId: 'todo.md',
      uuid: '11111111-1111-4111-8111-111111111111'
    });

    assert.equal(
      await readFile(eventLogFilePath(rootDirectory, '2026-06-27'), 'utf8'),
      '2026-06-27T13:14:15.016Z\tfact.created\t{"factId":"todo.md","uuid":"11111111-1111-4111-8111-111111111111"}\n'
    );
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test('commands append action events', async () => {
  const appDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-events-'));
  const rootDirectory = path.join(appDirectory, 'facts');

  try {
    const state = createPromptState({
      appDirectory,
      rootDirectory,
      now: () => new Date('2026-06-27T13:14:15.016Z')
    });

    await handleEntry('Call Steve', state);

    const rows = (await readFile(eventLogFilePath(rootDirectory, '2026-06-27'), 'utf8'))
      .trimEnd()
      .split('\n');
    const [timestamp, event, metadata] = rows.at(-1).split('\t');
    const parsedMetadata = JSON.parse(metadata);

    assert.equal(timestamp, '2026-06-27T13:14:15.016Z');
    assert.equal(event, 'fact.created');
    assert.deepEqual(parsedMetadata, {
      factId: 'call-steve.md',
      uuid: parsedMetadata.uuid,
      contextId: '/',
      title: 'Call Steve',
      type: 'fact'
    });
    assert.match(parsedMetadata.uuid, /^[0-9a-f-]{36}$/u);
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
});
