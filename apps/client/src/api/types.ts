import type { GearLevels, RemoteConfig, RewardBundle, RouteId, RunSummary, Price, ProductDef, LeaderboardTier } from '@void-rush/shared';

export interface ApiErrorBody {
  error?: { code: string; message: string; details?: Record<string, unknown> | null };
}

export interface ConfigResponse {
  config: RemoteConfig;
  clientVersion: string;
  auth: { telegram: boolean; dev: boolean };
  payments: { telegram: boolean; sandbox: boolean };
  share: { bot: string; app: string } | null;
}

export interface Settings {
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  reducedShake: boolean;
  reducedFlash: boolean;
  graphics: 'auto' | 'high' | 'medium' | 'low';
}

export interface MissionView {
  id: string;
  title: string;
  metric: string;
  progress: number;
  target: number;
  reward: RewardBundle;
  claimed: boolean;
  claimable: boolean;
}

export interface Profile {
  playerId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  level: number;
  xp: number;
  xpToNext: number;
  balances: { credits: number; shards: number; stars: number; reviveTokens: number; skinFragments: number };
  energy: { value: number; cap: number; nextInSec: number; regenSec: number };
  gear: GearLevels;
  ownedSkins: string[];
  selectedSkin: string;
  settings: Settings;
  tutorialDone: boolean;
  stats: { runs: number; finishes: number; bestScore: number; bestDistance: number; routeBest: Partial<Record<RouteId, { score: number; distance: number; finished: boolean }>>; finishedRoutes: RouteId[] };
  unlockedRoutes: RouteId[];
  streak: { count: number; claimable: boolean; dayIndex: number };
  pass: { seasonId: string; name: string; number: number; endAt: number; xp: number; level: number; premium: boolean; claimable: number };
  missions: { daily: MissionView[]; weekly: MissionView[]; dailyResetAt: number; weeklyResetAt: number };
  leaderboard: { weekKey: string; rank: number | null; best: number; pendingReward: boolean };
  event: { active: boolean; endAt: number; title: string };
  fragments: { skinId: string; have: number; need: number };
  badges: { pass: boolean; shop: boolean; leaderboard: boolean };
  purchases: Record<string, number>;
  serverTime: number;
  configVersion: string;
}

export interface RunTicket {
  runId: string;
  routeId: RouteId;
  seed: number;
  configVersion: string;
  gear: GearLevels;
  startedAt: number;
  energySpent: number;
  token: string;
}

export interface RewardCard {
  kind: 'credits' | 'shards' | 'passXp' | 'fragment' | 'revive' | 'xp';
  amount: number;
  label: string;
  rarity: 'common' | 'rare' | 'epic';
}

export interface RunResult {
  runId: string;
  routeId: RouteId;
  summary: RunSummary;
  rewards: { bundle: RewardBundle; cards: RewardCard[] } | null;
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

export interface ShopProduct extends ProductDef {
  purchased: number;
  available: boolean;
}

export interface OrderView {
  orderId: string;
  productId: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  provider: 'internal' | 'telegram' | 'sandbox';
  invoiceUrl?: string | null;
  granted?: RewardBundle;
}

export interface PassView {
  season: { seasonId: string; number: number; name: string; startAt: number; endAt: number };
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpPerLevel: number;
  premium: boolean;
  premiumPrice: Price;
  premiumProductId: string;
  levels: { level: number; free: RewardBundle; premium: RewardBundle; claimedFree: boolean; claimedPremium: boolean; reached: boolean }[];
  missions: Profile['missions'];
}

export interface LeaderboardRow {
  rank: number;
  playerId: string;
  name: string;
  avatarUrl: string | null;
  level: number;
  skin: string;
  score: number;
  distance: number;
  reward: RewardBundle | null;
  tierId: string | null;
  me: boolean;
}

export interface LeaderboardView {
  weekKey: string;
  endsAt: number;
  total: number;
  rows: LeaderboardRow[];
  me: { rank: number | null; score: number; distance: number; reward: RewardBundle | null; tierId: string | null; name: string; avatarUrl: string | null; level: number };
  friendsCount: number;
  tiers: LeaderboardTier[];
  pending: { weekKey: string; rank: number; reward: RewardBundle } | null;
}

export interface EventView {
  eventId: string;
  instanceId: string;
  title: string;
  bossName: string;
  active: boolean;
  startAt: number;
  endAt: number;
  bossHp: number;
  damage: number;
  participants: number;
  pct: number;
  me: { damage: number; best: number; runs: number; freeAttemptsLeft: number };
  freeAttemptsPerDay: number;
  energyCost: number;
  milestones: { pct: number; label: string; reward: RewardBundle; index: number; reached: boolean; claimed: boolean; claimable: boolean }[];
  recent: { name: string; damage: number; at: number }[];
  top: { rank: number; name: string; damage: number; me: boolean }[];
}
