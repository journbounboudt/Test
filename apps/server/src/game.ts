import {
  GEAR_SLOTS,
  activeMissions,
  applyXp,
  computeRunRewards,
  currentEnergy,
  currentEvent,
  currentSeason,
  dayEnd,
  dayKey,
  eventContribution,
  gearMods,
  isUnlocked,
  missionDelta,
  passLevelFromXp,
  planUpgradeAll,
  productById,
  replayRun,
  sanitizeGear,
  skinById,
  upgradeCost,
  weekBounds,
  weekKey,
  xpForLevel,
  type BoostId,
  type Currency,
  type GearLevels,
  type GearSlot,
  type InputRecord,
  type MissionContext,
  type MissionDef,
  type ProductDef,
  type RemoteConfig,
  type RewardBundle,
  type RouteId,
  type RunAction,
  type RunRewards,
  type RunSummary,
} from '@void-rush/shared';
import { newId, randomSeed, runToken } from './auth.ts';
import type { Db } from './db.ts';
import type { ServerEnv } from './env.ts';
import { ApiError, badRequest, conflict, notFound } from './errors.ts';
import { PlayerRepo, type Player, type Settings } from './players.ts';
import type { ConfigStore } from './remoteConfig.ts';

const DAY = 86400000;
const RUN_EXPIRY_MS = 45 * 60 * 1000;
const MAX_INPUTS = 6000;
const VALID_ACTIONS = new Set<string>(['L', 'R', 'shield', 'magnet', 'ult', 'revive', 'end', 'boost:speed', 'boost:magnet', 'boost:shield', 'boost:combo', 'boost:luck', 'boost:breakthrough']);

interface RunRow {
  id: string;
  player_id: string;
  route_id: RouteId;
  seed: number;
  config_version: string;
  gear: string;
  status: 'started' | 'finished' | 'rejected';
  started_at: number;
  finished_at: number | null;
  revive_paid: number;
  double_claimed: number;
  ranked: number;
  score: number | null;
  result: string | null;
  reject_reason: string | null;
  week_key: string;
  event_instance: string | null;
}

interface PassRow {
  xp: number;
  premium: boolean;
  claimed: string[];
}

export interface RunResult {
  runId: string;
  routeId: RouteId;
  summary: RunSummary;
  rewards: RunRewards | null;
  ranked: boolean;
  rejected: string | null;
  desync: boolean;
  newRecord: boolean;
  previousBest: number;
  levelUps: number;
  passLevelBefore: number;
  passLevelAfter: number;
  missionsCompleted: string[];
  contribution: number;
  doubleAvailable: boolean;
}

export interface OrderView {
  orderId: string;
  productId: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  provider: 'internal' | 'telegram' | 'sandbox';
  invoiceUrl?: string | null;
  granted?: RewardBundle;
}

const currencyField: Record<Currency, 'credits' | 'shards' | 'stars'> = { credits: 'credits', shards: 'shards', stars: 'stars' };
const currencyName: Record<Currency, string> = { credits: 'кредитов', shards: 'осколков', stars: 'звёзд' };

export class Game {
  readonly db: Db;
  readonly players: PlayerRepo;
  readonly configs: ConfigStore;
  readonly env: ServerEnv;
  clock: () => number = () => Date.now();

  constructor(db: Db, configs: ConfigStore, env: ServerEnv) {
    this.db = db;
    this.players = new PlayerRepo(db);
    this.configs = configs;
    this.env = env;
  }

  get config(): RemoteConfig {
    return this.configs.get();
  }

  now(): number {
    return this.clock();
  }

  // ───────────────────────── identity ─────────────────────────

  loginPlatform(input: { platform: 'telegram' | 'dev'; platformUserId: string; displayName: string; username?: string | null; avatarUrl?: string | null; startParam?: string }): Player {
    return this.db.tx(() => {
      const now = this.now();
      const existing = this.players.findByPlatform(input.platform, input.platformUserId);
      if (existing) {
        existing.displayName = input.displayName.slice(0, 40) || existing.displayName;
        existing.username = input.username ?? existing.username;
        existing.avatarUrl = input.avatarUrl ?? existing.avatarUrl;
        this.players.save(existing, now);
        return existing;
      }
      let referrer: Player | undefined;
      const ref = input.startParam?.match(/^ref_([A-Za-z0-9_-]{4,40})$/)?.[1];
      if (ref) referrer = this.players.find(`p_${ref}`) ?? this.players.find(ref);
      const p = this.players.create(
        { id: newId('p'), platform: input.platform, platformUserId: input.platformUserId, displayName: input.displayName, username: input.username, avatarUrl: input.avatarUrl, referredBy: referrer?.id ?? null },
        this.config,
        now,
      );
      if (referrer && !referrer.isBot) {
        this.db.run('INSERT OR IGNORE INTO friends (player_id, friend_id, created_at) VALUES (?, ?, ?)', p.id, referrer.id, now);
        this.db.run('INSERT OR IGNORE INTO friends (player_id, friend_id, created_at) VALUES (?, ?, ?)', referrer.id, p.id, now);
      }
      this.ledger(p.id, 'starter', null, { ...this.config.starter });
      return p;
    });
  }

  // ───────────────────────── economy primitives ─────────────────────────

  private ledger(playerId: string, reason: string, ref: string | null, delta: object) {
    this.db.run('INSERT INTO ledger (player_id, reason, ref, delta, created_at) VALUES (?, ?, ?, ?, ?)', playerId, reason, ref, JSON.stringify(delta), this.now());
  }

  refreshEnergy(p: Player, cfg = this.config) {
    const e = currentEnergy({ energy: p.energy, updatedAt: p.energyUpdatedAt }, this.now(), cfg);
    p.energy = e.energy;
    p.energyUpdatedAt = e.updatedAt;
    return e;
  }

  private passRow(playerId: string, seasonId: string): PassRow {
    const row = this.db.get<{ xp: number; premium: number; claimed: string }>('SELECT xp, premium, claimed FROM pass_state WHERE player_id = ? AND season_id = ?', playerId, seasonId);
    if (!row) return { xp: 0, premium: false, claimed: [] };
    return { xp: row.xp, premium: row.premium === 1, claimed: JSON.parse(row.claimed) };
  }

  private savePass(playerId: string, seasonId: string, row: PassRow) {
    this.db.run(
      `INSERT INTO pass_state (player_id, season_id, xp, premium, claimed) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(player_id, season_id) DO UPDATE SET xp = excluded.xp, premium = excluded.premium, claimed = excluded.claimed`,
      playerId, seasonId, row.xp, row.premium ? 1 : 0, JSON.stringify(row.claimed),
    );
  }

