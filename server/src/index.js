// Tapomo API — opt-in anonymous weekly stats and friends leagues.
// Cloudflare Workers (ES module) + D1. No accounts, no emails, no raw IPs.
//
// Privacy rules this file must keep (see server/README.md):
//  - stats are keyed by a random install id the client generates; nothing links it to a person;
//  - league members are a nickname plus a secret whose SHA-256 is the only thing stored;
//  - IPs are only used, salted and hashed per time window, to rate-limit; they are never stored raw;
//  - everything is deletable on request and expires on its own (see `scheduled`).

import { isoWeek, isValidWeek, shiftWeek, writableWeeks } from './week.js';

// ---------------------------------------------------------------- limits

export const LIMITS = {
  maxBodyBytes: 2048,
  maxAvgWpm: 250,
  maxPeakWpm: 300,
  maxActiveMin: 7 * 24 * 60,
  maxXp: 7 * 800,
  maxNickname: 24,
  maxLeagueName: 40,
  maxMembers: 50,
  minPercentileSample: 30,
  statsRetentionWeeks: 26,
  scoresRetentionWeeks: 12,
};

// Fixed-window rate limits per hashed IP. Overridable with [vars] in wrangler.toml.
const RATE_DEFAULTS = {
  RATE_WINDOW_SEC: 600, // 10 minutes
  RATE_MAX: 120, // any request
  RATE_MAX_LEAGUE_WRITES: 20, // creating or joining leagues
};

const ALLOWED_ORIGINS = new Set(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']);

// League codes: 8 chars without look-alikes (0/O, 1/I/L) nor U (avoids accidental words):
// 30 symbols → 30^8 ≈ 6.6·10^11 codes, generated with crypto.getRandomValues.
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{8}$`);
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url without padding
const LANGS = new Set(['es', 'en']);

// ---------------------------------------------------------------- responses

class HttpError extends Error {
  constructor(status, code, headers = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

const bad = (code) => new HttpError(400, code);

function corsHeaders(origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function respond(status, body, origin, extra = {}) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
    ...corsHeaders(origin),
    ...extra,
  };
  if (body === null) return new Response(null, { status, headers });
  headers['Content-Type'] = 'application/json; charset=utf-8';
  return new Response(JSON.stringify(body), { status, headers });
}

// ---------------------------------------------------------------- crypto helpers

const enc = new TextEncoder();

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomCode() {
  // Rejection sampling keeps every symbol equally likely.
  const n = CODE_ALPHABET.length;
  const limit = 256 - (256 % n);
  let code = '';
  while (code.length < 8) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < limit && code.length < 8) code += CODE_ALPHABET[b % n];
    }
  }
  return code;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------- input validation

async function readJson(request, allowedKeys) {
  const type = request.headers.get('Content-Type') || '';
  if (!/^application\/json\s*(;|$)/i.test(type)) throw new HttpError(415, 'json_required');
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > LIMITS.maxBodyBytes) throw new HttpError(413, 'body_too_large');
  const raw = await request.arrayBuffer();
  if (raw.byteLength > LIMITS.maxBodyBytes) throw new HttpError(413, 'body_too_large');
  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    throw bad('invalid_json');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw bad('invalid_json');
  for (const key of Object.keys(body)) {
    if (!allowedKeys.includes(key)) throw bad(`unknown_field:${key}`);
  }
  for (const key of allowedKeys) {
    if (!(key in body)) throw bad(`missing_field:${key}`);
  }
  return body;
}

function num(value, field, min, max, { integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw bad(`invalid_${field}`);
  if (integer && !Number.isInteger(value)) throw bad(`invalid_${field}`);
  if (value < min || value > max) throw bad(`implausible_${field}`);
  return value;
}

/** Trim, NFC-normalise, collapse spaces; rejects control/format/unassigned chars. */
function text(value, field, maxChars) {
  if (typeof value !== 'string') throw bad(`invalid_${field}`);
  const clean = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  const chars = [...clean].length;
  if (chars === 0 || chars > maxChars || /\p{C}/u.test(clean)) throw bad(`invalid_${field}`);
  return clean;
}

const nicknameKey = (nickname) => nickname.normalize('NFKC').toLowerCase();

function week(value, nowMs, { writable = false } = {}) {
  if (!isValidWeek(value)) throw bad('invalid_week');
  if (writable && !writableWeeks(nowMs).has(value)) throw bad('week_not_writable');
  return value;
}

function leagueCode(raw) {
  const code = String(raw).toUpperCase();
  if (!CODE_RE.test(code)) throw new HttpError(404, 'not_found');
  return code;
}

// ---------------------------------------------------------------- rate limiting

function rateConfig(env) {
  const out = {};
  for (const [k, v] of Object.entries(RATE_DEFAULTS)) {
    const n = Number(env[k]);
    out[k] = Number.isFinite(n) && n > 0 ? n : v;
  }
  return out;
}

/**
 * Fixed-window counter in D1. The bucket key is SHA-256(salt | bucket | window | ip):
 * it changes every window and cannot be reversed to an IP without the salt.
 * Rows from past windows are deleted by the cron.
 */
async function rateLimit(env, request, bucket, max, nowMs) {
  const cfg = rateConfig(env);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const window = Math.floor(nowMs / 1000 / cfg.RATE_WINDOW_SEC);
  const salt = env.RATE_LIMIT_SALT || 'tapomo-dev-salt-set-a-secret-in-production';
  const key = (await sha256Hex(`${salt}|${bucket}|${window}|${ip}`)).slice(0, 32);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, win, hits) VALUES (?, ?, 1)
     ON CONFLICT (bucket, win) DO UPDATE SET hits = hits + 1
     RETURNING hits`,
  )
    .bind(key, window)
    .first();
  if (row && row.hits > max) {
    const retry = (window + 1) * cfg.RATE_WINDOW_SEC - Math.floor(nowMs / 1000);
    throw new HttpError(429, 'rate_limited', { 'Retry-After': String(Math.max(1, retry)) });
  }
}

