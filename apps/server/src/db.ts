import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  username TEXT,
  avatar_url TEXT,
  is_bot INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  credits INTEGER NOT NULL DEFAULT 0,
  shards INTEGER NOT NULL DEFAULT 0,
  stars INTEGER NOT NULL DEFAULT 0,
  revive_tokens INTEGER NOT NULL DEFAULT 0,
  skin_fragments INTEGER NOT NULL DEFAULT 0,
  energy INTEGER NOT NULL,
  energy_updated_at INTEGER NOT NULL,
  gear TEXT NOT NULL,
  owned_skins TEXT NOT NULL,
  selected_skin TEXT NOT NULL,
  settings TEXT NOT NULL,
  stats TEXT NOT NULL,
  tutorial_done INTEGER NOT NULL DEFAULT 0,
  streak_count INTEGER NOT NULL DEFAULT 0,
  streak_last_day TEXT,
  streak_claimed_day TEXT,
  referred_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(platform, platform_user_id)
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  route_id TEXT NOT NULL,
  seed INTEGER NOT NULL,
  config_version TEXT NOT NULL,
  gear TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  revive_paid INTEGER NOT NULL DEFAULT 0,
  double_claimed INTEGER NOT NULL DEFAULT 0,
  ranked INTEGER NOT NULL DEFAULT 0,
  score INTEGER,
  result TEXT,
  reject_reason TEXT,
  week_key TEXT NOT NULL,
  event_instance TEXT,
  energy_spent INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS runs_player ON runs(player_id, started_at);
CREATE TABLE IF NOT EXISTS leaderboard (
  week_key TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  best_score INTEGER NOT NULL,
  distance INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (week_key, player_id)
);
CREATE INDEX IF NOT EXISTS leaderboard_rank ON leaderboard(week_key, best_score DESC);
CREATE TABLE IF NOT EXISTS lb_settlements (
  week_key TEXT NOT NULL,
  player_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  tier TEXT,
  reward TEXT,
  claimed_at INTEGER,
  PRIMARY KEY (week_key, player_id)
);
CREATE TABLE IF NOT EXISTS missions (
  player_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  claimed_at INTEGER,
  PRIMARY KEY (player_id, period_key, mission_id)
);
CREATE TABLE IF NOT EXISTS pass_state (
  player_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  premium INTEGER NOT NULL DEFAULT 0,
  claimed TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (player_id, season_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  status TEXT NOT NULL,
  idem_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_charge_id TEXT UNIQUE,
  price TEXT NOT NULL,
  invoice_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (player_id, idem_key)
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  delta TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS event_totals (
  instance_id TEXT PRIMARY KEY,
  damage INTEGER NOT NULL DEFAULT 0,
  participants INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS event_players (
  instance_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  damage INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0,
  runs INTEGER NOT NULL DEFAULT 0,
  last_day TEXT,
  day_runs INTEGER NOT NULL DEFAULT 0,
  last_damage INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (instance_id, player_id)
);
CREATE TABLE IF NOT EXISTS event_claims (
  instance_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  milestone INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (instance_id, player_id, milestone)
);
CREATE TABLE IF NOT EXISTS friends (
  player_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, friend_id)
);
CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT,
  name TEXT NOT NULL,
  props TEXT,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS config_versions (
  version TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

export type Row = Record<string, SQLInputValue>;

export class Db {
  readonly raw: DatabaseSync;
  private depth = 0;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec(SCHEMA);
  }

  get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.raw.prepare(sql).get(...params) as T | undefined;
  }

  all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.raw.prepare(sql).all(...params) as T[];
  }

  run(sql: string, ...params: SQLInputValue[]) {
    return this.raw.prepare(sql).run(...params);
  }

  /** Atomic unit of work. Nested calls join the outer transaction. */
  tx<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.raw.exec('BEGIN IMMEDIATE');
    this.depth++;
    try {
      const result = fn();
      this.raw.exec('COMMIT');
      return result;
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    } finally {
      this.depth--;
    }
  }

  close() {
    this.raw.close();
  }
}
