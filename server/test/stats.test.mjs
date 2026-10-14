import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, makeEnv, runCron, stats, thisWeek, lastWeek, uuid } from './helpers.mjs';
import { shiftWeek } from '../src/week.js';

test('POST /v1/stats stores one row per install and week (upsert)', async () => {
  const env = makeEnv();
  const s = stats({ install_id: uuid().toUpperCase() });
  assert.equal((await call(env, 'POST', '/v1/stats', { body: s })).status, 204);
  assert.equal((await call(env, 'POST', '/v1/stats', { body: { ...s, avg_wpm: 50, lang: 'en' } })).status, 204);
  assert.equal((await call(env, 'POST', '/v1/stats', { body: { ...s, week: lastWeek() } })).status, 204);
  const rows = env.DB.rows('SELECT * FROM weekly_stats ORDER BY week DESC');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].install_id, s.install_id.toLowerCase());
  assert.equal(rows[0].avg_wpm, 50);
  assert.equal(rows[0].lang, 'en');
  assert.deepEqual(Object.keys(rows[0]).sort(), ['accuracy', 'active_min', 'avg_wpm', 'install_id', 'lang', 'peak_wpm', 'week']);
});

test('POST /v1/stats validates every field and plausibility', async () => {
  const env = makeEnv();
  const cases = [
    [{ install_id: 'not-a-uuid' }, 'invalid_install_id'],
    [{ install_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' }, 'invalid_install_id'], // v1, not v4
    [{ week: '2026-42' }, 'invalid_week'],
    [{ week: '2025-W53' }, 'invalid_week'],
    [{ week: shiftWeek(thisWeek(), -3) }, 'week_not_writable'],
    [{ week: shiftWeek(thisWeek(), 2) }, 'week_not_writable'],
    [{ lang: 'fr' }, 'invalid_lang'],
    [{ avg_wpm: 251, peak_wpm: 300 }, 'implausible_avg_wpm'],
    [{ avg_wpm: -1 }, 'implausible_avg_wpm'],
    [{ avg_wpm: '40' }, 'invalid_avg_wpm'],
    [{ peak_wpm: 301 }, 'implausible_peak_wpm'],
    [{ avg_wpm: 90, peak_wpm: 80 }, 'implausible_avg_wpm'],
    [{ accuracy: 1.01 }, 'implausible_accuracy'],
    [{ accuracy: null }, 'invalid_accuracy'],
    [{ active_min: 7 * 24 * 60 + 1 }, 'implausible_active_min'],
    [{ active_min: 10.5 }, 'invalid_active_min'],
    [{ email: 'a@b.c' }, 'unknown_field:email'],
  ];
  for (const [patch, error] of cases) {
    const res = await call(env, 'POST', '/v1/stats', { body: stats(patch) });
    assert.equal(res.status, 400, JSON.stringify(patch));
    assert.deepEqual(res.json, { error }, JSON.stringify(patch));
  }
  const missing = stats();
  delete missing.accuracy;
  assert.deepEqual((await call(env, 'POST', '/v1/stats', { body: missing })).json, { error: 'missing_field:accuracy' });
  assert.equal((await call(env, 'POST', '/v1/stats', { body: [] })).status, 400);
  assert.equal((await call(env, 'POST', '/v1/stats', { raw: '{nope', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await call(env, 'POST', '/v1/stats', { raw: JSON.stringify(stats()), headers: { 'Content-Type': 'text/plain' } })).status, 415);
  const big = await call(env, 'POST', '/v1/stats', { raw: JSON.stringify({ ...stats(), pad: 'x'.repeat(3000) }), headers: { 'Content-Type': 'application/json' } });
  assert.equal(big.status, 413);
  // Boundaries are accepted.
  assert.equal((await call(env, 'POST', '/v1/stats', { body: stats({ avg_wpm: 250, peak_wpm: 300, accuracy: 1, active_min: 10080 }) })).status, 204);
  assert.equal((await call(env, 'POST', '/v1/stats', { body: stats({ avg_wpm: 0, peak_wpm: 0, accuracy: 0, active_min: 0 }) })).status, 204);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM weekly_stats')[0].n, 2);
});

test('GET /v1/stats/percentile needs a sample of 30 and answers from the hourly histogram', async () => {
  const env = makeEnv();
  const week = thisWeek();
  for (let i = 0; i < 29; i++) {
    await call(env, 'POST', '/v1/stats', { body: stats({ avg_wpm: 10 + i, peak_wpm: 100 }) });
  }
  await runCron(env);
  const q = (avg, lang = 'es', w = week) => call(env, 'GET', `/v1/stats/percentile?lang=${lang}&week=${w}&avg_wpm=${avg}`);

  let res = await q(30);
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { percent: null });

  for (let i = 29; i < 40; i++) {
    await call(env, 'POST', '/v1/stats', { body: stats({ avg_wpm: 10 + i, peak_wpm: 100 }) });
  }
  assert.deepEqual((await q(30)).json, { percent: null }, 'not visible before the cron rebuilds the histogram');
  await runCron(env);

  assert.deepEqual((await q(30)).json, { percent: 50, sample: 40 }); // 20 of 40 below 30 wpm
  assert.deepEqual((await q(30.9)).json, { percent: 50, sample: 40 }); // whole-wpm buckets, rounded down
  assert.deepEqual((await q(5)).json, { percent: 0, sample: 40 });
  assert.deepEqual((await q(250)).json, { percent: 100, sample: 40 });
  assert.deepEqual((await q(30, 'en')).json, { percent: null });
  assert.deepEqual((await q(30, 'es', lastWeek())).json, { percent: null });
  // Asking never stores anything.
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM weekly_stats')[0].n, 40);
});

test('GET /v1/stats/percentile validates its query', async () => {
  const env = makeEnv();
  const w = thisWeek();
  for (const qs of [
    `lang=fr&week=${w}&avg_wpm=30`,
    `week=${w}&avg_wpm=30`,
    `lang=es&week=nope&avg_wpm=30`,
    `lang=es&avg_wpm=30`,
    `lang=es&week=${w}&avg_wpm=abc`,
    `lang=es&week=${w}&avg_wpm=-3`,
    `lang=es&week=${w}&avg_wpm=251`,
    `lang=es&week=${w}`,
  ]) {
    assert.equal((await call(env, 'GET', `/v1/stats/percentile?${qs}`)).status, 400, qs);
  }
});

test('DELETE /v1/stats/:install_id removes every row of that install only', async () => {
  const env = makeEnv();
  const mine = uuid();
  const other = uuid();
  await call(env, 'POST', '/v1/stats', { body: stats({ install_id: mine }) });
  await call(env, 'POST', '/v1/stats', { body: stats({ install_id: mine, week: lastWeek() }) });
  await call(env, 'POST', '/v1/stats', { body: stats({ install_id: other }) });
  const res = await call(env, 'DELETE', `/v1/stats/${mine.toUpperCase()}`);
  assert.equal(res.status, 204);
  assert.equal(res.json, null);
  const rows = env.DB.rows('SELECT install_id FROM weekly_stats');
  assert.deepEqual(rows.map((r) => r.install_id), [other]);
  // Idempotent, and validated.
  assert.equal((await call(env, 'DELETE', `/v1/stats/${mine}`)).status, 204);
  assert.equal((await call(env, 'DELETE', '/v1/stats/123')).status, 400);
});
