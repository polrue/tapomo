import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, makeEnv, stats } from './helpers.mjs';

test('CORS: Tauri origins allowed, any other origin refused, no Origin is fine', async () => {
  const env = makeEnv();
  for (const origin of ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']) {
    const pre = await call(env, 'OPTIONS', '/v1/stats', { origin });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('Access-Control-Allow-Origin'), origin);
    assert.match(pre.headers.get('Access-Control-Allow-Methods'), /DELETE/);
    assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Authorization/);
    const res = await call(env, 'POST', '/v1/stats', { origin, body: stats() });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  }
  for (const origin of ['https://evil.example', 'null', 'http://localhost:1420', 'https://tapomo.app']) {
    const pre = await call(env, 'OPTIONS', '/v1/stats', { origin });
    assert.equal(pre.status, 403, origin);
    assert.equal(pre.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal((await call(env, 'POST', '/v1/stats', { origin, body: stats() })).status, 403, origin);
  }
  const noOrigin = await call(env, 'POST', '/v1/stats', { origin: null, body: stats() });
  assert.equal(noOrigin.status, 204);
  assert.equal(noOrigin.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM weekly_stats')[0].n, 4);
});

test('everything else is 404', async () => {
  const env = makeEnv();
  for (const [method, path] of [
    ['GET', '/'],
    ['GET', '/v1'],
    ['GET', '/v2/stats'],
    ['GET', '/v1/stats'],
    ['PUT', '/v1/stats'],
    ['POST', '/v1/stats/'],
    ['GET', '/v1/unknown'],
    ['DELETE', '/v1/stats/percentile'],
    ['POST', '/v1/stats/percentile'],
    ['GET', '/v1/leagues'],
    ['DELETE', '/v1/leagues/ABCDEFGH'],
    ['POST', '/v1/leagues/ABCDEFGH/leave'],
    ['DELETE', '/v1/leagues/ABCDEFGH/members/someone'],
    ['GET', '/v1/leagues/ABCDEFGH/score'],
  ]) {
    const res = await call(env, method, path);
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.deepEqual(res.json, { error: 'not_found' });
  }
});

test('rate limiting: fixed window per hashed IP, 429 with Retry-After, raw IP never stored', async () => {
  const env = makeEnv({ RATE_MAX: '5', RATE_MAX_LEAGUE_WRITES: '2' });
  const ip = '198.51.100.7';
  for (let i = 0; i < 5; i++) assert.equal((await call(env, 'GET', '/v1/nothing', { ip })).status, 404);
  const limited = await call(env, 'POST', '/v1/stats', { ip, body: stats() });
  assert.equal(limited.status, 429);
  assert.deepEqual(limited.json, { error: 'rate_limited' });
  assert.ok(Number(limited.headers.get('Retry-After')) >= 1);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM weekly_stats')[0].n, 0, 'limited request did nothing');
  // Another IP is unaffected.
  assert.equal((await call(env, 'POST', '/v1/stats', { ip: '198.51.100.8', body: stats() })).status, 204);

  // Stricter bucket for creating/joining leagues.
  const ip2 = '2001:db8::1';
  assert.equal((await call(env, 'POST', '/v1/leagues', { ip: ip2, body: { name: 'L', nickname: 'a' } })).status, 201);
  assert.equal((await call(env, 'POST', '/v1/leagues', { ip: ip2, body: { name: 'L', nickname: 'a' } })).status, 201);
  assert.equal((await call(env, 'POST', '/v1/leagues', { ip: ip2, body: { name: 'L', nickname: 'a' } })).status, 429);

  const dump = JSON.stringify(env.DB.rows('SELECT * FROM rate_limits'));
  for (const raw of [ip, '198.51.100.8', ip2]) assert.ok(!dump.includes(raw));
  for (const row of env.DB.rows('SELECT bucket FROM rate_limits')) assert.match(row.bucket, /^[0-9a-f]{32}$/);
});

test('OPTIONS preflight is not rate limited and writes nothing', async () => {
  const env = makeEnv({ RATE_MAX: '1' });
  for (let i = 0; i < 5; i++) assert.equal((await call(env, 'OPTIONS', '/v1/leagues', { ip: '192.0.2.1' })).status, 204);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM rate_limits')[0].n, 0);
});
