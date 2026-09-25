import type { MissionDef, MissionMetric, RemoteConfig, RouteConfig } from './config.ts';
import type { GearMods } from './gear.ts';
import { Rng, hashString, mixSeed } from './rng.ts';
import type { RunSummary } from './sim.ts';
import type { RewardBundle, RouteId, UnlockRule } from './types.ts';

const DAY = 86400000;

export interface RunRewards {
  bundle: RewardBundle;
  cards: { kind: 'credits' | 'shards' | 'passXp' | 'fragment' | 'revive' | 'xp'; amount: number; label: string; rarity: 'common' | 'rare' | 'epic' }[];
}

/** Server-authoritative reward formula. Deterministic per run seed so retries never re-roll drops. */
export function computeRunRewards(summary: RunSummary, route: RouteConfig, mods: GearMods, seed: number): RunRewards {
  const r = route.rewards;
  const finishMult = summary.finished ? 1 : 0.6;
  const luck = 1 + summary.luck;
  const credits = Math.floor((r.baseCredits * route.rewardMultiplier + summary.score * r.creditsPerScore + summary.credits * 25) * (1 + mods.rewardBonus) * finishMult * luck);
  const shards = Math.floor(summary.shards * (1 + mods.shardBonus) * luck);
  const passXp = Math.floor(r.passXp * finishMult + summary.maxCombo);
  const xp = Math.floor(r.xp * finishMult + summary.distance / 50);
  const bundle: RewardBundle = { credits, shards, passXp, xp };
  const cards: RunRewards['cards'] = [
    { kind: 'credits', amount: credits, label: 'Кредиты', rarity: 'common' },
    { kind: 'shards', amount: shards, label: 'Осколки Пустоты', rarity: 'rare' },
    { kind: 'passXp', amount: passXp, label: 'Опыт пропуска', rarity: 'common' },
  ];
  const rng = new Rng(mixSeed(seed, 77));
  if (summary.finished && rng.next() < r.fragmentChance * luck) {
    bundle.skinFragments = 1;
    cards.push({ kind: 'fragment', amount: 1, label: 'Фрагмент скина «Эхо Пустоты»', rarity: 'epic' });
  } else if (rng.next() < r.reviveTokenChance * luck * (summary.finished ? 1 : 0.5)) {
    bundle.reviveTokens = 1;
    cards.push({ kind: 'revive', amount: 1, label: 'Жетон возрождения', rarity: 'rare' });
  } else {
    cards.push({ kind: 'xp', amount: xp, label: 'Опыт бегуна', rarity: 'common' });
  }
  return { bundle, cards };
}

export function xpForLevel(level: number, config: RemoteConfig): number {
  return config.player.xpBase + config.player.xpGrowth * (level - 1);
}

/** Applies XP and returns the new level/xp plus how many levels were gained. */
export function applyXp(level: number, xp: number, gain: number, config: RemoteConfig) {
  let l = level;
  let x = xp + gain;
  let gained = 0;
  while (l < config.player.maxLevel && x >= xpForLevel(l, config)) {
    x -= xpForLevel(l, config);
    l++;
    gained++;
  }
  return { level: l, xp: x, gained };
}

export interface EnergyState {
  energy: number;
  updatedAt: number;
}

/** Energy regenerates on the server clock; `updatedAt` keeps partial progress between ticks. */
export function currentEnergy(state: EnergyState, now: number, config: RemoteConfig): EnergyState & { nextInSec: number } {
  const { cap, regenSec } = config.energy;
  const period = regenSec * 1000;
  if (state.energy >= cap) return { energy: state.energy, updatedAt: now, nextInSec: 0 };
  const gained = Math.floor(Math.max(0, now - state.updatedAt) / period);
  const energy = Math.min(cap, state.energy + gained);
  const updatedAt = energy >= cap ? now : state.updatedAt + gained * period;
  const nextInSec = energy >= cap ? 0 : Math.ceil((updatedAt + period - now) / 1000);
  return { energy, updatedAt, nextInSec };
}

export interface UnlockContext {
  level: number;
  finishedRoutes: RouteId[];
  passLevel: number;
}

export function isUnlocked(rule: UnlockRule, ctx: UnlockContext): boolean {
  switch (rule.type) {
    case 'none':
      return true;
    case 'level':
      return ctx.level >= rule.level;
    case 'routeFinished':
      return ctx.finishedRoutes.includes(rule.routeId);
    case 'passLevel':
      return ctx.passLevel >= rule.level;
    case 'all':
      return rule.rules.every((r) => isUnlocked(r, ctx));
  }
}

