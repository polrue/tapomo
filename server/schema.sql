-- Tapomo API — D1 (SQLite) schema.
-- Apply with: npx wrangler d1 execute tapomo --remote --file=schema.sql
-- Idempotent: safe to run again.
--
-- Nothing here identifies a person: no emails, no accounts, no IPs, no timestamps finer than an ISO week.

-- Weekly anonymous typing summary. Opt-in, off by default in the app.
-- install_id is a random UUID v4 the app generates; it is not linked to anything else.
CREATE TABLE IF NOT EXISTS weekly_stats (
  install_id TEXT NOT NULL,                                      -- random UUID v4 (lowercase)
  week       TEXT NOT NULL,                                      -- ISO week 'YYYY-Www'
  lang       TEXT NOT NULL CHECK (lang IN ('es', 'en')),          -- app language
  avg_wpm    REAL NOT NULL CHECK (avg_wpm BETWEEN 0 AND 250),
  peak_wpm   REAL NOT NULL CHECK (peak_wpm BETWEEN 0 AND 300),
  accuracy   REAL NOT NULL CHECK (accuracy BETWEEN 0 AND 1),
  active_min INTEGER NOT NULL CHECK (active_min BETWEEN 0 AND 10080),
  PRIMARY KEY (install_id, week)                                  -- one row per install and week (upsert)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_weekly_stats_week_lang ON weekly_stats (week, lang, avg_wpm);

-- Aggregated counts per week, language and whole wpm (0–250), rebuilt hourly by the cron.
-- /v1/stats/percentile reads only this (≤ 251 rows), never the raw table.
CREATE TABLE IF NOT EXISTS stats_histogram (
  week TEXT NOT NULL,
  lang TEXT NOT NULL,
  wpm  INTEGER NOT NULL,
  n    INTEGER NOT NULL,
  PRIMARY KEY (week, lang, wpm)
) WITHOUT ROWID;

-- Friends leagues. The code is the invitation: 8 random chars from an unambiguous alphabet.
CREATE TABLE IF NOT EXISTS leagues (
  code         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,                                   -- ≤ 40 chars
  created_week TEXT NOT NULL                                    -- ISO week, for expiring abandoned leagues
) WITHOUT ROWID;

-- League members: a nickname and the SHA-256 of a random secret only the member's app knows.
CREATE TABLE IF NOT EXISTS members (
  id           TEXT PRIMARY KEY,                                -- random UUID v4
  league_code  TEXT NOT NULL REFERENCES leagues (code) ON DELETE CASCADE,
  nickname     TEXT NOT NULL,                                   -- ≤ 24 chars, as typed
  nickname_key TEXT NOT NULL,                                   -- NFKC + lowercase, for case-insensitive uniqueness
  secret_hash  TEXT NOT NULL,                                   -- hex SHA-256 of the member secret; the secret itself is never stored
  joined_week  TEXT NOT NULL,
  UNIQUE (league_code, nickname_key)
) WITHOUT ROWID;

-- Weekly XP per member (the app sends its weekly XP total; upsert).
CREATE TABLE IF NOT EXISTS league_scores (
  member_id TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  week      TEXT NOT NULL,
  xp        INTEGER NOT NULL CHECK (xp BETWEEN 0 AND 5600),
  PRIMARY KEY (member_id, week)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_league_scores_week ON league_scores (week);

-- Rate limiting: fixed-window hit counters. `bucket` is a salted SHA-256 that already mixes in the
-- window number, so the same IP gets an unrelated key every window. Past windows are deleted hourly.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT NOT NULL,
  win    INTEGER NOT NULL,
  hits   INTEGER NOT NULL,
  PRIMARY KEY (bucket, win)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_rate_limits_win ON rate_limits (win);
