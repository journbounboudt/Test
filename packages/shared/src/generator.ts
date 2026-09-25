import { CHUNK_BY_ID, CHUNKS, type ChunkDef } from './chunks.ts';
import type { RouteConfig, SimConfig } from './config.ts';
import { SpeedProfile } from './profile.ts';
import { Rng } from './rng.ts';

export type PickupKind = 'shard' | 'credit' | 'charge' | 'core';
export type HazardKind = 'blocker' | 'gate' | 'laser' | 'hole' | 'debris' | 'spike' | 'mine' | 'pulse';
export type EntityKind = PickupKind | HazardKind | 'checkpoint' | 'hint';

export interface Entity {
  id: number;
  kind: EntityKind;
  /** Centre z (holes: front edge). Pulse walls: current z, updated by the sim. */
  z: number;
  len: number;
  lane: number;
  /** Lane bitmask: 1 = left, 2 = centre, 4 = right. */
  mask: number;
  hard: boolean;
  /** 0 pending, 1 consumed/hit, 2 passed */
  state: 0 | 1 | 2;
  a?: number;
  b?: number;
  periodTicks?: number;
  phaseTicks?: number;
  open?: number;
  z0?: number;
  actTick?: number;
  hint?: string;
  cpIndex?: number;
}

export const PICKUP_KINDS: ReadonlySet<EntityKind> = new Set<EntityKind>(['shard', 'credit', 'charge', 'core']);
export const HAZARD_DEPTH: Record<HazardKind, number> = {
  blocker: 2.2,
  gate: 1.2,
  laser: 0.5,
  hole: 0,
  debris: 1.6,
  spike: 1.0,
  mine: 1.6,
  pulse: 1.0,
};

const SLICE = 0.05;
const LANES = [0, 1, 2];

interface CompiledHazard {
  kind: HazardKind;
  beat: number;
  endBeat: number;
  mask: number;
  hard: boolean;
  a?: number;
  b?: number;
  period?: number;
  open?: number;
}

interface CompiledPickup {
  kind: PickupKind;
  beat: number;
  lane: number;
}

interface CompiledChunk {
  def: ChunkDef;
  hazards: CompiledHazard[];
  pickups: CompiledPickup[];
  length: number;
}

const bit = (lane: number) => 1 << lane;

function compile(def: ChunkDef, mirror: boolean, rLane: number): CompiledChunk {
  const m = (lane: number) => (mirror ? 2 - lane : lane);
  const hazards: CompiledHazard[] = [];
  const pickups: CompiledPickup[] = [];
  let end = 0;
  for (const [beat, pattern] of def.rows ?? []) {
    const chars = mirror ? pattern.split('').reverse().join('') : pattern;
    let lane = 0;
    while (lane < 3) {
      const ch = chars[lane];
      if (ch === 'G' || ch === 'L') {
        let mask = 0;
        let j = lane;
        while (j < 3 && chars[j] === ch) mask |= bit(j++);
        hazards.push({ kind: ch === 'G' ? 'gate' : 'laser', beat, endBeat: beat, mask, hard: true });
        lane = j;
        continue;
      }
      if (ch === 'X') hazards.push({ kind: 'blocker', beat, endBeat: beat, mask: bit(lane), hard: true });
      if (ch === 'D') hazards.push({ kind: 'debris', beat, endBeat: beat, mask: bit(lane), hard: false });
      if (ch === 'V') hazards.push({ kind: 'spike', beat, endBeat: beat, mask: bit(lane), hard: false });
      lane++;
    }
    end = Math.max(end, beat);
  }
  for (const [beat, lanes, len] of def.holes ?? []) {
    const chars = mirror ? lanes.split('').reverse().join('') : lanes;
    let mask = 0;
    for (let i = 0; i < 3; i++) if (chars[i] === 'H') mask |= bit(i);
    hazards.push({ kind: 'hole', beat, endBeat: beat + len, mask, hard: true });
    end = Math.max(end, beat + len);
  }
  for (const [beat, a, b, period] of def.mines ?? []) {
    const la = m(a);
    const lb = m(b);
    hazards.push({ kind: 'mine', beat, endBeat: beat, mask: bit(la) | bit(lb), hard: true, a: Math.min(la, lb), b: Math.max(la, lb), period });
    end = Math.max(end, beat);
  }
  for (const [beat, open] of def.pulses ?? []) {
    const o = open === 'r' ? rLane : m(open);
    hazards.push({ kind: 'pulse', beat, endBeat: beat, mask: 7 & ~bit(o), hard: true, open: o });
    end = Math.max(end, beat);
  }
  for (const [beat, lane, count, gap, kind] of def.lines ?? []) {
    const l = lane === 'r' ? rLane : m(lane);
    const k: PickupKind = kind === 'c' ? 'credit' : kind === 'b' ? 'charge' : kind === 'e' ? 'core' : 'shard';
    for (let i = 0; i < count; i++) pickups.push({ kind: k, beat: beat + i * gap, lane: l });
    end = Math.max(end, beat + (count - 1) * gap);
  }
  return { def, hazards, pickups, length: end + (def.tail ?? 0.3) };
}