// ---------------------------------------------------------------- auth

async function authMember(env, code, memberId, secret) {
  if (typeof memberId !== 'string' || typeof secret !== 'string') throw new HttpError(401, 'unauthorized');
  if (!UUID_V4_RE.test(memberId) || !SECRET_RE.test(secret)) throw new HttpError(401, 'unauthorized');
  const member = await env.DB.prepare('SELECT id, secret_hash FROM members WHERE id = ? AND league_code = ?')
    .bind(memberId, code)
    .first();
  const hash = await sha256Hex(secret);
  if (!member || !timingSafeEqual(hash, member.secret_hash)) throw new HttpError(401, 'unauthorized');
  return member.id;
}

function bearer(request) {
  const header = request.headers.get('Authorization') || '';
  const m = /^Bearer ([^.\s]+)\.(\S+)$/.exec(header);
  return m ? { memberId: m[1], secret: m[2] } : { memberId: null, secret: null };
}

async function leagueExists(env, code) {
  return !!(await env.DB.prepare('SELECT 1 AS ok FROM leagues WHERE code = ?').bind(code).first());
}

// ---------------------------------------------------------------- handlers: stats

async function postStats(env, request, nowMs) {
  const b = await readJson(request, ['install_id', 'week', 'lang', 'avg_wpm', 'peak_wpm', 'accuracy', 'active_min']);
  if (typeof b.install_id !== 'string' || !UUID_V4_RE.test(b.install_id.toLowerCase())) throw bad('invalid_install_id');
  const w = week(b.week, nowMs, { writable: true });
  if (!LANGS.has(b.lang)) throw bad('invalid_lang');
  const avg = num(b.avg_wpm, 'avg_wpm', 0, LIMITS.maxAvgWpm);
  const peak = num(b.peak_wpm, 'peak_wpm', 0, LIMITS.maxPeakWpm);
  if (avg > peak) throw bad('implausible_avg_wpm');
  const accuracy = num(b.accuracy, 'accuracy', 0, 1);
  const minutes = num(b.active_min, 'active_min', 0, LIMITS.maxActiveMin, { integer: true });

  await env.DB.prepare(
    `INSERT INTO weekly_stats (install_id, week, lang, avg_wpm, peak_wpm, accuracy, active_min)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (install_id, week) DO UPDATE SET
       lang = excluded.lang, avg_wpm = excluded.avg_wpm, peak_wpm = excluded.peak_wpm,
       accuracy = excluded.accuracy, active_min = excluded.active_min`,
  )
    .bind(b.install_id.toLowerCase(), w, b.lang, avg, peak, accuracy, minutes)
    .run();
  return null;
}