export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** ISO-8601 week key, e.g. 2026-W39. */
export function weekKey(now: number): string {
  const d = new Date(now);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / DAY + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function weekBounds(now: number): { start: number; end: number } {
  const d = new Date(now);
  const day = d.getUTCDay() || 7;
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - (day - 1) * DAY;
  return { start, end: start + 7 * DAY };
}

export function dayEnd(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + DAY;
}

export function currentSeason(config: RemoteConfig, now: number) {
  const epoch = Date.parse(config.season.epoch);
  const len = config.season.lengthDays * DAY;
  const index = Math.max(0, Math.floor((now - epoch) / len));
  const startAt = epoch + index * len;
  return {
    seasonId: `s${index + 1}`,
    number: index + 1,
    name: config.season.names[index % config.season.names.length],
    startAt,
    endAt: startAt + len,
  };
}

export function currentEvent(config: RemoteConfig, now: number) {
  const ev = config.event;
  const epoch = Date.parse(ev.epoch);
  const cycle = ev.cycleDays * DAY;
  const index = Math.max(0, Math.floor((now - epoch) / cycle));
  const startAt = epoch + index * cycle;
  const endAt = startAt + ev.activeDays * DAY;
  return { instanceId: `${ev.eventId}#${index + 1}`, startAt, endAt, active: now >= startAt && now < endAt };
}

export function passLevelFromXp(xp: number, config: RemoteConfig): number {
  return Math.min(config.season.levels, Math.floor(xp / config.season.xpPerLevel) + 1);
}

/** Deterministically picks the active missions for a player and period. */
export function activeMissions(pool: MissionDef[], count: number, playerId: string, periodKey: string): MissionDef[] {
  const rng = new Rng(hashString(`${playerId}|${periodKey}`));
  return rng.shuffle([...pool]).slice(0, Math.min(count, pool.length));
}

export interface MissionContext {
  summary?: RunSummary;
  upgrades?: number;
}

/** Returns progress delta for a metric. `maxCombo` is a "best" metric (max, not sum). */
export function missionDelta(metric: MissionMetric, mission: MissionDef, ctx: MissionContext): { value: number; mode: 'add' | 'max' } {
  const s = ctx.summary;
  switch (metric) {
    case 'upgrades':
      return { value: ctx.upgrades ?? 0, mode: 'add' };
    case 'maxCombo':
      return { value: s?.maxCombo ?? 0, mode: 'max' };
    case 'shards':
      return { value: s?.shards ?? 0, mode: 'add' };
    case 'runs':
      return { value: s ? 1 : 0, mode: 'add' };
    case 'ultActivations':
      return { value: s?.ultActivations ?? 0, mode: 'add' };
    case 'cleanFinish':
      return { value: s && s.finished && s.hardHits === 0 ? 1 : 0, mode: 'add' };
    case 'nearMisses':
      return { value: s?.nearMisses ?? 0, mode: 'add' };
    case 'distance':
      return { value: s?.distance ?? 0, mode: 'add' };
    case 'finishes':
      return { value: s?.finished ? 1 : 0, mode: 'add' };
    case 'score':
      return { value: s?.score ?? 0, mode: 'add' };
    case 'routeFinish':
      return { value: s?.finished && s.routeId === mission.routeId ? 1 : 0, mode: 'add' };
    case 'eventRuns':
      return { value: s?.routeId === 'event' ? 1 : 0, mode: 'add' };
    case 'gradeS':
      return { value: s && (s.grade === 'S' || s.grade === 'S+') ? 1 : 0, mode: 'add' };
  }
}

export function eventContribution(summary: RunSummary, config: RemoteConfig): number {
  const c = config.event.contribution;
  return Math.floor((summary.score * c.perScore + summary.cores * c.perCore + (summary.finished ? c.finishBonus : 0)) * c.multiplier);
}

export function mergeRewards(...bundles: (RewardBundle | undefined)[]): RewardBundle {
  const out: RewardBundle = {};
  for (const b of bundles) {
    if (!b) continue;
    for (const key of ['credits', 'shards', 'stars', 'energy', 'reviveTokens', 'xp', 'passXp', 'skinFragments'] as const) {
      if (b[key]) out[key] = (out[key] ?? 0) + (b[key] ?? 0);
    }
    if (b.skin) out.skin = b.skin;
    if (b.premiumPass) out.premiumPass = true;
  }
  return out;
}

export function formatNumber(n: number): string {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
}