/** Lane occupancy per slice used by the safe-path DP. Returns [hardMask, softMask] arrays. */
function occupancy(chunk: CompiledChunk, lead: number, slices: number) {
  const hard = new Array<number>(slices).fill(0);
  const soft = new Array<number>(slices).fill(0);
  const mark = (arr: number[], from: number, to: number, mask: number) => {
    const a = Math.max(0, Math.floor((from + lead) / SLICE));
    const b = Math.min(slices - 1, Math.ceil((to + lead) / SLICE));
    for (let i = a; i <= b; i++) arr[i] |= mask;
  };
  for (const h of chunk.hazards) {
    let from = h.beat - 0.07;
    const to = h.endBeat + 0.07;
    // Pulse walls travel towards the Runner, so they are met earlier than their spawn beat.
    if (h.kind === 'pulse') from = h.beat - 0.4;
    if (h.kind === 'mine') from = h.beat - 0.12;
    mark(h.hard ? hard : soft, from, to, h.mask);
  }
  return { hard, soft };
}

/**
 * Finds a survivable lane path through the chunk, starting from `entryLane` during the lead-in gap.
 * Lane changes are modelled as occupying both lanes for `moveSlices`. Returns lane per slice or null.
 */
export function safePath(hard: number[], soft: number[], entryLane: number, moveSlices: number): number[] | null {
  const n = hard.length;
  const INF = 1e9;
  const cost: number[][] = LANES.map(() => new Array<number>(n).fill(INF));
  const prev: [number, number][][] = LANES.map(() => new Array<[number, number]>(n));
  const free = (k: number, lane: number) => (hard[k] & bit(lane)) === 0;
  if (!free(0, entryLane)) return null;
  cost[entryLane][0] = 0;
  for (let k = 0; k < n - 1; k++) {
    for (const lane of LANES) {
      const c = cost[lane][k];
      if (c >= INF) continue;
      if (free(k + 1, lane)) {
        const nc = c + (soft[k + 1] & bit(lane) ? 6 : 0);
        if (nc < cost[lane][k + 1]) {
          cost[lane][k + 1] = nc;
          prev[lane][k + 1] = [lane, k];
        }
      }
      for (const nl of [lane - 1, lane + 1]) {
        if (nl < 0 || nl > 2) continue;
        const end = Math.min(n - 1, k + moveSlices);
        let ok = true;
        for (let j = k + 1; j <= end && ok; j++) ok = free(j, lane) && free(j, nl);
        if (!ok) continue;
        const nc = c + 1 + (soft[end] & bit(nl) ? 6 : 0);
        if (nc < cost[nl][end]) {
          cost[nl][end] = nc;
          prev[nl][end] = [lane, k];
        }
      }
    }
  }
  let bestLane = -1;
  for (const lane of LANES) if (cost[lane][n - 1] < INF && (bestLane < 0 || cost[lane][n - 1] < cost[bestLane][n - 1])) bestLane = lane;
  if (bestLane < 0) return null;
  const path = new Array<number>(n).fill(-1);
  let lane = bestLane;
  let k = n - 1;
  while (k > 0) {
    const [pl, pk] = prev[lane][k];
    // Slices during a move are marked -1 (in transit).
    path[k] = lane;
    for (let j = pk + 1; j < k; j++) path[j] = pl === lane ? lane : -1;
    lane = pl;
    k = pk;
  }
  path[0] = lane;
  return path;
}

