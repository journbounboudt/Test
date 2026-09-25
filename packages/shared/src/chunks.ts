import type { Theme } from './types.ts';

/**
 * Route chunk library. Positions are "beats" in seconds of travel at the speed the generator
 * expects when the chunk is placed, so reaction windows stay consistent as the run accelerates.
 *
 * Row pattern chars, one per lane (L C R):
 *   . empty   X blocker cube   G dual-lane gate part   L laser (telegraphed)
 *   D falling debris (soft)    V void spike (soft)
 */
export type Row = [beat: number, pattern: string];
/** [beat, lane | 'r' (random, fixed per chunk), count, gapSec, kind] */
export type Line = [beat: number, lane: number | 'r', count: number, gap: number, kind?: 's' | 'c' | 'b' | 'e'];
/** [beat, laneA, laneB, periodSec] mine oscillating between two adjacent lanes */
export type Mine = [beat: number, a: number, b: number, period: number];
/** [beat, openLane | 'r'] wall across the track that approaches the Runner */
export type Pulse = [beat: number, open: number | 'r'];
/** [beat, lanes pattern 'HH.', lengthSec] missing floor */
export type Hole = [beat: number, lanes: string, len: number];

export interface ChunkDef {
  id: string;
  /** 0 rest … 5 brutal */
  d: number;
  w?: number;
  tags: string[];
  themes?: Theme[];
  rows?: Row[];
  lines?: Line[];
  mines?: Mine[];
  pulses?: Pulse[];
  holes?: Hole[];
  /** Auto-place a shard trail along a safe path (default true). */
  trail?: boolean;
  /** Extra beats after the last element. */
  tail?: number;
  /** Only used when explicitly requested (script / checkpoint). */
  special?: boolean;
  hint?: 'swipe' | 'shards' | 'gadget' | 'charge';
}

