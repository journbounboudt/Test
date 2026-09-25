import { TICK_RATE, type RemoteConfig, type RouteConfig } from './config.ts';
import { gearMods, type GearMods } from './gear.ts';
import { PICKUP_KINDS, RouteStream, type Entity } from './generator.ts';
import { Rng, mixSeed } from './rng.ts';
import { BOOST_IDS, type BoostId, type GearLevels, type Grade, type InputRecord, type RouteId, type RunAction } from './types.ts';

const DT = 1 / TICK_RATE;

export type SimPhase = 'run' | 'checkpoint' | 'down' | 'finishing' | 'done';

export type SimEvent =
  | { type: 'pickup'; kind: Entity['kind']; id: number; lane: number; z: number; magnet: boolean }
  | { type: 'near'; id: number }
  | { type: 'soft'; id: number }
  | { type: 'hard'; id: number }
  | { type: 'block'; id: number; by: 'shield' | 'boost' | 'invuln' }
  | { type: 'smash'; id: number }
  | { type: 'lane'; dir: -1 | 1 }
  | { type: 'checkpoint'; index: number; options: BoostId[] }
  | { type: 'boost'; id: BoostId }
  | { type: 'gadget'; gadget: 'shield' | 'magnet' | 'ult' }
  | { type: 'ultReady' }
  | { type: 'combo'; combo: number; mult: number }
  | { type: 'hint'; hint: string }
  | { type: 'revive' }
  | { type: 'finishStart'; portalZ: number }
  | { type: 'done'; finished: boolean };

export interface RunSetup {
  config: RemoteConfig;
  routeId: RouteId;
  seed: number;
  gear: GearLevels;
  revivesAllowed: number;
  emitEvents?: boolean;
}

export interface ScoreBreakdown {
  distance: number;
  pickups: number;
  combo: number;
  nearMiss: number;
  finish: number;
  modifier: number;
}

export interface RunSummary {
  routeId: RouteId;
  finished: boolean;
  score: number;
  breakdown: ScoreBreakdown;
  distance: number;
  shards: number;
  credits: number;
  charges: number;
  cores: number;
  maxCombo: number;
  nearMisses: number;
  softHits: number;
  hardHits: number;
  shieldBlocks: number;
  ultActivations: number;
  gadgetUses: number;
  swipes: number;
  durationTicks: number;
  boosts: BoostId[];
  revivesUsed: number;
  luck: number;
  grade: Grade;
}

export function gradeFor(score: number, route: RouteConfig, finished: boolean): Grade {
  const [b, a, s, sp] = route.gradeThresholds;
  let g: Grade = 'C';
  if (score >= sp) g = 'S+';
  else if (score >= s) g = 'S';
  else if (score >= a) g = 'A';
  else if (score >= b) g = 'B';
  // A failed run can never be S-tier.
  if (!finished && (g === 'S' || g === 'S+')) g = 'A';
  return g;
}

export function checkpointOptions(seed: number, index: number, routeId: RouteId): BoostId[] {
  if (routeId === 'tutorial') return ['speed', 'magnet', 'shield'];
  const rng = new Rng(mixSeed(seed, 1000 + index));
  return rng.shuffle([...BOOST_IDS]).slice(0, 3);
}

export class RunSim {
  readonly config: RemoteConfig;
  readonly route: RouteConfig;
  readonly mods: GearMods;
  readonly seed: number;
  readonly stream: RouteStream;
  readonly revivesAllowed: number;
  readonly emitEvents: boolean;
  readonly durationTicks: number;

  entities: Entity[] = [];
  first = 0;
  events: SimEvent[] = [];

  tick = 0;
  phase: SimPhase = 'run';
  finished = false;
  z = 0;
  prevZ = 0;
  speed = 0;
  laneX = 1;
  laneTarget = 1;
  queued = 0;
  lastLaneChangeTick = -1000;
  laneBeforeChange = 1;

  softTicks = 0;
  combo = 0;
  maxCombo = 0;
  lastComboGainTick = 0;
  ult = 0;
  ultUntil = 0;
  shieldCharges: number;
  shieldUntil = 0;
  magnetCharges: number;
  magnetUntil = 0;
  boostShields = 0;
  speedBoostUntil = 0;
  magnetBoost = false;
  comboBoost = false;
  breakthrough = false;
  luck = 0;
  invulnUntil = 0;
  revivesUsed = 0;
  checkpointOptions: BoostId[] | null = null;
  checkpointIndex = -1;
  boosts: BoostId[] = [];
  finishTick = 0;
  portalZ = 0;