export interface StreamStats {
  chunks: string[];
  rejected: number;
}

/** Deterministic, lazily-generated route. Same seed + config ⇒ identical entity stream. */
export class RouteStream {
  readonly route: RouteConfig;
  readonly sim: SimConfig;
  readonly profile: SpeedProfile;
  readonly rng: Rng;
  readonly checkpointZ: number[];
  cursor: number;
  nextId = 1;
  cpNext = 0;
  scriptIndex = 0;
  exitLane = 1;
  lastChunk = '';
  stats: StreamStats = { chunks: [], rejected: 0 };

  constructor(route: RouteConfig, sim: SimConfig, seed: number) {
    this.route = route;
    this.sim = sim;
    this.rng = new Rng(seed);
    this.profile = new SpeedProfile(route.speedCurve, route.durationSec + 30);
    this.checkpointZ = route.checkpointTimes.filter((t) => t < route.durationSec - 3).map((t) => this.profile.distanceAt(t));
    this.cursor = this.profile.speedAt(0) * 1.8;
  }

  clone(): RouteStream {
    const c = Object.create(RouteStream.prototype) as RouteStream;
    Object.assign(c, this);
    (c as { rng: Rng }).rng = new Rng(this.rng.state);
    c.stats = { chunks: [...this.stats.chunks], rejected: this.stats.rejected };
    return c;
  }

  private fraction(z: number) {
    return Math.min(1, this.profile.timeAtDistance(z) / this.route.durationSec);
  }

  private chooseChunk(f: number): ChunkDef {
    if (this.cpNext < this.checkpointZ.length && this.cursor >= this.checkpointZ[this.cpNext] - this.profile.speedAt(this.profile.timeAtDistance(this.cursor)) * 1.2) {
      return CHUNK_BY_ID.checkpoint;
    }
    const script = this.route.script;
    if (script && this.scriptIndex < script.length) {
      const def = CHUNK_BY_ID[script[this.scriptIndex++]];
      if (def) return def;
    }
    const ramp = this.route.difficultyRamp;
    let lo = ramp[0][1];
    let hi = ramp[0][2];
    for (const [at, a, b] of ramp) if (f >= at) [lo, hi] = [a, b];
    const theme = this.route.theme;
    const pool = CHUNKS.filter((c) => !c.special && c.d >= lo && c.d <= hi && (!c.themes || c.themes.includes(theme)));
    return this.rng.weighted(pool, (c) => {
      let w = c.w ?? 1;
      for (const tag of c.tags) w *= this.route.tagWeights[tag] ?? 1;
      if (c.id === this.lastChunk) w *= 0.15;
      if (c.d === 0) w *= 0.5;
      return w;
    });
  }

  /** Appends entities until the cursor passes `untilZ`. */
  fill(untilZ: number, out: Entity[]): void {
    while (this.cursor < untilZ) this.placeChunk(out);
  }

  private placeChunk(out: Entity[]) {
    const f = this.fraction(this.cursor);
    const t = this.profile.timeAtDistance(this.cursor);
    const speed = this.profile.speedAt(t);
    const scale = this.route.timingScale * (1 - 0.15 * f);
    const mPerBeat = speed * scale;
    const gapBeats = 1.0 - 0.45 * f;
    const laneBeats = ((1 / this.sim.laneSpeed) * 1.35) / scale;
    const moveSlices = Math.max(1, Math.ceil(laneBeats / SLICE));

    let def = this.chooseChunk(f);
    let compiled: CompiledChunk | null = null;
    let path: number[] | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const mirror = this.rng.chance(0.5);
      const rLane = this.rng.int(3);
      const c = compile(def, mirror, rLane);
      const slices = Math.ceil((gapBeats + c.length) / SLICE) + 1;
      const occ = occupancy(c, gapBeats, slices);
      const p = safePath(occ.hard, occ.soft, this.exitLane, moveSlices);
      if (p) {
        compiled = c;
        path = p;
        break;
      }
      this.stats.rejected++;
      if (attempt >= 4 && !def.special) def = CHUNK_BY_ID.rest;
    }
    if (!compiled || !path) {
      compiled = compile(CHUNK_BY_ID.rest, false, this.exitLane);
      path = null;
    }

