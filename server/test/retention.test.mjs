import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, runCron, thisWeek, uuid } from './helpers.mjs';
import { shiftWeek } from '../src/week.js';

const ins = (env, sql, ...p) => env.DB.sqlite.prepare(sql).run(...p);

test('cron deletes stats > 26 weeks, scores > 12 weeks, abandoned leagues and old rate-limit windows', async () => {
  const env = makeEnv();
  const now = thisWeek();
  const addStats = (week) =>
    ins(env, 'INSERT INTO weekly_stats VALUES (?, ?, ?, ?, ?, ?, ?)', uuid(), week, 'es', 40, 80, 0.95, 100);
  addStats(shiftWeek(now, -27));
  addStats(shiftWeek(now, -40));
  addStats(shiftWeek(now, -26)); // exactly 26 weeks old: kept
  addStats(now);
  ins(env, 'INSERT INTO stats_histogram VALUES (?, ?, ?, ?)', shiftWeek(now, -30), 'es', 40, 99);

  // Active league: one old score, one recent.
  ins(env, 'INSERT INTO leagues VALUES (?, ?, ?)', 'ACTIVE22', 'Active', shiftWeek(now, -30));
  ins(env, 'INSERT INTO members VALUES (?, ?, ?, ?, ?, ?)', 'm-active', 'ACTIVE22', 'Ana', 'ana', 'h', shiftWeek(now, -30));
  ins(env, 'INSERT INTO league_scores VALUES (?, ?, ?)', 'm-active', shiftWeek(now, -13), 10);
  ins(env, 'INSERT INTO league_scores VALUES (?, ?, ?)', 'm-active', shiftWeek(now, -12), 20);
  ins(env, 'INSERT INTO league_scores VALUES (?, ?, ?)', 'm-active', now, 30);
  // Abandoned league: created long ago, only scores older than 12 weeks.
  ins(env, 'INSERT INTO leagues VALUES (?, ?, ?)', 'ABANDON2', 'Old', shiftWeek(now, -20));
  ins(env, 'INSERT INTO members VALUES (?, ?, ?, ?, ?, ?)', 'm-old', 'ABANDON2', 'Bea', 'bea', 'h', shiftWeek(now, -20));
  ins(env, 'INSERT INTO league_scores VALUES (?, ?, ?)', 'm-old', shiftWeek(now, -15), 10);
  // Brand-new league without scores yet: kept.
  ins(env, 'INSERT INTO leagues VALUES (?, ?, ?)', 'NEWBIE22', 'New', now);
  ins(env, 'INSERT INTO members VALUES (?, ?, ?, ?, ?, ?)', 'm-new', 'NEWBIE22', 'Cat', 'cat', 'h', now);
  // Rate-limit windows.
  const win = Math.floor(Date.now() / 1000 / 600);
  ins(env, 'INSERT INTO rate_limits VALUES (?, ?, ?)', 'old', win - 3, 7);
  ins(env, 'INSERT INTO rate_limits VALUES (?, ?, ?)', 'current', win, 7);

  await runCron(env);

  assert.deepEqual(env.DB.rows('SELECT week FROM weekly_stats ORDER BY week').map((r) => r.week), [shiftWeek(now, -26), now]);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM stats_histogram WHERE week < ?', shiftWeek(now, -26))[0].n, 0);
  assert.deepEqual(env.DB.rows('SELECT member_id, week FROM league_scores ORDER BY week'), [
    { member_id: 'm-active', week: shiftWeek(now, -12) },
    { member_id: 'm-active', week: now },
  ]);
  assert.deepEqual(env.DB.rows('SELECT code FROM leagues ORDER BY code').map((r) => r.code), ['ACTIVE22', 'NEWBIE22']);
  assert.deepEqual(env.DB.rows('SELECT id FROM members ORDER BY id').map((r) => r.id), ['m-active', 'm-new']);
  assert.deepEqual(env.DB.rows('SELECT bucket FROM rate_limits').map((r) => r.bucket), ['current']);
  // The histogram for the writable weeks was rebuilt from the surviving rows.
  assert.deepEqual(env.DB.rows('SELECT week, lang, wpm, n FROM stats_histogram'), [{ week: now, lang: 'es', wpm: 40, n: 1 }]);

  // Running it again changes nothing.
  await runCron(env);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM weekly_stats')[0].n, 2);
});

test('cron uses the scheduled time, not the wall clock', async () => {
  const env = makeEnv();
  ins(env, 'INSERT INTO weekly_stats VALUES (?, ?, ?, ?, ?, ?, ?)', uuid(), '2026-W10', 'en', 40, 80, 0.95, 100);
  await runCron(env, Date.parse('2026-03-12T10:17:00Z')); // during 2026-W11
  assert.deepEqual(env.DB.rows('SELECT week, lang, wpm, n FROM stats_histogram'), [{ week: '2026-W10', lang: 'en', wpm: 40, n: 1 }]);
});