  shards = 0;
  credits = 0;
  charges = 0;
  cores = 0;
  nearMisses = 0;
  softHits = 0;
  hardHits = 0;
  shieldBlocks = 0;
  ultActivations = 0;
  gadgetUses = 0;
  swipes = 0;
  pickupPts = 0;
  comboPts = 0;
  nearPts = 0;

  constructor(setup: RunSetup) {
    this.config = setup.config;
    this.route = setup.config.routes[setup.routeId];
    if (!this.route) throw new Error(`Unknown route ${setup.routeId}`);
    this.mods = gearMods(setup.gear, setup.config);
    this.seed = setup.seed >>> 0;
    this.stream = new RouteStream(this.route, setup.config.sim, this.seed);
    this.revivesAllowed = setup.revivesAllowed;
    this.emitEvents = setup.emitEvents ?? false;
    this.durationTicks = Math.round(this.route.durationSec * TICK_RATE);
    this.shieldCharges = this.mods.shieldCharges;
    this.magnetCharges = this.mods.magnetCharges;
    this.speed = this.stream.profile.speedAt(0) * this.mods.speedMult;
    this.stream.fill(this.config.sim.generateAhead, this.entities);
  }

  get frozen(): boolean {
    return this.phase === 'checkpoint' || this.phase === 'down';
  }

  /** Deep copy used for lookahead (bots, tests). */
  clone(): RunSim {
    const c = Object.create(RunSim.prototype) as RunSim;
    Object.assign(c, this);
    c.entities = this.entities.slice(this.first).map((e) => ({ ...e }));
    c.first = 0;
    c.events = [];
    c.boosts = [...this.boosts];
    c.checkpointOptions = this.checkpointOptions ? [...this.checkpointOptions] : null;
    (c as { stream: RouteStream }).stream = this.stream.clone();
    return c;
  }

  get done(): boolean {
    return this.phase === 'done';
  }

  get ultActive(): boolean {
    return this.tick < this.ultUntil;
  }

  get shieldActive(): boolean {
    return this.tick < this.shieldUntil;
  }

  get magnetActive(): boolean {
    return this.tick < this.magnetUntil;
  }

  get comboMult(): number {
    const s = this.config.sim;
    return Math.min(s.comboMultCap, 1 + Math.floor(this.combo / s.comboStep));
  }

  get timeLeft(): number {
    return Math.max(0, (this.durationTicks - this.tick) / TICK_RATE);
  }

  private emit(e: SimEvent) {
    if (this.emitEvents) this.events.push(e);
  }

  /** Applies actions for the current tick, then advances one fixed step if the run is live. */
  step(actions: readonly RunAction[] = []): void {
    for (const a of actions) this.apply(a);
    if (this.phase === 'run' || this.phase === 'finishing') this.advance();
  }

  private laneChange(dir: -1 | 1) {
    const target = Math.max(0, Math.min(2, this.laneTarget + dir));
    if (target === this.laneTarget) return;
    this.laneBeforeChange = this.laneTarget;
    this.laneTarget = target;
    this.lastLaneChangeTick = this.tick;
    this.swipes++;
    this.emit({ type: 'lane', dir });
  }