async function getPercentile(env, url) {
  const p = url.searchParams;
  const lang = p.get('lang');
  if (!LANGS.has(lang)) throw bad('invalid_lang');
  const w = week(p.get('week'));
  const rawAvg = p.get('avg_wpm');
  if (rawAvg === null || !/^\d{1,3}(\.\d{1,3})?$/.test(rawAvg)) throw bad('invalid_avg_wpm');
  const avg = num(Number(rawAvg), 'avg_wpm', 0, LIMITS.maxAvgWpm);

  // Reads the hourly histogram (≤ 251 rows), never the raw table: keeps D1 reads tiny.
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(n), 0) AS sample,
            COALESCE(SUM(CASE WHEN wpm < ? THEN n ELSE 0 END), 0) AS lower
     FROM stats_histogram WHERE week = ? AND lang = ?`,
  )
    .bind(Math.floor(avg), w, lang)
    .first();
  const sample = Number(row?.sample || 0);
  if (sample < LIMITS.minPercentileSample) return { percent: null };
  // Floor: never tell someone they are faster than they are.
  return { percent: Math.floor((100 * Number(row.lower)) / sample), sample };
}

async function deleteStats(env, installId) {
  const id = installId.toLowerCase();
  if (!UUID_V4_RE.test(id)) throw bad('invalid_install_id');
  await env.DB.prepare('DELETE FROM weekly_stats WHERE install_id = ?').bind(id).run();
  return null;
}

// ---------------------------------------------------------------- handlers: leagues

async function insertMember(env, code, nickname, nowMs) {
  const id = crypto.randomUUID();
  const secret = randomSecret();
  const key = nicknameKey(nickname);
  // Cap and nickname uniqueness are checked in the same statement as the insert.
  const res = await env.DB.prepare(
    `INSERT INTO members (id, league_code, nickname, nickname_key, secret_hash, joined_week)
     SELECT ?, ?, ?, ?, ?, ?
     WHERE EXISTS (SELECT 1 FROM leagues WHERE code = ?)
       AND (SELECT COUNT(*) FROM members WHERE league_code = ?) < ?
       AND NOT EXISTS (SELECT 1 FROM members WHERE league_code = ? AND nickname_key = ?)`,
  )
    .bind(id, code, nickname, key, await sha256Hex(secret), isoWeek(new Date(nowMs)), code, code, LIMITS.maxMembers, code, key)
    .run();
  if (res.meta.changes === 1) return { member_id: id, member_secret: secret };

  if (!(await leagueExists(env, code))) throw new HttpError(404, 'not_found');
  const taken = await env.DB.prepare('SELECT 1 AS ok FROM members WHERE league_code = ? AND nickname_key = ?')
    .bind(code, key)
    .first();
  if (taken) throw new HttpError(409, 'nickname_taken');
  throw new HttpError(409, 'league_full');
}

async function createLeague(env, request, nowMs) {
  const b = await readJson(request, ['name', 'nickname']);
  const name = text(b.name, 'name', LIMITS.maxLeagueName);
  const nickname = text(b.nickname, 'nickname', LIMITS.maxNickname);
  let code = null;
  for (let attempt = 0; attempt < 5 && !code; attempt++) {
    const candidate = randomCode();
    const res = await env.DB.prepare(
      'INSERT INTO leagues (code, name, created_week) VALUES (?, ?, ?) ON CONFLICT (code) DO NOTHING',
    )
      .bind(candidate, name, isoWeek(new Date(nowMs)))
      .run();
    if (res.meta.changes === 1) code = candidate;
  }
  if (!code) throw new HttpError(503, 'try_again');
  const member = await insertMember(env, code, nickname, nowMs);
  return [201, { code, ...member }];
}

async function joinLeague(env, request, code, nowMs) {
  const b = await readJson(request, ['nickname']);
  const nickname = text(b.nickname, 'nickname', LIMITS.maxNickname);
  return [201, await insertMember(env, code, nickname, nowMs)];
}

async function postScore(env, request, code, nowMs) {
  const b = await readJson(request, ['member_id', 'member_secret', 'week', 'xp']);
  if (!(await leagueExists(env, code))) throw new HttpError(404, 'not_found');
  const memberId = await authMember(env, code, b.member_id, b.member_secret);
  const w = week(b.week, nowMs, { writable: true });
  const xp = num(b.xp, 'xp', 0, LIMITS.maxXp, { integer: true });
  await env.DB.prepare(
    `INSERT INTO league_scores (member_id, week, xp) VALUES (?, ?, ?)
     ON CONFLICT (member_id, week) DO UPDATE SET xp = excluded.xp`,
  )
    .bind(memberId, w, xp)
    .run();
  return null;
}

async function getLeague(env, request, url, code, nowMs) {
  if (!(await leagueExists(env, code))) throw new HttpError(404, 'not_found');
  const { memberId, secret } = bearer(request);
  await authMember(env, code, memberId, secret);
  const w = url.searchParams.has('week') ? week(url.searchParams.get('week')) : isoWeek(new Date(nowMs));
  const league = await env.DB.prepare('SELECT name FROM leagues WHERE code = ?').bind(code).first();
  const { results } = await env.DB.prepare(
    `SELECT m.nickname AS nickname, COALESCE(s.xp, 0) AS xp, p.xp AS prev
     FROM members m
     LEFT JOIN league_scores s ON s.member_id = m.id AND s.week = ?
     LEFT JOIN league_scores p ON p.member_id = m.id AND p.week = ?
     WHERE m.league_code = ?
     ORDER BY xp DESC, m.nickname_key ASC`,
  )
    .bind(w, shiftWeek(w, -1), code)
    .all();
  return {
    name: league.name,
    week: w,
    // `up`: beat their own previous week. No previous week → nothing to beat yet → false.
    members: results.map((r) => ({ nickname: r.nickname, xp: Number(r.xp), up: r.prev !== null && Number(r.xp) > Number(r.prev) })),
  };
}

async function leaveLeague(env, request, code) {
  if (!(await leagueExists(env, code))) throw new HttpError(404, 'not_found');
  const { memberId, secret } = bearer(request);
  const id = await authMember(env, code, memberId, secret);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM league_scores WHERE member_id = ?').bind(id),
    env.DB.prepare('DELETE FROM members WHERE id = ?').bind(id),
    env.DB.prepare('DELETE FROM leagues WHERE code = ? AND NOT EXISTS (SELECT 1 FROM members WHERE league_code = ?)').bind(code, code),
  ]);
  return null;
}

// ---------------------------------------------------------------- router

async function route(request, env, url, nowMs) {
  const cfg = rateConfig(env);
  await rateLimit(env, request, 'all', cfg.RATE_MAX, nowMs);

  const { pathname } = url;
  const method = request.method;
  const parts = pathname.split('/').filter(Boolean); // ['v1', ...]
  if (parts[0] !== 'v1' || pathname.endsWith('/')) throw new HttpError(404, 'not_found');
  const [, resource, a, b, c] = parts;
  const n = parts.length;

  if (resource === 'stats') {
    if (n === 2 && method === 'POST') return [204, await postStats(env, request, nowMs)];
    if (n === 3 && a === 'percentile' && method === 'GET') return [200, await getPercentile(env, url)];
    if (n === 3 && a !== 'percentile' && method === 'DELETE') return [204, await deleteStats(env, a)];
  }

  if (resource === 'leagues') {
    if (n === 2 && method === 'POST') {
      await rateLimit(env, request, 'league-writes', cfg.RATE_MAX_LEAGUE_WRITES, nowMs);
      return createLeague(env, request, nowMs);
    }
    if (n >= 3) {
      if (n === 3 && method === 'GET') return [200, await getLeague(env, request, url, leagueCode(a), nowMs)];
      if (n === 4 && b === 'join' && method === 'POST') {
        const code = leagueCode(a);
        await rateLimit(env, request, 'league-writes', cfg.RATE_MAX_LEAGUE_WRITES, nowMs);
        return joinLeague(env, request, code, nowMs);
      }
      if (n === 4 && b === 'score' && method === 'POST') return [204, await postScore(env, request, leagueCode(a), nowMs)];
      if (n === 5 && b === 'members' && c === 'me' && method === 'DELETE') return [204, await leaveLeague(env, request, leagueCode(a))];
    }
  }

  throw new HttpError(404, 'not_found');
}

// ---------------------------------------------------------------- retention (Cron Trigger)

/**
 * Runs hourly (see wrangler.toml):
 *  1. deletes stats older than 26 weeks and league scores older than 12 weeks;
 *  2. deletes leagues with no activity (no score left) that are older than 12 weeks, with their members;
 *  3. deletes rate-limit counters from past windows;
 *  4. rebuilds the per-week histogram used by /v1/stats/percentile for the writable weeks.
 */
export async function runMaintenance(env, nowMs) {
  const now = isoWeek(new Date(nowMs));
  const statsCutoff = shiftWeek(now, -LIMITS.statsRetentionWeeks);
  const scoresCutoff = shiftWeek(now, -LIMITS.scoresRetentionWeeks);
  const window = Math.floor(nowMs / 1000 / rateConfig(env).RATE_WINDOW_SEC);
  const weeks = [...writableWeeks(nowMs)];
  const marks = weeks.map(() => '?').join(', ');

  await env.DB.batch([
    env.DB.prepare('DELETE FROM weekly_stats WHERE week < ?').bind(statsCutoff),
    env.DB.prepare('DELETE FROM stats_histogram WHERE week < ?').bind(statsCutoff),
    env.DB.prepare('DELETE FROM league_scores WHERE week < ?').bind(scoresCutoff),
    env.DB.prepare(
      `DELETE FROM members WHERE league_code IN (
         SELECT l.code FROM leagues l
         WHERE l.created_week < ?
           AND NOT EXISTS (SELECT 1 FROM members m JOIN league_scores s ON s.member_id = m.id WHERE m.league_code = l.code))`,
    ).bind(scoresCutoff),
    env.DB.prepare('DELETE FROM leagues WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.league_code = leagues.code)'),
    env.DB.prepare('DELETE FROM rate_limits WHERE win < ?').bind(window),
    env.DB.prepare(`DELETE FROM stats_histogram WHERE week IN (${marks})`).bind(...weeks),
    env.DB.prepare(
      `INSERT INTO stats_histogram (week, lang, wpm, n)
       SELECT week, lang, CAST(avg_wpm AS INTEGER), COUNT(*) FROM weekly_stats
       WHERE week IN (${marks}) GROUP BY week, lang, CAST(avg_wpm AS INTEGER)`,
    ).bind(...weeks),
  ]);
}

// ---------------------------------------------------------------- entry point

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    // Browsers send Origin; the Tauri webview sends one of ALLOWED_ORIGINS. Anything else is refused,
    // so no website can use a visitor's browser to call this API. Requests without Origin (the app's
    // Rust side, curl) are not a CORS concern.
    if (origin && !ALLOWED_ORIGINS.has(origin)) return respond(403, { error: 'origin_not_allowed' }, null);
    if (request.method === 'OPTIONS') return respond(204, null, origin);

    const nowMs = Date.now();
    try {
      const url = new URL(request.url);
      const [status, body] = await route(request, env, url, nowMs);
      return respond(status, status === 204 ? null : body, origin);
    } catch (err) {
      if (err instanceof HttpError) return respond(err.status, { error: err.code }, origin, err.headers);
      console.error('unhandled', err && err.stack ? err.stack : err);
      return respond(500, { error: 'internal' }, origin);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMaintenance(env, event.scheduledTime ?? Date.now()));
  },
};