  /** Grants a bundle in the current transaction. Mutates `p`; caller saves. */
  grant(p: Player, bundle: RewardBundle, reason: string, ref: string | null = null) {
    const cfg = this.config;
    p.credits += bundle.credits ?? 0;
    p.shards += bundle.shards ?? 0;
    p.stars += bundle.stars ?? 0;
    p.reviveTokens += bundle.reviveTokens ?? 0;
    p.skinFragments += bundle.skinFragments ?? 0;
    if (bundle.energy) {
      this.refreshEnergy(p, cfg);
      p.energy += bundle.energy;
      if (p.energy >= cfg.energy.cap) p.energyUpdatedAt = this.now();
    }
    let levelUps = 0;
    if (bundle.xp) {
      const r = applyXp(p.level, p.xp, bundle.xp, cfg);
      p.level = r.level;
      p.xp = r.xp;
      levelUps = r.gained;
      for (let i = 0; i < r.gained; i++) {
        p.credits += cfg.player.levelReward.credits ?? 0;
        p.stars += cfg.player.levelReward.stars ?? 0;
      }
    }
    if (bundle.skin && !p.ownedSkins.includes(bundle.skin) && skinById(cfg, bundle.skin)) p.ownedSkins.push(bundle.skin);
    const season = currentSeason(cfg, this.now());
    const pass = this.passRow(p.id, season.seasonId);
    const passLevelBefore = passLevelFromXp(pass.xp, cfg);
    if (bundle.passXp || bundle.premiumPass) {
      pass.xp = Math.min(pass.xp + (bundle.passXp ?? 0), cfg.season.levels * cfg.season.xpPerLevel);
      if (bundle.premiumPass) pass.premium = true;
      this.savePass(p.id, season.seasonId, pass);
    }
    this.ledger(p.id, reason, ref, bundle);
    return { levelUps, passLevelBefore, passLevelAfter: passLevelFromXp(pass.xp, cfg) };
  }

  spend(p: Player, currency: Currency, amount: number, reason: string, ref: string | null = null) {
    if (amount <= 0) return;
    const field = currencyField[currency];
    if (p[field] < amount) {
      throw new ApiError('insufficient_funds', 402, `Недостаточно ${currencyName[currency]}`, { currency, required: amount, current: p[field] });
    }
    p[field] -= amount;
    this.ledger(p.id, reason, ref, { [field]: -amount });
  }

  // ───────────────────────── profile ─────────────────────────

  /** Loads a player and applies daily bookkeeping (energy, login streak, weekly settlement). */
  touch(playerId: string): Player {
    return this.db.tx(() => {
      const p = this.players.load(playerId);
      this.refreshEnergy(p);
      const today = dayKey(this.now());
      if (p.streakLastDay !== today) {
        const yesterday = dayKey(this.now() - DAY);
        p.streakCount = p.streakLastDay === yesterday ? p.streakCount + 1 : 1;
        p.streakLastDay = today;
      }
      this.settlePreviousWeek(p);
      this.players.save(p, this.now());
      return p;
    });
  }

  private unlockContext(p: Player) {
    const season = currentSeason(this.config, this.now());
    return { level: p.level, finishedRoutes: p.stats.finishedRoutes, passLevel: passLevelFromXp(this.passRow(p.id, season.seasonId).xp, this.config) };
  }