  private apply(a: RunAction) {
    if (this.phase === 'done') return;
    if (a === 'end') {
      this.finish(false);
      return;
    }
    if (a === 'L' || a === 'R') {
      if (this.phase !== 'run') return;
      const dir = a === 'L' ? -1 : 1;
      const moving = this.laneX !== this.laneTarget;
      if (!moving) {
        this.laneChange(dir);
      } else {
        const movingDir = this.laneTarget > this.laneX ? 1 : -1;
        if (dir !== movingDir) {
          this.queued = 0;
          this.laneChange(dir);
        } else if (Math.abs(this.laneTarget - this.laneX) <= this.config.sim.inputBufferLanes) {
          this.queued = dir;
        }
      }
      return;
    }
    if (a === 'shield') {
      if (this.phase !== 'run' || this.shieldCharges <= 0 || this.shieldActive) return;
      this.shieldCharges--;
      this.shieldUntil = this.tick + Math.round(this.mods.shieldDurationSec * TICK_RATE);
      this.gadgetUses++;
      this.emit({ type: 'gadget', gadget: 'shield' });
      return;
    }
    if (a === 'magnet') {
      if (this.phase !== 'run' || this.magnetCharges <= 0 || this.magnetActive) return;
      this.magnetCharges--;
      this.magnetUntil = this.tick + Math.round(this.mods.magnetDurationSec * TICK_RATE);
      this.gadgetUses++;
      this.emit({ type: 'gadget', gadget: 'magnet' });
      return;
    }
    if (a === 'ult') {
      if (this.phase !== 'run' || this.ult < 1 || this.ultActive) return;
      this.ult = 0;
      this.ultUntil = this.tick + Math.round(this.mods.ultDurationSec * TICK_RATE);
      this.ultActivations++;
      this.emit({ type: 'gadget', gadget: 'ult' });
      return;
    }
    if (a === 'revive') {
      if (this.phase !== 'down' || this.revivesUsed >= this.revivesAllowed) return;
      this.revivesUsed++;
      this.phase = 'run';
      this.invulnUntil = this.tick + Math.round(this.config.sim.reviveInvulnSec * TICK_RATE);
      this.combo = Math.floor(this.combo * 0.25);
      const lane = this.safestLane();
      this.laneX = lane;
      this.laneTarget = lane;
      this.queued = 0;
      this.softTicks = 0;
      this.emit({ type: 'revive' });
      return;
    }
    if (a.startsWith('boost:')) {
      if (this.phase !== 'checkpoint' || !this.checkpointOptions) return;
      const id = a.slice(6) as BoostId;
      if (!this.checkpointOptions.includes(id)) return;
      this.applyBoost(id);
      this.checkpointOptions = null;
      this.phase = 'run';
      this.invulnUntil = Math.max(this.invulnUntil, this.tick + Math.round(this.config.sim.checkpointGraceSec * TICK_RATE));
    }
  }

  private applyBoost(id: BoostId) {
    const def = this.config.boosts[id];
    this.boosts.push(id);
    switch (id) {
      case 'speed':
        this.speedBoostUntil = this.tick + Math.round((def.durationSec ?? 12) * TICK_RATE);
        break;
      case 'magnet':
        this.magnetBoost = true;
        break;
      case 'shield':
        this.boostShields += 1;
        break;
      case 'combo':
        this.comboBoost = true;
        break;
      case 'luck':
        this.luck += def.value;
        break;
      case 'breakthrough':
        this.breakthrough = true;
        break;
    }
    this.emit({ type: 'boost', id });
  }

  /** Lane whose nearest upcoming hard hazard is farthest away; prefers staying put. */
  private safestLane(): number {
    let best = this.laneTarget;
    let bestDist = -1;
    for (const lane of [this.laneTarget, 0, 1, 2]) {
      let nearest = Infinity;
      for (let i = this.first; i < this.entities.length; i++) {
        const e = this.entities[i];
        if (e.z > this.z + 120) break;
        if (!e.hard || e.state !== 0 || e.z + e.len < this.z) continue;
        if (e.mask & (1 << lane)) nearest = Math.min(nearest, e.z - this.z);
      }
      if (nearest > bestDist + 1) {
        best = lane;
        bestDist = nearest;
      }
    }
    return best;
  }

  private gainCombo(n: number) {
    const before = this.comboMult;
    this.combo += n * (this.comboBoost ? 2 : 1);
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.lastComboGainTick = this.tick;
    if (this.comboMult !== before) this.emit({ type: 'combo', combo: this.combo, mult: this.comboMult });
  }

  private chargeUlt(amount: number) {
    if (this.ultActive || this.ult >= 1) return;
    this.ult = Math.min(1, this.ult + amount * this.mods.ultChargeMult * (this.breakthrough ? 1.5 : 1));
    if (this.ult >= 1) this.emit({ type: 'ultReady' });
  }

  private scoreMult(): number {
    let m = this.mods.scoreMult;
    if (this.ultActive) m *= this.config.sim.ult.scoreMult;
    if (this.tick < this.speedBoostUntil) m *= 1.25;
    return m;
  }

  private addPoints(base: number) {
    const m = this.scoreMult();
    this.pickupPts += base * m;
    this.comboPts += base * (this.comboMult - 1) * this.mods.comboPtsMult * m;
  }