export const CHUNKS: ChunkDef[] = [
  { id: 'rest', d: 0, tags: ['shards'], lines: [[0, 'r', 7, 0.12]], trail: false, tail: 0.2 },
  { id: 'shard_line', d: 1, tags: ['shards'], lines: [[0, 'r', 10, 0.1]], trail: false },
  { id: 'shard_weave', d: 1, tags: ['shards'], lines: [[0, 0, 4, 0.1], [0.55, 1, 4, 0.1], [1.1, 2, 4, 0.1]], trail: false },
  { id: 'bonus_arc', d: 1, tags: ['shards'], lines: [[0, 1, 3, 0.1], [0.4, 'r', 1, 0.1, 'c'], [0.6, 1, 4, 0.1], [1.1, 'r', 1, 0.1, 'b']], trail: false },
  { id: 'single_c', d: 1, tags: ['static'], rows: [[0, '.X.']] },
  { id: 'single_side', d: 1, tags: ['static'], rows: [[0, 'X..']] },
  { id: 'pair_sides', d: 1, tags: ['static'], rows: [[0, 'X.X']] },
  { id: 'stagger', d: 1, tags: ['static'], rows: [[0, 'X..'], [0.9, '..X']] },
  { id: 'debris_field', d: 1, tags: ['debris'], rows: [[0, 'D..'], [0.6, '..D'], [1.2, '.D.']] },
  { id: 'spike_corridor', d: 1, tags: ['debris', 'shards'], rows: [[0, 'V.V'], [0.4, 'V.V'], [0.8, 'V.V'], [1.2, 'V.V']], lines: [[0, 1, 13, 0.1]], trail: false },
  { id: 'gate_side', d: 2, tags: ['static'], rows: [[0, 'GG.']] },
  { id: 'gate_mid', d: 2, tags: ['static'], rows: [[0, 'G.G']] },
  { id: 'laser_pair', d: 2, tags: ['laser'], rows: [[0, 'LL.']] },
  { id: 'laser_center', d: 2, tags: ['laser'], rows: [[0, '.L.'], [0.85, 'L.L']] },
  { id: 'mine_side', d: 2, tags: ['moving'], mines: [[0, 0, 1, 1.4]] },
  { id: 'hole_pair', d: 2, tags: ['holes'], holes: [[0, 'HH.', 0.7]] },
  { id: 'slalom', d: 2, tags: ['static'], rows: [[0, 'X..'], [0.65, '.X.'], [1.3, '..X']] },
  { id: 'debris_mix', d: 2, tags: ['debris', 'static'], rows: [[0, 'X.D'], [0.75, '.X.'], [1.4, 'D.X']] },
  { id: 'gate_zig', d: 3, tags: ['static'], rows: [[0, 'GG.'], [0.85, '.GG']] },
  { id: 'laser_zig', d: 3, tags: ['laser'], rows: [[0, '.LL'], [0.85, 'LL.']] },
  { id: 'pulse_wall', d: 3, tags: ['moving'], pulses: [[0, 'r']] },
  { id: 'hole_zig', d: 3, tags: ['holes'], holes: [[0, 'HH.', 0.6], [1.15, '.HH', 0.6]] },
  { id: 'block_wall', d: 3, tags: ['static'], rows: [[0, 'XX.'], [0.9, '.XX']] },
  { id: 'mine_block', d: 3, tags: ['moving', 'static'], mines: [[0, 1, 2, 1.3]], rows: [[1.0, 'X..']] },
  { id: 'bridge_crumble', d: 3, tags: ['holes', 'debris'], themes: ['bridge', 'secret'], holes: [[0, 'H..', 1.1]], rows: [[0.3, '..D'], [1.3, '.X.']] },
  { id: 'wall_run', d: 4, tags: ['static'], rows: [[0, 'XX.'], [0.7, '.XX'], [1.4, 'XX.']] },
  { id: 'mine_pair', d: 4, tags: ['moving'], mines: [[0, 0, 1, 1.4], [1.05, 1, 2, 1.4]] },
  { id: 'laser_gate', d: 4, tags: ['laser', 'static'], rows: [[0, 'LL.'], [0.75, '.GG'], [1.5, 'L.L']] },
  { id: 'pulse_double', d: 4, tags: ['moving'], pulses: [[0, 0], [1.35, 2]] },
  { id: 'hole_run', d: 4, tags: ['holes'], holes: [[0, 'H.H', 0.8], [1.2, 'HH.', 0.6]] },
  { id: 'gauntlet', d: 5, tags: ['static', 'laser'], rows: [[0, 'X..'], [0.55, '.L.'], [1.1, '..X'], [1.65, '.L.'], [2.2, 'X..']] },
  { id: 'rift_storm', d: 5, tags: ['moving', 'laser'], themes: ['rift', 'secret', 'event'], mines: [[0, 0, 1, 1.2]], rows: [[0.9, '.LL'], [1.7, 'GG.']] },
  { id: 'bridge_fall', d: 5, tags: ['holes', 'debris'], themes: ['bridge', 'secret'], holes: [[0, 'HH.', 0.6], [0.95, '.HH', 0.6]], rows: [[1.9, 'D.X']] },

  { id: 'checkpoint', d: 0, tags: [], special: true, lines: [[0.3, 1, 8, 0.1]], trail: false, tail: 1.6 },
  { id: 'tut_swipe', d: 0, tags: [], special: true, hint: 'swipe', rows: [[1.2, '.X.']], lines: [[0, 1, 4, 0.12]], tail: 0.6 },
  { id: 'tut_swipe2', d: 0, tags: [], special: true, hint: 'swipe', rows: [[0.6, 'X..'], [2.0, '..X']], tail: 0.6 },
  { id: 'tut_shards', d: 0, tags: [], special: true, hint: 'shards', lines: [[0, 0, 5, 0.12], [0.9, 1, 5, 0.12], [1.8, 2, 5, 0.12]], trail: false, tail: 0.6 },
  { id: 'tut_pair', d: 0, tags: [], special: true, rows: [[0.4, 'X.X']], tail: 0.8 },
  { id: 'tut_charge', d: 0, tags: [], special: true, hint: 'charge', lines: [[0, 1, 3, 0.12], [0.5, 1, 1, 0.1, 'b'], [0.7, 1, 3, 0.12], [1.2, 1, 1, 0.1, 'b'], [1.4, 1, 3, 0.12], [1.9, 1, 1, 0.1, 'b'], [2.1, 1, 3, 0.12], [2.6, 1, 1, 0.1, 'b'], [2.8, 1, 3, 0.12]], trail: false, tail: 0.5 },
  { id: 'tut_gadget', d: 0, tags: [], special: true, hint: 'gadget', rows: [[1.6, 'GG.'], [2.6, '.GG']], lines: [[0, 1, 6, 0.12]], tail: 0.8 },
];

export const CHUNK_BY_ID: Record<string, ChunkDef> = Object.fromEntries(CHUNKS.map((c) => [c.id, c]));
