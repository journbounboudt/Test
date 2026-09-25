export type RouteId = 'neon' | 'rift' | 'bridge' | 'secret' | 'event' | 'tutorial';
export type Theme = 'neon' | 'rift' | 'bridge' | 'secret' | 'event';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'special' | 'event' | 'tutorial';
export type GearSlot = 'suit' | 'core' | 'boots' | 'shield' | 'magnet' | 'boost';
export type BoostId = 'speed' | 'magnet' | 'shield' | 'combo' | 'luck' | 'breakthrough';
export type Currency = 'credits' | 'shards' | 'stars';
export type Grade = 'C' | 'B' | 'A' | 'S' | 'S+';

export const GEAR_SLOTS: readonly GearSlot[] = ['suit', 'core', 'boots', 'shield', 'magnet', 'boost'];
export const BOOST_IDS: readonly BoostId[] = ['speed', 'magnet', 'shield', 'combo', 'luck', 'breakthrough'];

export type GearLevels = Record<GearSlot, number>;

/** A bundle of granted goods. Every field is optional; absent means zero. */
export interface RewardBundle {
  credits?: number;
  shards?: number;
  stars?: number;
  energy?: number;
  reviveTokens?: number;
  xp?: number;
  passXp?: number;
  skinFragments?: number;
  skin?: string;
  premiumPass?: boolean;
}

export type UnlockRule =
  | { type: 'none' }
  | { type: 'level'; level: number }
  | { type: 'routeFinished'; routeId: RouteId }
  | { type: 'passLevel'; level: number }
  | { type: 'all'; rules: UnlockRule[] };

export type Price =
  | { type: 'xtr'; amount: number }
  | { type: 'currency'; currency: Currency; amount: number }
  | { type: 'fragments'; amount: number };

/** Player-visible action that a replayed run understands. */
export type RunAction =
  | 'L'
  | 'R'
  | 'shield'
  | 'magnet'
  | 'ult'
  | 'revive'
  | 'end'
  | `boost:${BoostId}`;

/** Input record: action applied at the start of sim tick `t`. Tuple keeps payloads small. */
export type InputRecord = [t: number, a: RunAction];