  private advance() {
    const s = this.config.sim;
    // Lane movement
    const laneStep = s.laneSpeed * this.mods.laneSpeedMult * DT;
    if (this.laneX < this.laneTarget) this.laneX = Math.min(this.laneTarget, this.laneX + laneStep);
    else if (this.laneX > this.laneTarget) this.laneX = Math.max(this.laneTarget, this.laneX - laneStep);
    if (this.laneX === this.laneTarget && this.queued !== 0) {
      const q = this.queued as -1 | 1;
      this.queued = 0;
      this.laneChange(q);
    }

    // Speed
    const t = this.tick * DT;
    let mult = this.mods.speedMult;
    if (this.tick < this.speedBoostUntil) mult *= 1 + this.config.boosts.speed.value;
    if (this.ultActive) mult *= this.mods.ultSpeedMult;
    if (this.softTicks > 0) {
      const total = s.softRecoverSec * TICK_RATE;
      const depth = (1 - s.softSlowdown) * (1 - this.mods.softSlowReduce);
      mult *= 1 - depth * (this.softTicks / total);
      this.softTicks--;
    }
    this.speed = this.stream.profile.speedAt(t) * mult;
    this.prevZ = this.z;
    this.z += this.speed * DT;
    this.tick++;

    this.stream.fill(this.z + s.generateAhead, this.entities);
    this.collide();

    // Combo decay
    const delay = s.comboDecayDelaySec * TICK_RATE * (this.comboBoost ? 1.6 : 1);
    const since = this.tick - this.lastComboGainTick;
    if (this.combo > 0 && since > delay && since % Math.max(1, Math.round(s.comboDecayIntervalSec * TICK_RATE)) === 0) {
      const before = this.comboMult;
      this.combo--;
      if (this.comboMult !== before) this.emit({ type: 'combo', combo: this.combo, mult: this.comboMult });
    }

    if (this.phase === 'run' && this.tick >= this.durationTicks) this.startFinish();
    else if (this.phase === 'finishing' && this.tick >= this.finishTick) this.finish(true);

    this.prune();
  }