  profile(p: Player) {
    const cfg = this.config;
    const now = this.now();
    const energy = currentEnergy({ energy: p.energy, updatedAt: p.energyUpdatedAt }, now, cfg);
    const season = currentSeason(cfg, now);
    const pass = this.passRow(p.id, season.seasonId);
    const passLevel = passLevelFromXp(pass.xp, cfg);
    const passClaimable = cfg.season.rewards.filter(
      (r) => r.level <= passLevel && (!pass.claimed.includes(`free:${r.level}`) || (pass.premium && !pass.claimed.includes(`premium:${r.level}`))),
    ).length;
    const missions = this.missionView(p);
    const missionsClaimable = [...missions.daily, ...missions.weekly].filter((m) => m.claimable).length;
    const wk = weekKey(now);
    const lb = this.db.get<{ best_score: number }>('SELECT best_score FROM leaderboard WHERE week_key = ? AND player_id = ?', wk, p.id);
    const rank = lb ? (this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM leaderboard WHERE week_key = ? AND best_score > ?', wk, lb.best_score)?.n ?? 0) + 1 : null;
    const pendingWeekly = this.db.get<{ week_key: string }>('SELECT week_key FROM lb_settlements WHERE player_id = ? AND claimed_at IS NULL AND reward IS NOT NULL', p.id);
    const today = dayKey(now);
    const ev = currentEvent(cfg, now);
    const ctx = this.unlockContext(p);
    const fragTarget = cfg.skinFragmentTarget;
    return {
      playerId: p.id,
      displayName: p.displayName,
      username: p.username,
      avatarUrl: p.avatarUrl,
      level: p.level,
      xp: p.xp,
      xpToNext: xpForLevel(p.level, cfg),
      balances: { credits: p.credits, shards: p.shards, stars: p.stars, reviveTokens: p.reviveTokens, skinFragments: p.skinFragments },
      energy: { value: energy.energy, cap: cfg.energy.cap, nextInSec: energy.nextInSec, regenSec: cfg.energy.regenSec },
      gear: p.gear,
      ownedSkins: p.ownedSkins,
      selectedSkin: p.selectedSkin,
      settings: p.settings,
      tutorialDone: p.tutorialDone,
      stats: { runs: p.stats.runs, finishes: p.stats.finishes, bestScore: p.stats.bestScore, bestDistance: p.stats.bestDistance, routeBest: p.stats.routeBest, finishedRoutes: p.stats.finishedRoutes },
      unlockedRoutes: cfg.routeOrder.concat(['event']).filter((id) => isUnlocked(cfg.routes[id].unlockRule, ctx)),
      streak: { count: p.streakCount, claimable: p.streakClaimedDay !== today, dayIndex: ((Math.max(1, p.streakCount) - 1) % cfg.streak.rewards.length) },
      pass: { seasonId: season.seasonId, name: season.name, number: season.number, endAt: season.endAt, xp: pass.xp, level: passLevel, premium: pass.premium, claimable: passClaimable },
      missions,
      leaderboard: { weekKey: wk, rank, best: lb?.best_score ?? 0, pendingReward: Boolean(pendingWeekly) },
      event: { active: ev.active, endAt: ev.endAt, title: cfg.event.title },
      fragments: { skinId: fragTarget.skinId, have: p.skinFragments, need: fragTarget.fragments },
      badges: { pass: passClaimable + missionsClaimable > 0, shop: !p.stats.purchases['_seen_shop'], leaderboard: Boolean(pendingWeekly) },
      purchases: p.stats.purchases,
      serverTime: now,
      configVersion: cfg.version,
    };
  }

  updateSettings(playerId: string, patch: Partial<Settings>) {
    return this.db.tx(() => {
      const p = this.players.load(playerId);
      const s = p.settings;
      for (const k of ['music', 'sfx', 'haptics', 'reducedShake', 'reducedFlash'] as const) if (typeof patch[k] === 'boolean') s[k] = patch[k];
      if (patch.graphics && ['auto', 'high', 'medium', 'low'].includes(patch.graphics)) s.graphics = patch.graphics;
      this.players.save(p, this.now());
      return p;
    });
  }

  markSeen(playerId: string, key: 'shop') {
    return this.db.tx(() => {
      const p = this.players.load(playerId);
      p.stats.purchases[`_seen_${key}`] = 1;
      this.players.save(p, this.now());
      return p;
    });
  }

  claimStreak(playerId: string) {
    return this.db.tx(() => {
      const p = this.touch(playerId);
      const today = dayKey(this.now());
      if (p.streakClaimedDay === today) throw conflict('already_claimed', 'Награда за сегодня уже получена');
      const rewards = this.config.streak.rewards;
      const reward = rewards[(Math.max(1, p.streakCount) - 1) % rewards.length];
      p.streakClaimedDay = today;
      this.grant(p, reward, 'streak', today);
      this.players.save(p, this.now());
      return { player: p, reward };
    });
  }

  // ───────────────────────── runs ─────────────────────────

  startRun(playerId: string, routeId: RouteId) {
    const cfg = this.config;
    const route = cfg.routes[routeId];
    if (!route) throw badRequest('Неизвестный маршрут');
    return this.db.tx(() => {
      const now = this.now();
      const p = this.players.load(playerId);
      this.refreshEnergy(p, cfg);
      if (!isUnlocked(route.unlockRule, this.unlockContext(p))) throw new ApiError('route_locked', 403, route.unlockText || 'Маршрут закрыт', { unlockText: route.unlockText });
      let cost = route.energyCost;
      let eventInstance: string | null = null;
      if (routeId === 'event') {
        const ev = currentEvent(cfg, now);
        if (!ev.active) throw new ApiError('event_inactive', 409, 'Событие сейчас не проводится');
        eventInstance = ev.instanceId;
        const ep = this.eventPlayer(ev.instanceId, p.id);
        const usedToday = ep.last_day === dayKey(now) ? ep.day_runs : 0;
        if (usedToday < cfg.event.freeAttemptsPerDay) cost = 0;
      }
      if (p.energy < cost) {
        const e = currentEnergy({ energy: p.energy, updatedAt: p.energyUpdatedAt }, now, cfg);
        throw new ApiError('insufficient_energy', 402, 'Недостаточно энергии', { required: cost, current: p.energy, nextInSec: e.nextInSec });
      }
      if (cost > 0) {
        const wasFull = p.energy >= cfg.energy.cap;
        p.energy -= cost;
        if (wasFull) p.energyUpdatedAt = now;
        this.ledger(p.id, 'run_energy', routeId, { energy: -cost });
      }
      const runId = newId('run');
      const seed = randomSeed();
      this.db.run(
        `INSERT INTO runs (id, player_id, route_id, seed, config_version, gear, status, started_at, week_key, event_instance, energy_spent)
         VALUES (?, ?, ?, ?, ?, ?, 'started', ?, ?, ?, ?)`,
        runId, p.id, routeId, seed, cfg.version, JSON.stringify(p.gear), now, weekKey(now), eventInstance, cost,
      );
      this.players.save(p, now);
      return {
        player: p,
        run: {
          runId,
          routeId,
          seed,
          configVersion: cfg.version,
          gear: p.gear,
          startedAt: now,
          energySpent: cost,
          token: runToken(this.env.sessionSecret, { id: runId, playerId: p.id, seed, routeId, configVersion: cfg.version }),
        },
      };
    });
  }

  private loadRun(playerId: string, runId: string): RunRow {
    const run = this.db.get<RunRow>('SELECT * FROM runs WHERE id = ?', runId);
    if (!run || run.player_id !== playerId) throw notFound('Забег не найден');
    return run;
  }

  revive(playerId: string, runId: string, method: 'token' | 'stars') {
    const cfg = this.config;
    return this.db.tx(() => {
      const run = this.loadRun(playerId, runId);
      if (run.status !== 'started') throw conflict('run_closed', 'Забег уже завершён');
      if (run.revive_paid) throw conflict('revive_used', 'Возрождение уже использовано в этом забеге');
      if (this.now() - run.started_at > RUN_EXPIRY_MS) throw conflict('run_expired', 'Забег устарел');
      const p = this.players.load(playerId);
      if (method === 'token') {
        if (p.reviveTokens < cfg.revive.tokenCost) throw new ApiError('insufficient_funds', 402, 'Нет жетонов возрождения', { currency: 'reviveTokens', required: cfg.revive.tokenCost, current: p.reviveTokens });
        p.reviveTokens -= cfg.revive.tokenCost;
        this.ledger(p.id, 'revive', runId, { reviveTokens: -cfg.revive.tokenCost });
      } else {
        this.spend(p, 'stars', cfg.revive.starsCost, 'revive', runId);
      }
      this.db.run('UPDATE runs SET revive_paid = 1 WHERE id = ?', runId);
      this.players.save(p, this.now());
      return p;
    });
  }

  static validateInputs(raw: unknown): InputRecord[] {
    if (!Array.isArray(raw) || raw.length > MAX_INPUTS) throw badRequest('Некорректный журнал забега');
    const out: InputRecord[] = [];
    let last = 0;
    for (const item of raw) {
      if (!Array.isArray(item) || item.length !== 2) throw badRequest('Некорректный журнал забега');
      const [t, a] = item as [unknown, unknown];
      if (!Number.isInteger(t) || (t as number) < last || (t as number) > 20000 || typeof a !== 'string' || !VALID_ACTIONS.has(a)) throw badRequest('Некорректный журнал забега');
      last = t as number;
      out.push([t as number, a as RunAction]);
    }
    return out;
  }

  /** Human input can't sustain more than ~10 lane changes per second. */
  static swipeRateOk(inputs: InputRecord[]): boolean {
    const swipes = inputs.filter(([, a]) => a === 'L' || a === 'R').map(([t]) => t);
    for (let i = 0, j = 0; i < swipes.length; i++) {
      while (swipes[i] - swipes[j] >= 60) j++;
      if (i - j + 1 > 11) return false;
    }
    return true;
  }

  finishRun(playerId: string, runId: string, body: { token?: string; inputs?: unknown; clientSummary?: Partial<RunSummary> }): RunResult {
    const existing = this.loadRun(playerId, runId);
    if (existing.status !== 'started') {
      if (!existing.result) throw conflict('run_closed', 'Забег уже завершён');
      return { ...(JSON.parse(existing.result) as RunResult), doubleAvailable: existing.double_claimed === 0 && existing.status === 'finished' };
    }
    const expectedToken = runToken(this.env.sessionSecret, { id: existing.id, playerId, seed: existing.seed, routeId: existing.route_id, configVersion: existing.config_version });
    if (body.token !== expectedToken) throw new ApiError('run_token_invalid', 403, 'Забег не подтверждён сервером');
    const inputs = Game.validateInputs(body.inputs);
    const cfg = this.configs.byVersion(existing.config_version) ?? this.config;
    const gear = sanitizeGear(JSON.parse(existing.gear));
    const replay = replayRun({ config: cfg, routeId: existing.route_id, seed: existing.seed, gear, revivesAllowed: existing.revive_paid }, inputs);
    const summary = replay.summary;
    const now = this.now();
    const elapsed = now - existing.started_at;
    let rejected: string | null = null;
    if (replay.stalled) rejected = 'input_log_invalid';
    else if (!Game.swipeRateOk(inputs)) rejected = 'impossible_input';
    else if (elapsed < (summary.durationTicks / 60) * 1000 * 0.8 - 1500) rejected = 'abnormal_timing';
    else if (elapsed > RUN_EXPIRY_MS) rejected = 'expired';
    const c = body.clientSummary;
    const desync = Boolean(c && (c.score !== summary.score || c.distance !== summary.distance || c.shards !== summary.shards));

    return this.db.tx(() => {
      const again = this.loadRun(playerId, runId);
      if (again.status !== 'started' && again.result) return JSON.parse(again.result) as RunResult;
      const p = this.players.load(playerId);
      const route = cfg.routes[existing.route_id];
      const prevBest = p.stats.routeBest[route.id]?.score ?? 0;
      const base: RunResult = {
        runId,
        routeId: route.id,
        summary,
        rewards: null,
        ranked: false,
        rejected,
        desync,
        newRecord: false,
        previousBest: prevBest,
        levelUps: 0,
        passLevelBefore: 0,
        passLevelAfter: 0,
        missionsCompleted: [],
        contribution: 0,
        doubleAvailable: false,
      };
      if (rejected) {
        this.db.run(`UPDATE runs SET status = 'rejected', finished_at = ?, reject_reason = ?, score = ?, result = ? WHERE id = ?`, now, rejected, summary.score, JSON.stringify(base), runId);
        return base;
      }

      let rewards = computeRunRewards(summary, route, gearMods(gear, cfg), existing.seed);
      if (route.id === 'tutorial') {
        if (p.tutorialDone) rewards = { bundle: { xp: 50 }, cards: [{ kind: 'xp', amount: 50, label: 'Опыт бегуна', rarity: 'common' }] };
        else {
          rewards.bundle.reviveTokens = (rewards.bundle.reviveTokens ?? 0) || 1;
          p.tutorialDone = true;
        }
      }
      const g = this.grant(p, rewards.bundle, 'run', runId);

      const st = p.stats;
      st.runs++;
      if (summary.finished) st.finishes++;
      st.totalShards += summary.shards;
      const newRecord = route.competitive && summary.score > prevBest;
      if (route.id !== 'tutorial') {
        const rb = st.routeBest[route.id] ?? { score: 0, distance: 0, finished: false };
        st.routeBest[route.id] = { score: Math.max(rb.score, summary.score), distance: Math.max(rb.distance, summary.distance), finished: rb.finished || summary.finished };
        if (summary.finished && !st.finishedRoutes.includes(route.id)) st.finishedRoutes.push(route.id);
        if (route.competitive) {
          st.bestScore = Math.max(st.bestScore, summary.score);
          st.bestDistance = Math.max(st.bestDistance, summary.distance);
        }
      }

      const completed = this.progressMissions(p, { summary });
      const ranked = route.competitive && !desync;
      if (ranked) this.submitLeaderboard(p.id, existing.week_key, summary, runId);

      let contribution = 0;
      if (route.id === 'event' && existing.event_instance) contribution = this.addEventContribution(existing.event_instance, p.id, summary, cfg);

      this.players.save(p, now);
      const result: RunResult = {
        ...base,
        rewards,
        ranked,
        newRecord,
        levelUps: g.levelUps,
        passLevelBefore: g.passLevelBefore,
        passLevelAfter: g.passLevelAfter,
        missionsCompleted: completed,
        contribution,
        doubleAvailable: route.id !== 'tutorial',
      };
      this.db.run(`UPDATE runs SET status = 'finished', finished_at = ?, ranked = ?, score = ?, result = ? WHERE id = ?`, now, ranked ? 1 : 0, summary.score, JSON.stringify(result), runId);
      return result;
    });
  }

  doubleReward(playerId: string, runId: string) {
    const cfg = this.config;
    return this.db.tx(() => {
      const run = this.loadRun(playerId, runId);
      if (run.status !== 'finished' || !run.result) throw conflict('run_not_finished', 'Забег ещё не завершён');
      if (run.double_claimed) throw conflict('already_claimed', 'Награда уже удвоена');
      const result = JSON.parse(run.result) as RunResult;
      if (!result.rewards || run.route_id === 'tutorial') throw conflict('not_available', 'Удвоение недоступно для этого забега');
      const p = this.players.load(playerId);
      this.spend(p, cfg.doubleReward.currency, cfg.doubleReward.amount, 'double_reward', runId);
      const bonus: RewardBundle = { credits: result.rewards.bundle.credits ?? 0, shards: result.rewards.bundle.shards ?? 0 };
      this.grant(p, bonus, 'double_reward', runId);
      this.db.run('UPDATE runs SET double_claimed = 1 WHERE id = ?', runId);
      this.players.save(p, this.now());
      return { player: p, bonus };
    });
  }

  // ───────────────────────── missions ─────────────────────────

  private periods(now = this.now()) {
    return { daily: `d:${dayKey(now)}`, weekly: `w:${weekKey(now)}` };
  }

  private activeFor(p: Player) {
    const cfg = this.config.season;
    const per = this.periods();
    return {
      daily: { key: per.daily, list: activeMissions(cfg.dailyMissionPool, cfg.dailyCount, p.id, per.daily) },
      weekly: { key: per.weekly, list: activeMissions(cfg.weeklyMissionPool, cfg.weeklyCount, p.id, per.weekly) },
    };
  }

  /** Updates mission progress; returns titles of missions that just became complete. */
  progressMissions(p: Player, ctx: MissionContext): string[] {
    const completed: string[] = [];
    const act = this.activeFor(p);
    for (const group of [act.daily, act.weekly]) {
      for (const m of group.list) {
        const d = missionDelta(m.metric, m, ctx);
        if (d.value <= 0) continue;
        const row = this.db.get<{ progress: number }>('SELECT progress FROM missions WHERE player_id = ? AND period_key = ? AND mission_id = ?', p.id, group.key, m.id);
        const before = row?.progress ?? 0;
        const after = d.mode === 'max' ? Math.max(before, d.value) : before + d.value;
        if (after === before) continue;
        this.db.run(
          `INSERT INTO missions (player_id, period_key, mission_id, progress) VALUES (?, ?, ?, ?)
           ON CONFLICT(player_id, period_key, mission_id) DO UPDATE SET progress = excluded.progress`,
          p.id, group.key, m.id, after,
        );
        if (before < m.target && after >= m.target) completed.push(m.title);
      }
    }
    return completed;
  }

  missionView(p: Player) {
    const act = this.activeFor(p);
    const now = this.now();
    const view = (key: string, list: MissionDef[]) =>
      list.map((m) => {
        const row = this.db.get<{ progress: number; claimed_at: number | null }>('SELECT progress, claimed_at FROM missions WHERE player_id = ? AND period_key = ? AND mission_id = ?', p.id, key, m.id);
        const progress = Math.min(m.target, row?.progress ?? 0);
        const claimed = Boolean(row?.claimed_at);
        return { id: m.id, title: m.title, metric: m.metric, progress, target: m.target, reward: m.reward, claimed, claimable: !claimed && progress >= m.target };
      });
    return {
      daily: view(act.daily.key, act.daily.list),
      weekly: view(act.weekly.key, act.weekly.list),
      dailyResetAt: dayEnd(now),
      weeklyResetAt: weekBounds(now).end,
    };
  }

  claimMission(playerId: string, period: 'daily' | 'weekly', missionId: string) {
    return this.db.tx(() => {
      const p = this.players.load(playerId);
      const group = this.activeFor(p)[period];
      const m = group?.list.find((x) => x.id === missionId);
      if (!m) throw notFound('Задание не найдено');
      const row = this.db.get<{ progress: number; claimed_at: number | null }>('SELECT progress, claimed_at FROM missions WHERE player_id = ? AND period_key = ? AND mission_id = ?', p.id, group.key, m.id);
      if (!row || row.progress < m.target) throw conflict('not_complete', 'Задание ещё не выполнено');
      if (row.claimed_at) throw conflict('already_claimed', 'Награда уже получена');
      this.db.run('UPDATE missions SET claimed_at = ? WHERE player_id = ? AND period_key = ? AND mission_id = ?', this.now(), p.id, group.key, m.id);
      this.grant(p, m.reward, 'mission', `${group.key}:${m.id}`);
      this.players.save(p, this.now());
      return { player: p, reward: m.reward };
    });
  }

  // ───────────────────────── gear & skins ─────────────────────────

  upgrade(playerId: string, slot: GearSlot, expectedLevel: number) {
    if (!GEAR_SLOTS.includes(slot)) throw badRequest('Неизвестный слот');
    const cfg = this.config;
    return this.db.tx(() => {
      const p = this.players.load(playerId);
      if (p.gear[slot] !== expectedLevel) throw conflict('stale_level', 'Уровень уже изменился', { level: p.gear[slot] });
      const cost = upgradeCost(slot, p.gear[slot], cfg);
      if (!cost) throw conflict('max_level', 'Достигнут максимальный уровень');
      if (p.credits < cost.credits) throw new ApiError('insufficient_funds', 402, 'Недостаточно кредитов', { currency: 'credits', required: cost.credits, current: p.credits });
      if (p.shards < cost.shards) throw new ApiError('insufficient_funds', 402, 'Недостаточно осколков', { currency: 'shards', required: cost.shards, current: p.shards });
      this.spend(p, 'credits', cost.credits, 'upgrade', slot);
      this.spend(p, 'shards', cost.shards, 'upgrade', slot);
      p.gear[slot] += 1;
      const completed = this.progressMissions(p, { upgrades: 1 });
      this.players.save(p, this.now());
      return { player: p, slot, level: p.gear[slot], missionsCompleted: completed };
    });
  }

  upgradeAll(playerId: string, expected: { credits: number; shards: number }) {
    const cfg = this.config;
    return this.db.tx(() => {
      const p = this.players.load(playerId);
      const plan = planUpgradeAll(p.gear, { credits: p.credits, shards: p.shards }, cfg);
      if (plan.steps.length === 0) throw conflict('nothing_affordable', 'Нет доступных улучшений');
      if (plan.total.credits !== expected.credits || plan.total.shards !== expected.shards) {
        throw conflict('plan_changed', 'Стоимость изменилась, подтвердите заново', { total: plan.total, steps: plan.steps });
      }
      this.spend(p, 'credits', plan.total.credits, 'upgrade_all', null);
      this.spend(p, 'shards', plan.total.shards, 'upgrade_all', null);
      p.gear = { ...plan.result } as GearLevels;
      const completed = this.progressMissions(p, { upgrades: plan.steps.length });
      this.players.save(p, this.now());
      return { player: p, steps: plan.steps, missionsCompleted: completed };
    });
  }

  equipSkin(playerId: string, skinId: string) {
    return this.db.tx(() => {
      const p = this.players.load(playerId);
      if (!p.ownedSkins.includes(skinId)) throw conflict('not_owned', 'Скин ещё не открыт');
      p.selectedSkin = skinId;
      this.players.save(p, this.now());
      return p;
    });
  }

  unlockSkin(playerId: string, skinId: string) {
    const cfg = this.config;
    return this.db.tx(() => {
      const p = this.players.load(playerId);
      const skin = skinById(cfg, skinId);
      if (!skin || !skin.price) throw conflict('not_purchasable', 'Этот скин нельзя купить напрямую');
      if (p.ownedSkins.includes(skinId)) throw conflict('already_owned', 'Скин уже открыт');
      if (skin.price.type === 'currency') this.spend(p, skin.price.currency, skin.price.amount, 'skin', skinId);
      else if (skin.price.type === 'fragments') {
        if (p.skinFragments < skin.price.amount) throw new ApiError('insufficient_funds', 402, 'Недостаточно фрагментов', { currency: 'skinFragments', required: skin.price.amount, current: p.skinFragments });
        p.skinFragments -= skin.price.amount;
        this.ledger(p.id, 'skin', skinId, { skinFragments: -skin.price.amount });
      } else throw conflict('not_purchasable', 'Этот скин продаётся в магазине');
      p.ownedSkins.push(skinId);
      p.selectedSkin = skinId;
      this.players.save(p, this.now());
      return p;
    });
  }

  completeTutorialSkip(playerId: string) {
    return this.db.tx(() => {
      const p = this.players.load(playerId);
      p.tutorialDone = true;
      this.players.save(p, this.now());
      return p;
    });
  }

  // ───────────────────────── shop & payments ─────────────────────────

  private productVisible(prod: ProductDef, p: Player): boolean {
    const now = this.now();
    if (prod.startAt && Date.parse(prod.startAt) > now) return false;
    if (prod.endAt && Date.parse(prod.endAt) <= now) return false;
    if (prod.visibilityCondition && !isUnlocked(prod.visibilityCondition, this.unlockContext(p))) return false;
    return true;
  }

  shop(p: Player) {
    const cfg = this.config;
    const season = currentSeason(cfg, this.now());
    const premium = this.passRow(p.id, season.seasonId).premium;
    return cfg.products
      .filter((prod) => this.productVisible(prod, p))
      .map((prod) => {
        const bought = p.stats.purchases[prod.productId] ?? 0;
        const ownedOut = (prod.type === 'pass' && premium) || (prod.purchaseLimit !== undefined && bought >= prod.purchaseLimit);
        return { ...prod, purchased: bought, available: !ownedOut };
      });
  }

  private orderView(row: { id: string; product_id: string; status: string; provider: string; invoice_url: string | null }, granted?: RewardBundle): OrderView {
    return { orderId: row.id, productId: row.product_id, status: row.status as OrderView['status'], provider: row.provider as OrderView['provider'], invoiceUrl: row.invoice_url, granted };
  }

  /** Step 1 of the purchase flow. Currency-priced goods settle immediately; XTR goods create a pending order. */
  createPurchase(playerId: string, productId: string, idemKey: string): { order: OrderView; player: Player; needsInvoice: boolean } {
    const cfg = this.config;
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(idemKey)) throw badRequest('Некорректный ключ покупки');
    return this.db.tx(() => {
      const p = this.players.load(playerId);
      const prior = this.db.get<{ id: string; product_id: string; status: string; provider: string; invoice_url: string | null }>('SELECT * FROM orders WHERE player_id = ? AND idem_key = ?', p.id, idemKey);
      if (prior) return { order: this.orderView(prior), player: p, needsInvoice: prior.status === 'pending' && prior.provider === 'telegram' && !prior.invoice_url };
      const prod = productById(cfg, productId);
      if (!prod || !this.productVisible(prod, p)) throw notFound('Товар недоступен');
      const listing = this.shop(p).find((x) => x.productId === productId);
      if (!listing?.available) throw conflict('purchase_limit', 'Этот товар уже куплен');
      const now = this.now();
      const orderId = newId('ord');
      if (prod.price.type === 'currency') {
        this.spend(p, prod.price.currency, prod.price.amount, 'purchase', orderId);
        this.grant(p, prod.contents, 'purchase', orderId);
        p.stats.purchases[prod.productId] = (p.stats.purchases[prod.productId] ?? 0) + 1;
        this.db.run(`INSERT INTO orders (id, player_id, product_id, status, idem_key, provider, price, created_at, updated_at) VALUES (?, ?, ?, 'paid', ?, 'internal', ?, ?, ?)`, orderId, p.id, prod.productId, idemKey, JSON.stringify(prod.price), now, now);
        this.players.save(p, now);
        return { order: { orderId, productId, status: 'paid', provider: 'internal', granted: prod.contents }, player: p, needsInvoice: false };
      }
      if (prod.price.type !== 'xtr') throw conflict('not_purchasable', 'Товар нельзя купить');
      const provider = this.env.botToken ? 'telegram' : this.env.paymentsSandbox ? 'sandbox' : null;
      if (!provider) throw new ApiError('payments_unavailable', 503, 'Оплата временно недоступна');
      this.db.run(`INSERT INTO orders (id, player_id, product_id, status, idem_key, provider, price, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`, orderId, p.id, prod.productId, idemKey, provider, JSON.stringify(prod.price), now, now);
      return { order: { orderId, productId, status: 'pending', provider, invoiceUrl: null }, player: p, needsInvoice: provider === 'telegram' };
    });
  }

