import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, isValidWeek, shiftWeek, weekMonday, writableWeeks } from '../src/week.js';

test('isoWeek matches ISO-8601 at year edges', () => {
  assert.equal(isoWeek(new Date('2026-01-01T12:00:00Z')), '2026-W01');
  assert.equal(isoWeek(new Date('2020-12-31T12:00:00Z')), '2020-W53');
  assert.equal(isoWeek(new Date('2021-01-03T12:00:00Z')), '2020-W53');
  assert.equal(isoWeek(new Date('2021-01-04T00:00:00Z')), '2021-W01');
  assert.equal(isoWeek(new Date('2026-10-15T12:00:00Z')), '2026-W42');
  assert.equal(isoWeek(new Date('2024-12-30T00:00:00Z')), '2025-W01');
});

test('isValidWeek rejects malformed and non-existent weeks', () => {
  assert.ok(isValidWeek('2026-W42'));
  assert.ok(isValidWeek('2020-W53'));
  assert.ok(isValidWeek('2026-W53')); // 2026 starts on a Thursday: 53 weeks
  assert.ok(!isValidWeek('2025-W53')); // 2025 has 52 weeks
  for (const w of ['2026-W00', '2026-W54', '2026W42', '2026-w42', '2026-W4', '1999-W10', '', null, 202642]) {
    assert.ok(!isValidWeek(w), String(w));
  }
});

test('weekMonday and shiftWeek cross year boundaries', () => {
  assert.equal(weekMonday('2026-W01').toISOString(), '2025-12-29T00:00:00.000Z');
  assert.equal(shiftWeek('2021-W01', -1), '2020-W53');
  assert.equal(shiftWeek('2020-W53', 1), '2021-W01');
  assert.equal(shiftWeek('2026-W42', -26), '2026-W16');
});

test('writableWeeks = current and previous week, with time-zone slack', () => {
  const midWeek = Date.parse('2026-10-15T12:00:00Z'); // Thursday
  assert.deepEqual([...writableWeeks(midWeek)].sort(), ['2026-W41', '2026-W42']);
  const mondayEarly = Date.parse('2026-10-19T02:00:00Z'); // already Monday W43 in UTC, still Sunday W42 in UTC-10
  assert.deepEqual([...writableWeeks(mondayEarly)].sort(), ['2026-W41', '2026-W42', '2026-W43']);
});