  private startFinish() {
    this.phase = 'finishing';
    this.finishTick = this.tick + Math.round(this.config.sim.finishRunSec * TICK_RATE);
    this.portalZ = this.z + this.speed * this.config.sim.finishRunSec;
    for (let i = this.first; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.hard || e.kind === 'debris' || e.kind === 'spike' || e.kind === 'checkpoint') {
        if (e.state === 0) e.state = 2;
      } else if (e.z > this.portalZ && e.state === 0) e.state = 2;
    }
    this.emit({ type: 'finishStart', portalZ: this.portalZ });
  }

  private finish(finished: boolean) {
    if (this.phase === 'done') return;
    this.finished = finished;
    this.phase = 'done';
    this.emit({ type: 'done', finished });
  }

  mineX(e: Entity, tick = this.tick): number {
    const p = e.periodTicks ?? 60;
    const u = ((tick + (e.phaseTicks ?? 0)) % p) / p;
    const tri = u < 0.5 ? u * 2 : 2 - u * 2;
    return (e.a ?? 0) + ((e.b ?? 1) - (e.a ?? 0)) * tri;
  }

  private collide() {
    const s = this.config.sim;
    const px = this.laneX;
    const zLo = this.prevZ - 0.35;
    const zHi = this.z + 0.35;
    const magnetOn = this.magnetActive || this.ultActive;
    const reach = s.magnet.reach + this.mods.magnetReachBonus;
    const radius = s.pickupRadius * (this.magnetBoost ? 1.8 : 1);

    for (let i = this.first; i < this.entities.length; i++) {
      const e = this.entities[i];
      const key = e.z0 ?? e.z;
      if (key > this.z + 90) break;
      if (e.state !== 0) continue;

      if (PICKUP_KINDS.has(e.kind)) {
        const dx = Math.abs(px - e.lane);
        let got = false;
        let viaMagnet = false;
        if (e.z > this.prevZ - 0.8 && e.z <= this.z + 0.8 && dx <= radius) got = true;
        else if (magnetOn && e.z > this.prevZ - 1 && e.z <= this.z + reach && dx <= s.magnet.lanes) {
          got = true;
          viaMagnet = true;
        }
        if (got) this.collect(e, viaMagnet);
        else if (e.z < this.prevZ - 1) e.state = 2;
        continue;
      }

      if (e.kind === 'checkpoint') {
        if (e.z <= this.z && this.phase === 'run') {
          e.state = 1;
          this.checkpointIndex = e.cpIndex ?? this.checkpointIndex + 1;
          this.checkpointOptions = checkpointOptions(this.seed, this.checkpointIndex, this.route.id);
          this.phase = 'checkpoint';
          this.gainCombo(s.comboGain.checkpoint);
          this.emit({ type: 'checkpoint', index: this.checkpointIndex, options: this.checkpointOptions });
          return;
        }
        continue;
      }

      if (e.kind === 'hint') {
        if (e.z - this.z < this.speed * 1.4) {
          e.state = 1;
          this.emit({ type: 'hint', hint: e.hint ?? '' });
        }
        continue;
      }

      // Hazards
      let lo: number;
      let hi: number;
      if (e.kind === 'pulse') {
        const z0 = e.z0 ?? e.z;
        if (e.actTick === undefined && z0 - this.z < this.speed * s.pulseActivateSec) e.actTick = this.tick;
        const prevWall = e.z;
        if (e.actTick !== undefined) e.z = z0 - s.pulseWallSpeed * (this.tick - e.actTick) * DT;
        lo = e.z - e.len / 2;
        hi = prevWall + e.len / 2;
      } else if (e.kind === 'hole') {
        lo = e.z;
        hi = e.z + e.len;
      } else {
        lo = e.z - e.len / 2;
        hi = e.z + e.len / 2;
      }

      if (hi >= zLo && lo <= zHi) {
        if (this.overlapsX(e, px)) {
          if (e.hard) this.hitHard(e);
          else this.hitSoft(e);
          if (this.phase !== 'run' && this.phase !== 'finishing') return;
        }
      } else if (hi < zLo) {
        e.state = 2;
        if (e.hard && e.kind !== 'hole' && this.tick - this.lastLaneChangeTick <= s.nearMissWindowTicks && this.blocksLane(e, this.laneBeforeChange)) {
          this.nearMisses++;
          this.nearPts += s.score.nearMiss * this.comboMult * this.scoreMult();
          this.gainCombo(s.comboGain.nearMiss);
          this.chargeUlt(s.ult.chargeNearMiss);
          this.emit({ type: 'near', id: e.id });
        }
      }
    }
  }

  private blocksLane(e: Entity, lane: number): boolean {
    if (e.kind === 'mine') return Math.abs(this.mineX(e) - lane) < 0.75;
    if (e.kind === 'pulse') return lane !== e.open;
    return (e.mask & (1 << lane)) !== 0;
  }

  private overlapsX(e: Entity, px: number): boolean {
    const hw = this.config.sim.playerHalfWidth;
    switch (e.kind) {
      case 'hole':
        for (let l = 0; l < 3; l++) if (e.mask & (1 << l) && Math.abs(px - l) < this.config.sim.holeHalfWidth) return true;
        return false;
      case 'mine':
        return Math.abs(px - this.mineX(e)) < hw + 0.36;
      case 'pulse':
        return Math.abs(px - (e.open ?? 1)) > 0.46 - hw;
      default: {
        const half = e.kind === 'spike' ? 0.3 : e.kind === 'debris' ? 0.4 : 0.42;
        for (let l = 0; l < 3; l++) if (e.mask & (1 << l) && Math.abs(px - l) < hw + half) return true;
        return false;
      }
    }
  }

  private collect(e: Entity, magnet: boolean) {
    const s = this.config.sim;
    e.state = 1;
    switch (e.kind) {
      case 'shard':
        this.shards++;
        this.addPoints(s.score.shard);
        this.gainCombo(s.comboGain.shard);
        this.chargeUlt(s.ult.chargeShard);
        break;
      case 'credit':
        this.credits++;
        this.addPoints(s.score.credit);
        this.gainCombo(s.comboGain.shard);
        break;
      case 'charge':
        this.charges++;
        this.addPoints(s.score.boostCharge);
        this.chargeUlt(s.ult.chargePickup);
        break;
      case 'core':
        this.cores++;
        this.addPoints(s.score.eventCore);
        this.gainCombo(s.comboGain.shard);
        break;
    }
    this.emit({ type: 'pickup', kind: e.kind, id: e.id, lane: e.lane, z: e.z, magnet });
  }

  private hitHard(e: Entity) {
    e.state = 1;
    if (this.phase === 'finishing' || this.tick < this.invulnUntil) {
      this.emit({ type: 'block', id: e.id, by: 'invuln' });
      return;
    }
    if (this.ultActive) {
      this.pickupPts += this.config.sim.score.smash * this.scoreMult();
      this.emit({ type: 'smash', id: e.id });
      return;
    }
    if (this.shieldActive) {
      this.shieldUntil = this.tick;
      this.shieldBlocks++;
      this.invulnUntil = this.tick + 30;
      this.emit({ type: 'block', id: e.id, by: 'shield' });
      return;
    }
    if (this.boostShields > 0) {
      this.boostShields--;
      this.shieldBlocks++;
      this.invulnUntil = this.tick + 30;
      this.emit({ type: 'block', id: e.id, by: 'boost' });
      return;
    }
    if (this.route.forgiving) {
      this.hitSoft(e);
      return;
    }
    this.hardHits++;
    this.phase = 'down';
    this.queued = 0;
    this.emit({ type: 'hard', id: e.id });
  }

  private hitSoft(e: Entity) {
    e.state = 1;
    if (this.phase === 'finishing' || this.tick < this.invulnUntil || this.ultActive || this.shieldActive) {
      this.emit({ type: 'block', id: e.id, by: 'invuln' });
      return;
    }
    this.softHits++;
    this.combo = Math.floor(this.combo * this.config.sim.softComboKeep);
    this.softTicks = Math.round(this.config.sim.softRecoverSec * TICK_RATE);
    this.emit({ type: 'soft', id: e.id });
  }

  private prune() {
    while (this.first < this.entities.length) {
      const e = this.entities[this.first];
      const end = e.kind === 'hole' ? e.z + e.len : e.z + 4;
      if (e.state !== 0 && end < this.z - 30) this.first++;
      else break;
    }
    if (this.first > 512) {
      this.entities.splice(0, this.first);
      this.first = 0;
    }
  }

  summary(): RunSummary {
    const s = this.config.sim.score;
    const distance = Math.floor(this.z);
    const breakdown: ScoreBreakdown = {
      distance: Math.floor(this.z * s.perMeter),
      pickups: Math.floor(this.pickupPts),
      combo: Math.floor(this.comboPts),
      nearMiss: Math.floor(this.nearPts),
      finish: this.finished ? s.finishBonus : 0,
      modifier: this.route.scoreModifier,
    };
    const raw = breakdown.distance + breakdown.pickups + breakdown.combo + breakdown.nearMiss + breakdown.finish;
    const score = Math.floor(raw * breakdown.modifier);
    return {
      routeId: this.route.id,
      finished: this.finished,
      score,
      breakdown,
      distance,
      shards: this.shards,
      credits: this.credits,
      charges: this.charges,
      cores: this.cores,
      maxCombo: this.maxCombo,
      nearMisses: this.nearMisses,
      softHits: this.softHits,
      hardHits: this.hardHits,
      shieldBlocks: this.shieldBlocks,
      ultActivations: this.ultActivations,
      gadgetUses: this.gadgetUses,
      swipes: this.swipes,
      durationTicks: this.tick,
      boosts: [...this.boosts],
      revivesUsed: this.revivesUsed,
      luck: this.luck,
      grade: gradeFor(score, this.route, this.finished),
    };
  }
}