  setInvoiceUrl(orderId: string, url: string) {
    this.db.run('UPDATE orders SET invoice_url = ?, updated_at = ? WHERE id = ?', url, this.now(), orderId);
  }

  orderStatus(playerId: string, orderId: string): OrderView {
    const row = this.db.get<{ id: string; player_id: string; product_id: string; status: string; provider: string; invoice_url: string | null }>('SELECT * FROM orders WHERE id = ?', orderId);
    if (!row || row.player_id !== playerId) throw notFound('Заказ не найден');
    const prod = productById(this.config, row.product_id);
    return this.orderView(row, row.status === 'paid' ? prod?.contents : undefined);
  }

  /** Validates a pending order for Telegram pre_checkout_query. */
  canCheckout(orderId: string, amount: number, currency: string): boolean {
    const row = this.db.get<{ status: string; price: string }>('SELECT status, price FROM orders WHERE id = ?', orderId);
    if (!row || row.status !== 'pending') return false;
    const price = JSON.parse(row.price) as { type: string; amount: number };
    return currency === 'XTR' && price.type === 'xtr' && price.amount === amount;
  }

  /** Grants an order exactly once, keyed by provider charge id. Safe under duplicate callbacks. */
  confirmOrder(orderId: string, chargeId: string, amount: number | null): { granted: boolean; order?: OrderView } {
    return this.db.tx(() => {
      const row = this.db.get<{ id: string; player_id: string; product_id: string; status: string; provider: string; invoice_url: string | null; price: string }>('SELECT * FROM orders WHERE id = ?', orderId);
      if (!row) return { granted: false };
      if (row.status === 'paid') return { granted: false, order: this.orderView(row) };
      const dup = this.db.get('SELECT id FROM orders WHERE provider_charge_id = ?', chargeId);
      if (dup) return { granted: false, order: this.orderView(row) };
      const price = JSON.parse(row.price) as { type: string; amount: number };
      if (amount !== null && price.amount !== amount) {
        this.db.run(`UPDATE orders SET status = 'failed', provider_charge_id = ?, updated_at = ? WHERE id = ?`, chargeId, this.now(), orderId);
        return { granted: false };
      }
      const prod = productById(this.config, row.product_id);
      if (!prod) return { granted: false };
      const p = this.players.load(row.player_id);
      this.grant(p, prod.contents, 'purchase', orderId);
      p.stats.purchases[prod.productId] = (p.stats.purchases[prod.productId] ?? 0) + 1;
      this.players.save(p, this.now());
      this.db.run(`UPDATE orders SET status = 'paid', provider_charge_id = ?, updated_at = ? WHERE id = ?`, chargeId, this.now(), orderId);
      return { granted: true, order: this.orderView({ ...row, status: 'paid' }, prod.contents) };
    });
  }

