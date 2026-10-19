import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { auth, call, makeEnv, thisWeek, lastWeek } from './helpers.mjs';
import { CODE_ALPHABET } from '../src/index.js';
import { shiftWeek } from '../src/week.js';

const create = (env, name = 'Liga de la oficina', nickname = 'Pol') => call(env, 'POST', '/v1/leagues', { body: { name, nickname } });
const join = (env, code, nickname) => call(env, 'POST', `/v1/leagues/${code}/join`, { body: { nickname } });
const score = (env, code, m, xp, week = thisWeek()) =>
  call(env, 'POST', `/v1/leagues/${code}/score`, { body: { member_id: m.member_id, member_secret: m.member_secret, week, xp } });
const view = (env, code, m, qs = '') => call(env, 'GET', `/v1/leagues/${code}${qs}`, { headers: m ? auth(m) : {} });

test('POST /v1/leagues creates a league; the creator joins; only the secret hash is stored', async () => {
  const env = makeEnv();
  const res = await create(env, '  Liga   de la oficina ');
  assert.equal(res.status, 201);
  const { code, member_id, member_secret } = res.json;
  assert.match(code, new RegExp(`^[${CODE_ALPHABET}]{8}$`));
  assert.doesNotMatch(CODE_ALPHABET, /[01ILOU]/);
  assert.match(member_id, /^[0-9a-f-]{36}$/);
  assert.match(member_secret, /^[A-Za-z0-9_-]{43}$/);

  const [league] = env.DB.rows('SELECT * FROM leagues');
  assert.equal(league.name, 'Liga de la oficina');
  const [member] = env.DB.rows('SELECT * FROM members');
  assert.equal(member.nickname, 'Pol');
  assert.equal(member.secret_hash, createHash('sha256').update(member_secret).digest('hex'));
  const dump = JSON.stringify(env.DB.rows('SELECT * FROM members'));
  assert.ok(!dump.includes(member_secret), 'secret never stored in clear');
});

