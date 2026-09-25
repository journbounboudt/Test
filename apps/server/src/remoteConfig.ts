import fs from 'node:fs';
import { DEFAULT_CONFIG, type RemoteConfig } from '@void-rush/shared';
import type { Db } from './db.ts';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObject(base) || !isObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = k in out ? deepMerge(out[k], v) : v;
  return out as T;
}

/**
 * Versioned Remote Config. Defaults live in @void-rush/shared; an optional JSON override file is merged
 * on top and hot-reloaded. Every version ever served is persisted so runs replay against the exact config.
 */
export class ConfigStore {
  private readonly db: Db;
  private readonly file: string;
  private current: RemoteConfig = DEFAULT_CONFIG;
  private mtime = -1;
  private lastCheck = 0;
  private readonly cache = new Map<string, RemoteConfig>();

  constructor(db: Db, file: string) {
    this.db = db;
    this.file = file;
    this.reload();
  }

  private reload() {
    let cfg = DEFAULT_CONFIG;
    try {
      const stat = fs.statSync(this.file);
      if (stat.mtimeMs === this.mtime) return;
      this.mtime = stat.mtimeMs;
      cfg = deepMerge(DEFAULT_CONFIG, JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[config] override ignored:', (err as Error).message);
      if (this.mtime === -2) return;
      this.mtime = -2;
    }
    this.current = cfg;
    this.cache.set(cfg.version, cfg);
    this.db.run('INSERT OR IGNORE INTO config_versions (version, json, created_at) VALUES (?, ?, ?)', cfg.version, JSON.stringify(cfg), Date.now());
  }

  get(): RemoteConfig {
    const now = Date.now();
    if (now - this.lastCheck > 5000) {
      this.lastCheck = now;
      this.reload();
    }
    return this.current;
  }

  byVersion(version: string): RemoteConfig | undefined {
    const hit = this.cache.get(version);
    if (hit) return hit;
    const row = this.db.get<{ json: string }>('SELECT json FROM config_versions WHERE version = ?', version);
    if (!row) return undefined;
    const cfg = JSON.parse(row.json) as RemoteConfig;
    this.cache.set(version, cfg);
    return cfg;
  }
}
