import { DEFAULT_GEAR, sanitizeGear, type GearLevels, type RemoteConfig, type RouteId } from '@void-rush/shared';
import type { Db } from './db.ts';
import { notFound } from './errors.ts';

export interface Settings {
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  reducedShake: boolean;
  reducedFlash: boolean;
  graphics: 'auto' | 'high' | 'medium' | 'low';
}

export interface RouteBest {
  score: number;
  distance: number;
  finished: boolean;
}

export interface Stats {
  runs: number;
  finishes: number;
  bestScore: number;
  bestDistance: number;
  totalShards: number;
  routeBest: Partial<Record<RouteId, RouteBest>>;
  finishedRoutes: RouteId[];
  purchases: Record<string, number>;
}

export interface Player {
  id: string;
  platform: string;
  platformUserId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  isBot: boolean;
  level: number;
  xp: number;
  credits: number;
  shards: number;
  stars: number;
  reviveTokens: number;
  skinFragments: number;
  energy: number;
  energyUpdatedAt: number;
  gear: GearLevels;
  ownedSkins: string[];
  selectedSkin: string;
  settings: Settings;
  stats: Stats;
  tutorialDone: boolean;
  streakCount: number;
  streakLastDay: string | null;
  streakClaimedDay: string | null;
  referredBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_SETTINGS: Settings = { music: true, sfx: true, haptics: true, reducedShake: false, reducedFlash: false, graphics: 'auto' };

export function emptyStats(): Stats {
  return { runs: 0, finishes: 0, bestScore: 0, bestDistance: 0, totalShards: 0, routeBest: {}, finishedRoutes: [], purchases: {} };
}

interface PlayerRow {
  id: string;
  platform: string;
  platform_user_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  is_bot: number;
  level: number;
  xp: number;
  credits: number;
  shards: number;
  stars: number;
  revive_tokens: number;
  skin_fragments: number;
  energy: number;
  energy_updated_at: number;
  gear: string;
  owned_skins: string;
  selected_skin: string;
  settings: string;
  stats: string;
  tutorial_done: number;
  streak_count: number;
  streak_last_day: string | null;
  streak_claimed_day: string | null;
  referred_by: string | null;
  created_at: number;
  updated_at: number;
}

function fromRow(r: PlayerRow): Player {
  return {
    id: r.id,
    platform: r.platform,
    platformUserId: r.platform_user_id,
    displayName: r.display_name,
    username: r.username,
    avatarUrl: r.avatar_url,
    isBot: r.is_bot === 1,
    level: r.level,
    xp: r.xp,
    credits: r.credits,
    shards: r.shards,
    stars: r.stars,
    reviveTokens: r.revive_tokens,
    skinFragments: r.skin_fragments,
    energy: r.energy,
    energyUpdatedAt: r.energy_updated_at,
    gear: sanitizeGear(JSON.parse(r.gear)),
    ownedSkins: JSON.parse(r.owned_skins),
    selectedSkin: r.selected_skin,
    settings: { ...DEFAULT_SETTINGS, ...JSON.parse(r.settings) },
    stats: { ...emptyStats(), ...JSON.parse(r.stats) },
    tutorialDone: r.tutorial_done === 1,
    streakCount: r.streak_count,
    streakLastDay: r.streak_last_day,
    streakClaimedDay: r.streak_claimed_day,
    referredBy: r.referred_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class PlayerRepo {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  find(id: string): Player | undefined {
    const row = this.db.get<PlayerRow>('SELECT * FROM players WHERE id = ?', id);
    return row ? fromRow(row) : undefined;
  }

  load(id: string): Player {
    const p = this.find(id);
    if (!p) throw notFound('Игрок не найден');
    return p;
  }

  findByPlatform(platform: string, platformUserId: string): Player | undefined {
    const row = this.db.get<PlayerRow>('SELECT * FROM players WHERE platform = ? AND platform_user_id = ?', platform, platformUserId);
    return row ? fromRow(row) : undefined;
  }

  create(input: { id: string; platform: string; platformUserId: string; displayName: string; username?: string | null; avatarUrl?: string | null; isBot?: boolean; referredBy?: string | null }, config: RemoteConfig, now: number): Player {
    const p: Player = {
      id: input.id,
      platform: input.platform,
      platformUserId: input.platformUserId,
      displayName: input.displayName.slice(0, 40) || 'Бегун',
      username: input.username ?? null,
      avatarUrl: input.avatarUrl ?? null,
      isBot: input.isBot ?? false,
      level: 1,
      xp: 0,
      credits: config.starter.credits,
      shards: config.starter.shards,
      stars: config.starter.stars,
      reviveTokens: config.starter.reviveTokens,
      skinFragments: 0,
      energy: config.energy.cap,
      energyUpdatedAt: now,
      gear: { ...DEFAULT_GEAR },
      ownedSkins: ['void_guard'],
      selectedSkin: 'void_guard',
      settings: { ...DEFAULT_SETTINGS },
      stats: emptyStats(),
      tutorialDone: false,
      streakCount: 0,
      streakLastDay: null,
      streakClaimedDay: null,
      referredBy: input.referredBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.run(
      `INSERT INTO players (id, platform, platform_user_id, display_name, username, avatar_url, is_bot, level, xp, credits, shards, stars,
        revive_tokens, skin_fragments, energy, energy_updated_at, gear, owned_skins, selected_skin, settings, stats, tutorial_done,
        streak_count, streak_last_day, streak_claimed_day, referred_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p.id, p.platform, p.platformUserId, p.displayName, p.username, p.avatarUrl, p.isBot ? 1 : 0, p.level, p.xp, p.credits, p.shards, p.stars,
      p.reviveTokens, p.skinFragments, p.energy, p.energyUpdatedAt, JSON.stringify(p.gear), JSON.stringify(p.ownedSkins), p.selectedSkin,
      JSON.stringify(p.settings), JSON.stringify(p.stats), 0, 0, null, null, p.referredBy, now, now,
    );
    return p;
  }

  save(p: Player, now: number) {
    p.updatedAt = now;
    this.db.run(
      `UPDATE players SET display_name = ?, username = ?, avatar_url = ?, level = ?, xp = ?, credits = ?, shards = ?, stars = ?, revive_tokens = ?,
        skin_fragments = ?, energy = ?, energy_updated_at = ?, gear = ?, owned_skins = ?, selected_skin = ?, settings = ?, stats = ?,
        tutorial_done = ?, streak_count = ?, streak_last_day = ?, streak_claimed_day = ?, updated_at = ? WHERE id = ?`,
      p.displayName, p.username, p.avatarUrl, p.level, p.xp, p.credits, p.shards, p.stars, p.reviveTokens, p.skinFragments, p.energy,
      p.energyUpdatedAt, JSON.stringify(p.gear), JSON.stringify(p.ownedSkins), p.selectedSkin, JSON.stringify(p.settings), JSON.stringify(p.stats),
      p.tutorialDone ? 1 : 0, p.streakCount, p.streakLastDay, p.streakClaimedDay, now, p.id,
    );
  }
}
