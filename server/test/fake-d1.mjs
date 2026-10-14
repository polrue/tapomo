// A tiny in-memory fake of the Cloudflare D1 API on top of Node's built-in node:sqlite,
// so the worker's fetch/scheduled handlers run unmodified in `node --test`.
// Covers what the worker uses: prepare().bind().run()/all()/first(), batch(), exec().

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCHEMA = fileURLToPath(new URL('../schema.sql', import.meta.url));

const toSql = (v) => {
  if (v === undefined) throw new TypeError('D1_TYPE_ERROR: undefined is not a supported bind value');
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
};

class FakeStatement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...values) {
    return new FakeStatement(this.db, this.sql, values.map(toSql));
  }
  #stmt() {
    return this.db.sqlite.prepare(this.sql);
  }
  #returnsRows() {
    return /^\s*(SELECT|WITH)\b/i.test(this.sql) || /\bRETURNING\b/i.test(this.sql);
  }
  async first(column) {
    const row = this.#stmt().get(...this.params);
    if (!row) return null;
    const plain = { ...row };
    return column === undefined ? plain : plain[column];
  }
  async all() {
    this.db.queries++;
    if (!this.#returnsRows()) return this.run();
    const results = this.#stmt().all(...this.params).map((r) => ({ ...r }));
    return { success: true, results, meta: { changes: 0 } };
  }
  async run() {
    this.db.queries++;
    if (this.#returnsRows()) {
      const results = this.#stmt().all(...this.params).map((r) => ({ ...r }));
      return { success: true, results, meta: { changes: results.length } };
    }
    const info = this.#stmt().run(...this.params);
    return {
      success: true,
      results: [],
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
    };
  }
}

export class FakeD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON'); // D1 enforces foreign keys
    this.sqlite.exec(readFileSync(SCHEMA, 'utf8'));
    this.queries = 0;
  }
  prepare(sql) {
    return new FakeStatement(this, sql);
  }
  async batch(statements) {
    // D1 runs a batch as one transaction: all or nothing.
    this.sqlite.exec('BEGIN');
    try {
      const out = [];
      for (const s of statements) out.push(await s.run());
      this.sqlite.exec('COMMIT');
      return out;
    } catch (err) {
      this.sqlite.exec('ROLLBACK');
      throw err;
    }
  }
  async exec(sql) {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }
  /** Test helper: synchronous query. */
  rows(sql, ...params) {
    return this.sqlite.prepare(sql).all(...params).map((r) => ({ ...r }));
  }
}