  cancelOrder(playerId: string, orderId: string, status: 'cancelled' | 'failed') {
    const row = this.db.get<{ player_id: string; status: string }>('SELECT player_id, status FROM orders WHERE id = ?', orderId);
    if (!row || row.player_id !== playerId) throw notFound('Заказ не найден');
    if (row.status === 'pending') this.db.run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', status, this.now(), orderId);
    return this.orderStatus(playerId, orderId);
  }

  // ───────────────────────── season pass ─────────────────────────

  passView(p: Player) {
    const cfg = this.config;
    const season = currentSeason(cfg, this.now());
    const pass = this.passRow(p.id, season.seasonId);
    const level = passLevelFromXp(pass.xp, cfg);
    const intoLevel = level >= cfg.season.levels ? cfg.season.xpPerLevel : pass.xp % cfg.season.xpPerLevel;
    return {
      season,
      xp: pass.xp,
      level,
      xpIntoLevel: intoLevel,
      xpPerLevel: cfg.season.xpPerLevel,
      premium: pass.premium,
      premiumPrice: cfg.season.premiumPrice,
      premiumProductId: cfg.season.premiumProductId,
      levels: cfg.season.rewards.map((r) => ({
        level: r.level,
        free: r.free,
        premium: r.premium,
        claimedFree: pass.claimed.includes(`free:${r.level}`),
        claimedPremium: pass.claimed.includes(`premium:${r.level}`),
        reached: r.level <= level,
      })),
      missions: this.missionView(p),
    };
  }

