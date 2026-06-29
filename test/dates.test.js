import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDateArgument,
  formatFriendlyDate,
  parseDateArgument
} from '../src/dates.js';

const today = new Date(2026, 5, 24, 12);

test('formats dates as yyyy-mm-dd', () => {
  assert.equal(formatDateArgument(today), '2026-06-24');
});

test('formats friendly due dates near today', () => {
  assert.equal(formatFriendlyDate('2026-06-24', { today }), 'today');
  assert.equal(formatFriendlyDate('2026-06-25', { today }), 'tomorrow');
  assert.equal(formatFriendlyDate('2026-06-26', { today }), 'Friday');
  assert.equal(formatFriendlyDate('2026-07-02', { today }), 'Jul 2');
});

test('parses natural language date arguments', () => {
  assert.equal(parseDateArgument('today', { today }), '2026-06-24');
  assert.equal(parseDateArgument('Tomorrow', { today }), '2026-06-25');
  assert.equal(parseDateArgument('yesterday', { today }), '2026-06-23');
  assert.equal(parseDateArgument('in 2 days', { today }), '2026-06-26');
  assert.equal(parseDateArgument('in 2 weeks', { today }), '2026-07-08');
});

test('parses calendar date arguments', () => {
  assert.equal(parseDateArgument('2026-07-04', { today }), '2026-07-04');
  assert.equal(parseDateArgument('7/4/2026', { today }), '2026-07-04');
  assert.equal(parseDateArgument('7/4/26', { today }), '2026-07-04');
  assert.equal(parseDateArgument('2026-02-30', { today }), null);
});

test('parses weekday date arguments', () => {
  assert.equal(parseDateArgument('wednesday', { today }), '2026-06-24');
  assert.equal(parseDateArgument('friday', { today }), '2026-06-26');
  assert.equal(parseDateArgument('next wednesday', { today }), '2026-07-01');
});
