import worker from '../src/index.js';
import { FakeD1 } from './fake-d1.mjs';
import { isoWeek, shiftWeek } from '../src/week.js';

export const ORIGIN = 'tauri://localhost';
export const thisWeek = () => isoWeek(new Date());
export const lastWeek = () => shiftWeek(thisWeek(), -1);

export function makeEnv(vars = {}) {
  return { DB: new FakeD1(), RATE_LIMIT_SALT: 'test-salt', ...vars };
}

let ipCounter = 0;
const freshIp = () => `203.0.113.${(ipCounter++ % 250) + 1}`;

/**
 * Calls the worker's fetch handler. Each call gets its own IP unless `ip` is given,
 * so rate limiting only kicks in where a test wants it.
 */
export async function call(env, method, path, { body, headers = {}, origin = ORIGIN, ip = freshIp(), raw } = {}) {
  const h = { 'CF-Connecting-IP': ip, ...headers };
  if (origin) h.Origin = origin;
  let payload;
  if (raw !== undefined) payload = raw;
  else if (body !== undefined) {
    payload = JSON.stringify(body);
    h['Content-Type'] ??= 'application/json';
  }
  const res = await worker.fetch(new Request(`https://api.tapomo.app${path}`, { method, headers: h, body: payload }), env, {});
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}

export async function runCron(env, scheduledTime = Date.now()) {
  const pending = [];
  await worker.scheduled({ scheduledTime, cron: '17 * * * *' }, env, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
}

export const auth = (m) => ({ Authorization: `Bearer ${m.member_id}.${m.member_secret}` });

export function uuid() {
  return crypto.randomUUID();
}

export function stats(overrides = {}) {
  return {
    install_id: uuid(),
    week: thisWeek(),
    lang: 'es',
    avg_wpm: 42.5,
    peak_wpm: 88,
    accuracy: 0.96,
    active_min: 300,
    ...overrides,
  };
}