  claimPass(playerId: string, level: number | 'all', track: 'free' | 'premium' | 'all') {
    const cfg = this.config;
    return this.db.tx(() => {
      const p = this.players.load(playerId);
      const season = currentSeason(cfg, this.now());
      const pass = this.passRow(p.id, season.seasonId);
      const reached = passLevelFromXp(pass.xp, cfg);
      const targets = cfg.season.rewards.filter((r) => (level === 'all' ? r.level <= reached : r.level === level));
      if (level !== 'all' && (targets.length === 0 || level > reached)) throw conflict('level_locked', 'Уровень пропуска ещё не достигнут');
      const granted: RewardBundle[] = [];
      for (const r of targets) {
        for (const t of ['free', 'premium'] as const) {
          if (track !== 'all' && track !== t) continue;
          if (t === 'premium' && !pass.premium) {
            if (track === 'premium') throw conflict('premium_required', 'Нужен премиум-пропуск');
            continue;
          }
          const key = `${t}:${r.level}`;
          if (pass.claimed.includes(key)) {
            if (level !== 'all' && track !== 'all') throw conflict('already_claimed', 'Награда уже получена');
            continue;
          }
          pass.claimed.push(key);
          granted.push(r[t]);
        }
      }
      this.savePass(p.id, season.seasonId, pass);
      for (const b of granted) this.grant(p, b, 'pass', season.seasonId);
      this.players.save(p, this.now());
      return { player: p, granted };
    });
  }