test('POST /v1/leagues validates name and nickname', async () => {
  const env = makeEnv();
  for (const [body, error] of [
    [{ name: 'x'.repeat(41), nickname: 'Pol' }, 'invalid_name'],
    [{ name: '   ', nickname: 'Pol' }, 'invalid_name'],
    [{ name: 'Liga', nickname: 'x'.repeat(25) }, 'invalid_nickname'],
    [{ name: 'Liga', nickname: 'Po\u0000l' }, 'invalid_nickname'],
    [{ name: 'Liga', nickname: 'Po‮l' }, 'invalid_nickname'], // bidi override
    [{ name: 'Liga', nickname: 42 }, 'invalid_nickname'],
    [{ name: 'Liga' }, 'missing_field:nickname'],
    [{ name: 'Liga', nickname: 'Pol', email: 'x' }, 'unknown_field:email'],
  ]) {
    const res = await call(env, 'POST', '/v1/leagues', { body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(res.json, { error });
  }
  // 24 characters (emoji count as one) is fine.
  assert.equal((await create(env, 'Liga', '😀'.repeat(24))).status, 201);
});

test('join: nickname unique per league (case-insensitive), codes case-insensitive, unknown → 404', async () => {
  const env = makeEnv();
  const a = (await create(env, 'A', 'Ana')).json;
  const b = (await create(env, 'B', 'Ana')).json; // same nickname in another league is fine
  assert.ok(b.code);

  let res = await join(env, a.code.toLowerCase(), 'Bea');
  assert.equal(res.status, 201);
  assert.ok(res.json.member_id && res.json.member_secret);
  assert.equal(res.json.code, undefined);

  for (const nick of ['ANA', ' ana ', 'Ａｎａ' /* full-width */]) {
    res = await join(env, a.code, nick);
    assert.equal(res.status, 409, nick);
    assert.deepEqual(res.json, { error: 'nickname_taken' });
  }
  assert.equal((await join(env, 'ZZZZZZZZ', 'Pol')).status, 404);
  assert.equal((await join(env, 'ABC', 'Pol')).status, 404); // malformed
  assert.equal((await join(env, 'OOOOOOOO', 'Pol')).status, 404); // outside the alphabet
  assert.equal((await join(env, a.code, '')).status, 400);
});

test('join: a league holds at most 50 members', async () => {
  const env = makeEnv();
  const { code } = (await create(env, 'Grande', 'm0')).json;
  for (let i = 1; i < 50; i++) assert.equal((await join(env, code, `m${i}`)).status, 201, `m${i}`);
  const res = await join(env, code, 'm50');
  assert.equal(res.status, 409);
  assert.deepEqual(res.json, { error: 'league_full' });
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM members')[0].n, 50);
});

test('score: auth, plausibility, writable weeks, upsert', async () => {
  const env = makeEnv();
  const { code, ...pol } = (await create(env)).json;
  const other = (await create(env, 'Otra', 'Xavi')).json;

  assert.equal((await score(env, code, pol, 300)).status, 204);
  assert.equal((await score(env, code, pol, 450)).status, 204);
  assert.equal((await score(env, code, pol, 120, lastWeek())).status, 204);
  assert.deepEqual(env.DB.rows('SELECT week, xp FROM league_scores ORDER BY week'), [
    { week: lastWeek(), xp: 120 },
    { week: thisWeek(), xp: 450 },
  ]);

  assert.equal((await score(env, code, { ...pol, member_secret: 'A'.repeat(43) }, 10)).status, 401);
  assert.equal((await score(env, code, { ...pol, member_secret: 'short' }, 10)).status, 401);
  assert.equal((await score(env, code, { member_id: other.member_id, member_secret: other.member_secret }, 10)).status, 401);
  assert.equal((await score(env, 'ZZZZZZZZ', pol, 10)).status, 404);
  assert.deepEqual((await score(env, code, pol, 7 * 800 + 1)).json, { error: 'implausible_xp' });
  assert.deepEqual((await score(env, code, pol, -1)).json, { error: 'implausible_xp' });
  assert.deepEqual((await score(env, code, pol, 10.5)).json, { error: 'invalid_xp' });
  assert.deepEqual((await score(env, code, pol, 10, shiftWeek(thisWeek(), -3))).json, { error: 'week_not_writable' });
  assert.deepEqual((await score(env, code, pol, 10, shiftWeek(thisWeek(), 2))).json, { error: 'week_not_writable' });
  assert.equal((await score(env, code, pol, 5600)).status, 204);
});

test('GET league: members only, sorted by xp, `up` when beating their own previous week', async () => {
  const env = makeEnv();
  const { code, ...pol } = (await create(env)).json;
  const ana = (await join(env, code, 'Ana')).json;
  const bea = (await join(env, code, 'bea')).json;
  const carl = (await join(env, code, 'Carl')).json;
  const outsider = (await create(env, 'Otra', 'Out')).json;

  await score(env, code, pol, 200, lastWeek());
  await score(env, code, pol, 300); // improved
  await score(env, code, ana, 900, lastWeek());
  await score(env, code, ana, 500); // went down
  await score(env, code, bea, 300); // no previous week → not "up"
  // carl: nothing this week → xp 0

  let res = await view(env, code, pol);
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, {
    name: 'Liga de la oficina',
    week: thisWeek(),
    members: [
      { nickname: 'Ana', xp: 500, up: false },
      { nickname: 'bea', xp: 300, up: false },
      { nickname: 'Pol', xp: 300, up: true },
      { nickname: 'Carl', xp: 0, up: false },
    ],
  });

  // Past week view compares with the week before it.
  env.DB.rows('INSERT INTO league_scores (member_id, week, xp) VALUES (?, ?, ?) RETURNING 1', ana.member_id, shiftWeek(thisWeek(), -2), 100);
  res = await view(env, code.toLowerCase(), carl, `?week=${lastWeek()}`);
  assert.equal(res.status, 200);
  assert.equal(res.json.week, lastWeek());
  assert.deepEqual(res.json.members[0], { nickname: 'Ana', xp: 900, up: true });

  assert.equal((await view(env, code, pol, '?week=2026-W99')).status, 400);
  assert.equal((await view(env, code, null)).status, 401);
  assert.equal((await view(env, code, outsider)).status, 401);
  assert.equal((await view(env, code, { ...pol, member_secret: 'B'.repeat(43) })).status, 401);
  assert.equal((await call(env, 'GET', `/v1/leagues/${code}`, { headers: { Authorization: `Basic ${pol.member_id}` } })).status, 401);
  assert.equal((await view(env, 'ZZZZZZZZ', pol)).status, 404);
});

test('DELETE /members/me removes the member and their scores; the last one out deletes the league', async () => {
  const env = makeEnv();
  const { code, ...pol } = (await create(env)).json;
  const ana = (await join(env, code, 'Ana')).json;
  await score(env, code, pol, 100);
  await score(env, code, ana, 200);

  assert.equal((await call(env, 'DELETE', `/v1/leagues/${code}/members/me`)).status, 401);
  assert.equal((await call(env, 'DELETE', `/v1/leagues/${code}/members/me`, { headers: auth(ana) })).status, 204);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM members WHERE id = ?', ana.member_id)[0].n, 0);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM league_scores WHERE member_id = ?', ana.member_id)[0].n, 0);
  assert.equal((await view(env, code, ana)).status, 401, 'old credentials no longer work');
  assert.deepEqual((await view(env, code, pol)).json.members.map((m) => m.nickname), ['Pol']);
  // The nickname is free again.
  assert.equal((await join(env, code, 'ana')).status, 201);
  const ana2 = env.DB.rows("SELECT id FROM members WHERE nickname = 'ana'")[0];
  env.DB.rows('DELETE FROM members WHERE id = ? RETURNING 1', ana2.id);

  assert.equal((await call(env, 'DELETE', `/v1/leagues/${code}/members/me`, { headers: auth(pol) })).status, 204);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM leagues')[0].n, 0);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM league_scores')[0].n, 0);
  assert.equal((await view(env, code, pol)).status, 404);
});