export interface ReplayResult {
  summary: RunSummary;
  /** Input log could not be fully applied (stalled, out of order, or overran the run). */
  stalled: boolean;
  appliedInputs: number;
}

/** Server-side authoritative replay. Inputs must be sorted by tick. */
export function replayRun(setup: RunSetup, inputs: readonly InputRecord[]): ReplayResult {
  const sim = new RunSim({ ...setup, emitEvents: false });
  const maxTicks = sim.durationTicks + Math.round(setup.config.sim.finishRunSec * TICK_RATE) + 5;
  let idx = 0;
  let stalled = false;
  const batch: RunAction[] = [];
  while (!sim.done) {
    if (sim.tick > maxTicks) {
      stalled = true;
      break;
    }
    batch.length = 0;
    while (idx < inputs.length && inputs[idx][0] === sim.tick) batch.push(inputs[idx++][1]);
    if (idx < inputs.length && inputs[idx][0] < sim.tick) {
      stalled = true;
      break;
    }
    if (sim.frozen && batch.length === 0) {
      // Abandoned while waiting (checkpoint/revive prompt): treat as forfeit.
      sim.step(['end']);
      break;
    }
    sim.step(batch);
  }
  if (!sim.done) sim.step(['end']);
  return { summary: sim.summary(), stalled: stalled || idx < inputs.length, appliedInputs: idx };
}