  // ───────────────────────── leaderboard ─────────────────────────

  private submitLeaderboard(playerId: string, wk: string, summary: RunSummary, runId: string) {
    this.db.run(
      `INSERT INTO leaderboard (week_key, player_id, best_score, distance, run_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(week_key, player_id) DO UPDATE SET best_score = excluded.best_score, distance = excluded.distance, run_id = excluded.run_id, updated_at = excluded.updated_at
       WHERE excluded.best_score > leaderboard.best_score`,
      wk, playerId, summary.score, summary.distance, runId, this.now(),
    );
  }

  tierFor(rank: number, total: number) {
    const tiers = this.config.leaderboard.tiers;
    return tiers.find((t) => (t.maxRank !== undefined && rank <= t.maxRank) || (t.maxPercentile !== undefined && total > 0 && rank / total <= t.maxPercentile)) ?? null;
  }

  private settlePreviousWeek(p: Player) {
    const prev = weekKey(this.now() - 7 * DAY);
    const mine = this.db.get<{ best_score: number }>('SELECT best_score FROM leaderboard WHERE week_key = ? AND player_id = ?', prev, p.id);
    if (!mine) return;
    const done = this.db.get('SELECT 1 FROM lb_settlements WHERE week_key = ? AND player_id = ?', prev, p.id);
    if (done) return;
    const rank = (this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM leaderboard WHERE week_key = ? AND best_score > ?', prev, mine.best_score)?.n ?? 0) + 1;
    const total = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM leaderboard WHERE week_key = ?', prev)?.n ?? 0;
    const tier = this.tierFor(rank, total);
    this.db.run('INSERT OR IGNORE INTO lb_settlements (week_key, player_id, rank, tier, reward) VALUES (?, ?, ?, ?, ?)', prev, p.id, rank, tier?.id ?? null, tier ? JSON.stringify(tier.reward) : null);
  }

  claimWeekly(playerId: string) {
    return this.db.tx(() => {
      const p = this.players.load(playerId);
      const row = this.db.get<{ week_key: string; reward: string; rank: number }>('SELECT week_key, reward, rank FROM lb_settlements WHERE player_id = ? AND claimed_at IS NULL AND reward IS NOT NULL ORDER BY week_key LIMIT 1', p.id);
      if (!row) throw conflict('nothing_to_claim', 'Нет наград турнира');
      const changed = this.db.run('UPDATE lb_settlements SET claimed_at = ? WHERE week_key = ? AND player_id = ? AND claimed_at IS NULL', this.now(), row.week_key, p.id);
      if (Number(changed.changes) !== 1) throw conflict('already_claimed', 'Награда уже получена');
      const reward = JSON.parse(row.reward) as RewardBundle;
      this.grant(p, reward, 'weekly', row.week_key);
      this.players.save(p, this.now());
      return { player: p, reward, rank: row.rank, weekKey: row.week_key };
    });
  }

  leaderboard(p: Player, tab: 'top' | 'friends') {
    const now = this.now();
    const wk = weekKey(now);
    const total = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM leaderboard WHERE week_key = ?', wk)?.n ?? 0;
    type LbRow = { player_id: string; best_score: number; distance: number; display_name: string; avatar_url: string | null; level: number; selected_skin: string };
    const decorate = (rows: LbRow[], rankOf: (r: LbRow, i: number) => number) =>
      rows.map((r, i) => {
        const rank = rankOf(r, i);
        const tier = this.tierFor(rank, total);
        return { rank, playerId: r.player_id, name: r.display_name, avatarUrl: r.avatar_url, level: r.level, skin: r.selected_skin, score: r.best_score, distance: r.distance, reward: tier?.reward ?? null, tierId: tier?.id ?? null, me: r.player_id === p.id };
      });
    const globalRank = (score: number) => (this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM leaderboard WHERE week_key = ? AND best_score > ?', wk, score)?.n ?? 0) + 1;
    let rows;
    if (tab === 'friends') {
      const list = this.db.all<LbRow>(
        `SELECT l.player_id, l.best_score, l.distance, pl.display_name, pl.avatar_url, pl.level, pl.selected_skin FROM leaderboard l JOIN players pl ON pl.id = l.player_id
         WHERE l.week_key = ? AND (l.player_id = ? OR l.player_id IN (SELECT friend_id FROM friends WHERE player_id = ?)) ORDER BY l.best_score DESC LIMIT 100`,
        wk, p.id, p.id,
      );
      rows = decorate(list, (r) => globalRank(r.best_score));
    } else {
      const list = this.db.all<LbRow>(
        `SELECT l.player_id, l.best_score, l.distance, pl.display_name, pl.avatar_url, pl.level, pl.selected_skin FROM leaderboard l JOIN players pl ON pl.id = l.player_id
         WHERE l.week_key = ? ORDER BY l.best_score DESC, l.updated_at ASC LIMIT 100`,
        wk,
      );
      rows = decorate(list, (_, i) => i + 1);
    }
    const mineRow = this.db.get<{ best_score: number; distance: number }>('SELECT best_score, distance FROM leaderboard WHERE week_key = ? AND player_id = ?', wk, p.id);
    const myRank = mineRow ? globalRank(mineRow.best_score) : null;
    const myTier = myRank ? this.tierFor(myRank, total) : null;
    const friendsCount = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM friends WHERE player_id = ?', p.id)?.n ?? 0;
    const pending = this.db.get<{ week_key: string; rank: number; reward: string }>('SELECT week_key, rank, reward FROM lb_settlements WHERE player_id = ? AND claimed_at IS NULL AND reward IS NOT NULL ORDER BY week_key LIMIT 1', p.id);
    return {
      weekKey: wk,
      endsAt: weekBounds(now).end,
      total,
      rows,
      me: {
        rank: myRank,
        score: mineRow?.best_score ?? 0,
        distance: mineRow?.distance ?? 0,
        reward: myTier?.reward ?? null,
        tierId: myTier?.id ?? null,
        name: p.displayName,
        avatarUrl: p.avatarUrl,
        level: p.level,
      },
      friendsCount,
      tiers: this.config.leaderboard.tiers,
      pending: pending ? { weekKey: pending.week_key, rank: pending.rank, reward: JSON.parse(pending.reward) as RewardBundle } : null,
    };
  }

  // ───────────────────────── community event ─────────────────────────

  private eventPlayer(instanceId: string, playerId: string) {
    return (
      this.db.get<{ damage: number; best: number; runs: number; last_day: string | null; day_runs: number }>('SELECT * FROM event_players WHERE instance_id = ? AND player_id = ?', instanceId, playerId) ?? {
        damage: 0,
        best: 0,
        runs: 0,
        last_day: null,
        day_runs: 0,
      }
    );
  }

  private addEventContribution(instanceId: string, playerId: string, summary: RunSummary, cfg: RemoteConfig): number {
    const dmg = eventContribution(summary, cfg);
    const now = this.now();
    const today = dayKey(now);
    const ep = this.eventPlayer(instanceId, playerId);
    const isNew = ep.runs === 0;
    this.db.run(
      `INSERT INTO event_players (instance_id, player_id, damage, best, runs, last_day, day_runs, last_damage, updated_at) VALUES (?, ?, ?, ?, 1, ?, 1, ?, ?)
       ON CONFLICT(instance_id, player_id) DO UPDATE SET damage = damage + excluded.damage, best = MAX(best, excluded.best), runs = runs + 1,
         day_runs = CASE WHEN last_day = excluded.last_day THEN day_runs + 1 ELSE 1 END, last_day = excluded.last_day, last_damage = excluded.last_damage, updated_at = excluded.updated_at`,
      instanceId, playerId, dmg, dmg, today, dmg, now,
    );
    this.db.run(
      `INSERT INTO event_totals (instance_id, damage, participants) VALUES (?, ?, ?)
       ON CONFLICT(instance_id) DO UPDATE SET damage = damage + excluded.damage, participants = participants + excluded.participants`,
      instanceId, dmg, isNew ? 1 : 0,
    );
    return dmg;
  }

  eventView(p: Player) {
    const cfg = this.config;
    const now = this.now();
    const ev = currentEvent(cfg, now);
    const totals = this.db.get<{ damage: number; participants: number }>('SELECT damage, participants FROM event_totals WHERE instance_id = ?', ev.instanceId) ?? { damage: 0, participants: 0 };
    const mine = this.eventPlayer(ev.instanceId, p.id);
    const usedToday = mine.last_day === dayKey(now) ? mine.day_runs : 0;
    const claimed = new Set(this.db.all<{ milestone: number }>('SELECT milestone FROM event_claims WHERE instance_id = ? AND player_id = ?', ev.instanceId, p.id).map((r) => r.milestone));
    const pct = Math.min(1, totals.damage / cfg.event.bossHp);
    const recent = this.db.all<{ display_name: string; last_damage: number; updated_at: number }>(
      `SELECT pl.display_name, ep.last_damage, ep.updated_at FROM event_players ep JOIN players pl ON pl.id = ep.player_id WHERE ep.instance_id = ? ORDER BY ep.updated_at DESC LIMIT 5`,
      ev.instanceId,
    );
    const top = this.db.all<{ player_id: string; display_name: string; damage: number }>(
      `SELECT ep.player_id, pl.display_name, ep.damage FROM event_players ep JOIN players pl ON pl.id = ep.player_id WHERE ep.instance_id = ? ORDER BY ep.damage DESC LIMIT 10`,
      ev.instanceId,
    );
    return {
      eventId: cfg.event.eventId,
      instanceId: ev.instanceId,
      title: cfg.event.title,
      bossName: cfg.event.bossName,
      active: ev.active,
      startAt: ev.startAt,
      endAt: ev.endAt,
      bossHp: cfg.event.bossHp,
      damage: totals.damage,
      participants: totals.participants,
      pct,
      me: { damage: mine.damage, best: mine.best, runs: mine.runs, freeAttemptsLeft: Math.max(0, cfg.event.freeAttemptsPerDay - usedToday) },
      freeAttemptsPerDay: cfg.event.freeAttemptsPerDay,
      energyCost: cfg.routes.event.energyCost,
      milestones: cfg.event.milestones.map((m, i) => ({ ...m, index: i, reached: pct >= m.pct, claimed: claimed.has(i), claimable: pct >= m.pct && !claimed.has(i) && mine.runs > 0 })),
      recent: recent.map((r) => ({ name: r.display_name, damage: r.last_damage, at: r.updated_at })),
      top: top.map((r, i) => ({ rank: i + 1, name: r.display_name, damage: r.damage, me: r.player_id === p.id })),
    };
  }

  claimEventMilestone(playerId: string, index: number) {
    const cfg = this.config;
    return this.db.tx(() => {
      const p = this.players.load(playerId);
      const view = this.eventView(p);
      const m = view.milestones[index];
      if (!m) throw notFound('Этап не найден');
      if (!m.claimable) throw conflict(m.claimed ? 'already_claimed' : 'not_reached', m.claimed ? 'Награда уже получена' : 'Этап ещё не достигнут');
      this.db.run('INSERT INTO event_claims (instance_id, player_id, milestone, claimed_at) VALUES (?, ?, ?, ?)', view.instanceId, p.id, index, this.now());
      this.grant(p, cfg.event.milestones[index].reward, 'event', `${view.instanceId}:${index}`);
      this.players.save(p, this.now());
      return { player: p, reward: cfg.event.milestones[index].reward };
    });
  }

  // ───────────────────────── analytics ─────────────────────────

  track(playerId: string | null, events: unknown) {
    if (!Array.isArray(events)) return 0;
    let n = 0;
    for (const e of events.slice(0, 50)) {
      const name = (e as { name?: unknown })?.name;
      if (typeof name !== 'string' || !/^[a-z_]{2,40}$/.test(name)) continue;
      const props = JSON.stringify((e as { props?: unknown }).props ?? {}).slice(0, 2000);
      const ts = Number((e as { ts?: unknown }).ts) || this.now();
      this.db.run('INSERT INTO analytics (player_id, name, props, ts) VALUES (?, ?, ?, ?)', playerId, name, props, ts);
      n++;
    }
    return n;
  }

  boostsAllowed(): BoostId[] {
    return Object.keys(this.config.boosts) as BoostId[];
  }
}