    this.stats.chunks.push(compiled.def.id);
    this.lastChunk = compiled.def.id;
    const start = this.cursor + gapBeats * mPerBeat;
    const zAt = (beat: number) => start + beat * mPerBeat;
    const rng = this.rng;
    const rates = this.route.pickupRates;

    if (compiled.def.hint) {
      out.push({ id: this.nextId++, kind: 'hint', z: start, len: 0, lane: 1, mask: 0, hard: false, state: 0, hint: compiled.def.hint });
    }
    if (compiled.def.id === 'checkpoint') {
      out.push({ id: this.nextId++, kind: 'checkpoint', z: zAt(0.15), len: 0, lane: 1, mask: 7, hard: false, state: 0, cpIndex: this.cpNext });
      this.cpNext++;
    }

    const entities: Entity[] = [];
    for (const h of compiled.hazards) {
      const lanes = LANES.filter((l) => h.mask & bit(l));
      const e: Entity = {
        id: this.nextId++,
        kind: h.kind,
        z: h.kind === 'hole' ? zAt(h.beat) : zAt(h.beat),
        len: h.kind === 'hole' ? (h.endBeat - h.beat) * mPerBeat : HAZARD_DEPTH[h.kind],
        lane: lanes[0] ?? 1,
        mask: h.mask,
        hard: h.hard,
        state: 0,
      };
      if (h.kind === 'mine') {
        e.a = h.a;
        e.b = h.b;
        e.periodTicks = Math.max(30, Math.round((h.period ?? 1.4) * 60));
        e.phaseTicks = rng.int(e.periodTicks);
      }
      if (h.kind === 'pulse') {
        e.open = h.open;
        e.z0 = e.z;
      }
      entities.push(e);
    }

    const spawnPickup = (kind: PickupKind, beat: number, lane: number) => {
      let k = kind;
      if (k === 'shard') {
        const r = rng.next();
        if (rates.eventCore > 0 && r < rates.eventCore) k = 'core';
        else if (r < rates.eventCore + rates.credit) k = 'credit';
        else if (r < rates.eventCore + rates.credit + rates.boostCharge) k = 'charge';
      }
      entities.push({ id: this.nextId++, kind: k, z: zAt(beat), len: 0, lane, mask: bit(lane), hard: false, state: 0 });
    };
    for (const p of compiled.pickups) spawnPickup(p.kind, p.beat, p.lane);

    if (path && compiled.def.trail !== false) {
      const every = Math.max(1, Math.round(0.11 / SLICE / Math.max(0.8, scale)));
      const leadSlices = Math.ceil(gapBeats / SLICE);
      const occ = occupancy(compiled, gapBeats, path.length);
      for (let k = leadSlices; k < path.length - 1; k += every) {
        const lane = path[k];
        if (lane < 0) continue;
        const near = (arr: number[]) => (arr[Math.max(0, k - 2)] | arr[k] | arr[Math.min(arr.length - 1, k + 2)]) & bit(lane);
        if (near(occ.hard) || near(occ.soft)) continue;
        spawnPickup('shard', k * SLICE - gapBeats, lane);
      }
    }
    if (path) {
      const last = path[path.length - 1];
      if (last >= 0) this.exitLane = last;
    }

    entities.sort((a, b) => a.z - b.z || a.id - b.id);
    for (const e of entities) out.push(e);
    this.cursor = start + compiled.length * mPerBeat;
  }
}
