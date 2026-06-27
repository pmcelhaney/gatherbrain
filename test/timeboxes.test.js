import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendTimebox,
  cancelTimebox,
  contextsOverlappingTime,
  parseClockTime,
  parseTimeRange,
  plannerLinesForDay,
  readTimeboxes,
  resolveContextForTime,
  resolveTimeboxContext,
  roundedPlannerMinutes,
  timeboxFilePath
} from '../src/timeboxes.js';

test('parses workday shorthand time ranges', () => {
  assert.equal(parseClockTime('9'), 9 * 60);
  assert.equal(parseClockTime('1:30'), 13 * 60 + 30);
  assert.deepEqual(parseTimeRange('9'), {
    start: '09:00',
    end: '09:30',
    startMinutes: 9 * 60,
    endMinutes: 9 * 60 + 30,
    isRange: false
  });
  assert.deepEqual(parseTimeRange('9-12'), {
    start: '09:00',
    end: '12:00',
    startMinutes: 9 * 60,
    endMinutes: 12 * 60,
    isRange: true
  });
  assert.deepEqual(parseTimeRange('1:30-3'), {
    start: '13:30',
    end: '15:00',
    startMinutes: 13 * 60 + 30,
    endMinutes: 15 * 60,
    isRange: true
  });
});

test('stores one appended TSV row per timebox', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-timeboxes-'));

  try {
    await appendTimebox(rootDirectory, {
      context: '/arb-prep',
      date: '2026-06-29',
      range: parseTimeRange('9-12')
    });
    await appendTimebox(rootDirectory, {
      context: '/arb/meetings/2026-06-29',
      date: '2026-06-29',
      range: parseTimeRange('11-11:30')
    });

    assert.equal(
      await readFile(timeboxFilePath(rootDirectory, '2026-06-29'), 'utf8'),
      '/arb-prep\t09:00\t12:00\n/arb/meetings/2026-06-29\t11:00\t11:30\n'
    );
    assert.deepEqual(
      (await readTimeboxes(rootDirectory, '2026-06-29')).map((timebox) => ({
        context: timebox.context,
        start: timebox.start,
        end: timebox.end
      })),
      [
        { context: '/arb-prep', start: '09:00', end: '12:00' },
        { context: '/arb/meetings/2026-06-29', start: '11:00', end: '11:30' }
      ]
    );
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test('resolves overlay ownership with last matching row winning', () => {
  const timeboxes = [
    {
      context: '/arb-prep',
      startMinutes: 9 * 60,
      endMinutes: 12 * 60
    },
    {
      context: '/arb/meetings/2026-06-29',
      startMinutes: 11 * 60,
      endMinutes: 11 * 60 + 30
    }
  ];

  assert.equal(resolveTimeboxContext(timeboxes, 10 * 60), '/arb-prep');
  assert.equal(resolveTimeboxContext(timeboxes, 11 * 60), '/arb/meetings/2026-06-29');
  assert.equal(resolveTimeboxContext(timeboxes, 11 * 60 + 30), '/arb-prep');
  assert.equal(resolveTimeboxContext(timeboxes, 12 * 60), '/');
});

test('renders planner timeline blocks with durations', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-timeboxes-'));

  try {
    await mkdir(path.dirname(timeboxFilePath(rootDirectory, '2026-06-29')), { recursive: true });
    await writeFile(
      timeboxFilePath(rootDirectory, '2026-06-29'),
      '/arb-prep\t09:00\t12:00\n/arb/meetings/2026-06-29\t11:00\t11:30\n/team-meeting/2026-06-29\t14:00\t15:00\n'
    );

    const lines = plannerLinesForDay(await readTimeboxes(rootDirectory, '2026-06-29'));

    assert.deepEqual(lines, [
      '  08:00  ◇  /free',
      '         ╎  1h',
      '  09:00  ○  /arb-prep',
      '         │  2h',
      '  11:00  ○  /arb/meetings/2026-06-29',
      '         │  30m',
      '  11:30  ○  /arb-prep',
      '         │  30m',
      '  12:00  ◇  /free',
      '         ╎  2h',
      '  14:00  ○  /team-meeting/2026-06-29',
      '         │  1h',
      '  15:00  ◇  /free',
      '         ╎  3h'
    ]);
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test('expands planner rows when timeboxes fall outside the workday', () => {
  const lines = plannerLinesForDay([
    {
      context: '/early',
      startMinutes: 7 * 60,
      endMinutes: 7 * 60 + 30
    },
    {
      context: '/late',
      startMinutes: 18 * 60 + 30,
      endMinutes: 19 * 60
    }
  ]);

  assert.equal(lines[0], '  07:00  ○  /early');
  assert.equal(lines[2], '  07:30  ◇  /free');
  assert.equal(lines.at(-2), '  18:30  ○  /late');
  assert.equal(lines.at(-1), '         │  30m');
});

test('uses configured workday boundaries for planner rows', () => {
  const lines = plannerLinesForDay([], {
    workday: {
      startMinutes: 9 * 60,
      endMinutes: 17 * 60
    }
  });

  assert.deepEqual(lines, [
    '  09:00  ◇  /free',
    '         ╎  8h'
  ]);
});

test('marks the current rounded planner row', () => {
  assert.equal(roundedPlannerMinutes(new Date(2026, 5, 29, 9, 7)), 9 * 60);
  assert.equal(roundedPlannerMinutes(new Date(2026, 5, 29, 9, 8)), 9 * 60 + 15);

  assert.deepEqual(plannerLinesForDay([], {
    currentMinutes: 9 * 60 + 15,
    workday: {
      startMinutes: 9 * 60,
      endMinutes: 10 * 60
    }
  }), [
    '  09:00  ◇  /free',
    '> 09:15  ╎  now',
    '         ╎  1h'
  ]);

  assert.deepEqual(plannerLinesForDay([], {
    currentMinutes: 9 * 60,
    workday: {
      startMinutes: 9 * 60,
      endMinutes: 9 * 60 + 30
    }
  }), [
    '> 09:00  ●  /free',
    '         ╎  30m'
  ]);
});

test('cancels matching rows and completes overlapping contexts', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-timeboxes-'));

  try {
    await mkdir(path.dirname(timeboxFilePath(rootDirectory, '2026-06-29')), { recursive: true });
    await writeFile(
      timeboxFilePath(rootDirectory, '2026-06-29'),
      '/arb-prep\t09:00\t12:00\n/arb/meetings/2026-06-29\t11:00\t11:30\n'
    );

    assert.deepEqual(await contextsOverlappingTime(rootDirectory, {
      date: '2026-06-29',
      range: parseTimeRange('11')
    }), ['/arb-prep', '/arb/meetings/2026-06-29']);

    const result = await cancelTimebox(rootDirectory, {
      context: '/arb/meetings/2026-06-29',
      date: '2026-06-29',
      range: parseTimeRange('11')
    });

    assert.deepEqual(result.cancelled.map((timebox) => timebox.context), ['/arb/meetings/2026-06-29']);
    assert.equal(
      await readFile(timeboxFilePath(rootDirectory, '2026-06-29'), 'utf8'),
      '/arb-prep\t09:00\t12:00\n'
    );
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test('resolves current context for a date and time', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-timeboxes-'));

  try {
    await mkdir(path.dirname(timeboxFilePath(rootDirectory, '2026-06-29')), { recursive: true });
    await writeFile(
      timeboxFilePath(rootDirectory, '2026-06-29'),
      '/arb-prep\t09:00\t12:00\n'
    );

    assert.equal(await resolveContextForTime(rootDirectory, {
      date: '2026-06-29',
      now: new Date(2026, 5, 29, 9, 15)
    }), '/arb-prep');
    assert.equal(await resolveContextForTime(rootDirectory, {
      date: '2026-06-29',
      now: new Date(2026, 5, 29, 12, 0)
    }), '/');
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});
