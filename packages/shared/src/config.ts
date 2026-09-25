import type {
  BoostId,
  Currency,
  Difficulty,
  GearSlot,
  Price,
  RewardBundle,
  RouteId,
  Theme,
  UnlockRule,
} from './types.ts';

export const TICK_RATE = 60;

export interface SimConfig {
  /** Lane transitions per second (base, before Boots). */
  laneSpeed: number;
  /** Remaining lane distance under which a second swipe is buffered instead of dropped. */
  inputBufferLanes: number;
  playerHalfWidth: number;
  holeHalfWidth: number;
  pickupRadius: number;
  /** Ticks after a lane change during which dodging a hazard counts as a near miss. */
  nearMissWindowTicks: number;
  softSlowdown: number;
  softRecoverSec: number;
  comboDecayDelaySec: number;
  comboDecayIntervalSec: number;
  comboStep: number;
  comboMultCap: number;
  comboGain: { shard: number; nearMiss: number; checkpoint: number };
  softComboKeep: number;
  ult: { chargeShard: number; chargeNearMiss: number; chargePickup: number; durationSec: number; speedMult: number; scoreMult: number };
  magnet: { reach: number; lanes: number };
  reviveInvulnSec: number;
  checkpointGraceSec: number;
  finishRunSec: number;
  pulseWallSpeed: number;
  pulseActivateSec: number;
  score: { perMeter: number; shard: number; credit: number; boostCharge: number; eventCore: number; nearMiss: number; smash: number; finishBonus: number };
  /** Lookahead used by the generator, metres. */
  generateAhead: number;
}

export interface RouteConfig {
  id: RouteId;
  name: string;
  tagline: string;
  difficulty: Difficulty;
  difficultyLabel: string;
  theme: Theme;
  durationSec: number;
  energyCost: number;
  /** [timeSec, metresPerSec] keyframes, linearly interpolated. */
  speedCurve: [number, number][];
  /** Multiplies every chunk beat; lower = tighter reaction windows. */
  timingScale: number;
  /** [runFraction, minChunkDifficulty, maxChunkDifficulty]. */
  difficultyRamp: [number, number, number][];
  /** Tag weight multipliers so each route has its own identity. */
  tagWeights: Record<string, number>;
  /** Scripted chunk sequence (tutorial). Falls back to random generation when exhausted. */
  script?: string[];
  checkpointTimes: number[];
  scoreModifier: number;
  rewardMultiplier: number;
  rewards: { baseCredits: number; creditsPerScore: number; xp: number; passXp: number; fragmentChance: number; reviveTokenChance: number };
  gradeThresholds: [number, number, number, number];
  unlockRule: UnlockRule;
  unlockText: string;
  rewardIcons: ('credits' | 'shards' | 'xp' | 'module' | 'pass' | 'fragment' | 'mystery')[];
  /** Hard hits behave like soft hits. */
  forgiving?: boolean;
  eventCores?: boolean;
  pickupRates: { credit: number; boostCharge: number; eventCore: number };
  competitive: boolean;
}

export interface BoostDef {
  id: BoostId;
  name: string;
  description: string;
  durationSec?: number;
  value: number;
}

export interface GearSlotConfig {
  slot: GearSlot;
  name: string;
  description: string;
  maxLevel: number;
  /** Index = target level. costs[2] upgrades 1→2. */
  creditCosts: number[];
  shardCosts: number[];
}

export interface SkinDef {
  id: string;
  name: string;
  rarity: 'base' | 'rare' | 'epic' | 'legendary';
  description: string;
  colors: { suit: string; trim: string; trail: string; visor: string };
  source: 'default' | 'shop' | 'fragments' | 'pass' | 'bundle' | 'leaderboard';
  price?: Price;
}

export interface ProductDef {
  productId: string;
  type: 'stars' | 'energy' | 'revive' | 'credits' | 'skin' | 'bundle' | 'pass';
  tab: 'stars' | 'energy' | 'skins' | 'pass';
  title: string;
  subtitle?: string;
  contents: RewardBundle;
  price: Price;
  displayPrice: string;
  providerProductId?: string;
  bonusPercent?: number;
  badge?: string;
  image: string;
  startAt?: string;
  endAt?: string;
  purchaseLimit?: number;
  visibilityCondition?: UnlockRule;
  featured?: boolean;
  popular?: boolean;
}

export interface MissionDef {
  id: string;
  title: string;
  metric: MissionMetric;
  target: number;
  reward: RewardBundle;
  routeId?: RouteId;
}

export type MissionMetric =
  | 'shards'
  | 'runs'
  | 'maxCombo'
  | 'ultActivations'
  | 'cleanFinish'
  | 'nearMisses'
  | 'distance'
  | 'finishes'
  | 'score'
  | 'upgrades'
  | 'routeFinish'
  | 'eventRuns'
  | 'gradeS';

export interface PassLevelReward {
  level: number;
  free: RewardBundle;
  premium: RewardBundle;
}

export interface SeasonConfig {
  /** ISO date. Seasons roll forward automatically every `lengthDays`. */
  epoch: string;
  lengthDays: number;
  names: string[];
  levels: number;
  xpPerLevel: number;
  rewards: PassLevelReward[];
  premiumPrice: Price;
  premiumProductId: string;
  dailyMissionPool: MissionDef[];
  weeklyMissionPool: MissionDef[];
  dailyCount: number;
  weeklyCount: number;
}

export interface LeaderboardTier {
  id: string;
  label: string;
  /** Absolute rank ceiling or percentile ceiling (0..1). */
  maxRank?: number;
  maxPercentile?: number;
  reward: RewardBundle;
  description: string;
}

export interface EventConfig {
  eventId: string;
  title: string;
  bossName: string;
  epoch: string;
  cycleDays: number;
  activeDays: number;
  bossHp: number;
  contribution: { perScore: number; perCore: number; finishBonus: number; multiplier: number; version: number };
  milestones: { pct: number; reward: RewardBundle; label: string }[];
  freeAttemptsPerDay: number;
  routeId: RouteId;
}

export interface RemoteConfig {
  version: string;
  minClientVersion: string;
  maintenance: boolean;
  sim: SimConfig;
  energy: { cap: number; regenSec: number };
  routes: Record<RouteId, RouteConfig>;
  routeOrder: RouteId[];
  boosts: Record<BoostId, BoostDef>;
  gear: Record<GearSlot, GearSlotConfig>;
  player: { xpBase: number; xpGrowth: number; maxLevel: number; levelReward: RewardBundle };
  revive: { tokenCost: number; starsCost: number };
  doubleReward: { currency: Currency; amount: number };
  skins: SkinDef[];
  skinFragmentTarget: { skinId: string; fragments: number };
  products: ProductDef[];
  season: SeasonConfig;
  leaderboard: { tiers: LeaderboardTier[]; minRunsForPercentile: number };
  event: EventConfig;
  streak: { rewards: RewardBundle[] };
  starter: { credits: number; shards: number; stars: number; reviveTokens: number };
}

const creditCosts = [0, 0, 300, 650, 1100, 1700, 2600, 3800, 5400, 7600, 10500];
const shardCosts = [0, 0, 0, 0, 0, 40, 90, 160, 260, 400, 600];

function gearSlot(slot: GearSlot, name: string, description: string, scale = 1): GearSlotConfig {
  return {
    slot,
    name,
    description,
    maxLevel: 10,
    creditCosts: creditCosts.map((c) => Math.round((c * scale) / 10) * 10),
    shardCosts: shardCosts.map((c) => Math.round(c * scale)),
  };
}

const passRewards = (): PassLevelReward[] => {
  const out: PassLevelReward[] = [];
  for (let level = 1; level <= 30; level++) {
    let free: RewardBundle;
    let premium: RewardBundle;
    if (level % 10 === 0) {
      free = { stars: 50 };
      premium = level === 30 ? { skin: 'gold_legion' } : level === 20 ? { skinFragments: 5 } : { stars: 150 };
    } else if (level % 5 === 0) {
      free = { reviveTokens: 1 };
      premium = { shards: 300, reviveTokens: 2 };
    } else if (level % 3 === 0) {
      free = { energy: 10 };
      premium = { credits: 5000 };
    } else if (level % 2 === 0) {
      free = { credits: 1000 };
      premium = { shards: 150 };
    } else {
      free = { shards: 50 };
      premium = { credits: 2500, energy: 5 };
    }
    out.push({ level, free, premium });
  }
  return out;
};

export const DEFAULT_CONFIG: RemoteConfig = {
  version: '2026.09.1',
  minClientVersion: '1.0.0',
  maintenance: false,
  sim: {
    laneSpeed: 8.5,
    inputBufferLanes: 0.45,
    playerHalfWidth: 0.26,
    holeHalfWidth: 0.2,
    pickupRadius: 0.55,
    nearMissWindowTicks: 26,
    softSlowdown: 0.72,
    softRecoverSec: 1.2,
    comboDecayDelaySec: 2.2,
    comboDecayIntervalSec: 0.2,
    comboStep: 10,
    comboMultCap: 5,
    comboGain: { shard: 1, nearMiss: 3, checkpoint: 5 },
    softComboKeep: 0.5,
    ult: { chargeShard: 0.011, chargeNearMiss: 0.05, chargePickup: 0.22, durationSec: 4, speedMult: 1.45, scoreMult: 2 },
    magnet: { reach: 7, lanes: 2.1 },
    reviveInvulnSec: 2.5,
    checkpointGraceSec: 0.9,
    finishRunSec: 1.4,
    pulseWallSpeed: 9,
    pulseActivateSec: 1.6,
    score: { perMeter: 10, shard: 25, credit: 60, boostCharge: 80, eventCore: 120, nearMiss: 150, smash: 40, finishBonus: 10000 },
    generateAhead: 240,
  },
  energy: { cap: 30, regenSec: 360 },
  routeOrder: ['neon', 'rift', 'bridge', 'secret'],
  routes: {
    neon: {
      id: 'neon',
      name: 'Неоновый тоннель',
      tagline: 'Скорость. Ритм. Чистый забег.',
      difficulty: 'easy',
      difficultyLabel: 'Лёгкий',
      theme: 'neon',
      durationSec: 60,
      energyCost: 5,
      speedCurve: [[0, 24], [15, 30], [30, 35], [45, 40], [55, 45], [60, 50]],
      timingScale: 1.1,
      difficultyRamp: [[0, 0, 1], [0.22, 1, 2], [0.5, 1, 3], [0.75, 2, 3], [0.9, 2, 4]],
      tagWeights: { static: 1.6, laser: 1.2, moving: 0.5, holes: 0.4, debris: 0.8, shards: 1.4 },
      checkpointTimes: [15, 30, 45],
      scoreModifier: 1,
      rewardMultiplier: 1,
      rewards: { baseCredits: 300, creditsPerScore: 0.02, xp: 120, passXp: 120, fragmentChance: 0, reviveTokenChance: 0.04 },
      gradeThresholds: [22000, 40000, 60000, 80000],
      unlockRule: { type: 'none' },
      unlockText: '',
      rewardIcons: ['credits', 'shards', 'xp'],
      pickupRates: { credit: 0.035, boostCharge: 0.018, eventCore: 0 },
      competitive: true,
    },
    rift: {
      id: 'rift',
      name: 'Разлом пустоты',
      tagline: 'Меняющаяся реальность.',
      difficulty: 'medium',
      difficultyLabel: 'Средний',
      theme: 'rift',
      durationSec: 60,
      energyCost: 6,
      speedCurve: [[0, 26], [15, 32], [30, 38], [45, 43], [55, 48], [60, 53]],
      timingScale: 1,
      difficultyRamp: [[0, 1, 2], [0.22, 1, 3], [0.5, 2, 4], [0.75, 2, 4], [0.9, 3, 4]],
      tagWeights: { static: 1, laser: 1, moving: 1.8, holes: 0.7, debris: 1, shards: 1 },
      checkpointTimes: [15, 30, 45],
      scoreModifier: 1.3,
      rewardMultiplier: 1.3,
      rewards: { baseCredits: 450, creditsPerScore: 0.022, xp: 170, passXp: 160, fragmentChance: 0.08, reviveTokenChance: 0.06 },
      gradeThresholds: [30000, 55000, 80000, 110000],
      unlockRule: { type: 'level', level: 3 },
      unlockText: 'Откроется на уровне 3',
      rewardIcons: ['credits', 'shards', 'module'],
      pickupRates: { credit: 0.04, boostCharge: 0.02, eventCore: 0 },
      competitive: true,
    },
    bridge: {
      id: 'bridge',
      name: 'Сломанный мост',
      tagline: 'Один шаг — и снова в пустоту.',
      difficulty: 'hard',
      difficultyLabel: 'Сложный',
      theme: 'bridge',
      durationSec: 60,
      energyCost: 8,
      speedCurve: [[0, 28], [15, 35], [30, 41], [45, 46], [55, 51], [60, 56]],
      timingScale: 0.92,
      difficultyRamp: [[0, 1, 2], [0.2, 2, 3], [0.45, 2, 4], [0.7, 3, 5], [0.9, 3, 5]],
      tagWeights: { static: 1, laser: 0.9, moving: 1, holes: 2, debris: 1.6, shards: 0.8 },
      checkpointTimes: [15, 30, 45],
      scoreModifier: 1.6,
      rewardMultiplier: 1.6,
      rewards: { baseCredits: 650, creditsPerScore: 0.024, xp: 240, passXp: 220, fragmentChance: 0.15, reviveTokenChance: 0.08 },
      gradeThresholds: [40000, 72000, 105000, 140000],
      unlockRule: { type: 'level', level: 6 },
      unlockText: 'Откроется на уровне 6',
      rewardIcons: ['shards', 'pass', 'xp'],
      pickupRates: { credit: 0.045, boostCharge: 0.02, eventCore: 0 },
      competitive: true,
    },
    secret: {
      id: 'secret',
      name: 'Тайный маршрут',
      tagline: 'Там, где пустота смотрит в ответ.',
      difficulty: 'special',
      difficultyLabel: 'Особый',
      theme: 'secret',
      durationSec: 65,
      energyCost: 10,
      speedCurve: [[0, 30], [15, 37], [30, 43], [45, 48], [55, 53], [65, 58]],
      timingScale: 0.88,
      difficultyRamp: [[0, 2, 3], [0.2, 2, 4], [0.45, 3, 5], [0.7, 3, 5], [0.9, 4, 5]],
      tagWeights: { static: 1, laser: 1.2, moving: 1.4, holes: 1.4, debris: 1.2, shards: 1 },
      checkpointTimes: [15, 30, 45],
      scoreModifier: 2,
      rewardMultiplier: 2,
      rewards: { baseCredits: 900, creditsPerScore: 0.026, xp: 320, passXp: 300, fragmentChance: 0.5, reviveTokenChance: 0.1 },
      gradeThresholds: [55000, 95000, 140000, 185000],
      unlockRule: { type: 'all', rules: [{ type: 'level', level: 10 }, { type: 'routeFinished', routeId: 'bridge' }] },
      unlockText: 'Уровень 10 и финиш «Сломанного моста»',
      rewardIcons: ['fragment', 'mystery', 'shards'],
      pickupRates: { credit: 0.05, boostCharge: 0.025, eventCore: 0 },
      competitive: true,
    },
    event: {
      id: 'event',
      name: 'Пробуждение Пустоты',
      tagline: 'Весь мир бьёт одного Колосса.',
      difficulty: 'event',
      difficultyLabel: 'Событие',
      theme: 'event',
      durationSec: 60,
      energyCost: 5,
      speedCurve: [[0, 26], [15, 32], [30, 37], [45, 42], [55, 47], [60, 52]],
      timingScale: 1,
      difficultyRamp: [[0, 1, 2], [0.25, 1, 3], [0.5, 2, 3], [0.8, 2, 4]],
      tagWeights: { static: 1, laser: 1.3, moving: 1.2, holes: 0.8, debris: 1.5, shards: 1 },
      checkpointTimes: [20, 40],
      scoreModifier: 1.2,
      rewardMultiplier: 1.2,
      rewards: { baseCredits: 400, creditsPerScore: 0.02, xp: 160, passXp: 150, fragmentChance: 0.05, reviveTokenChance: 0.05 },
      gradeThresholds: [26000, 48000, 72000, 95000],
      unlockRule: { type: 'level', level: 2 },
      unlockText: 'Откроется на уровне 2',
      rewardIcons: ['credits', 'shards', 'mystery'],
      eventCores: true,
      pickupRates: { credit: 0.03, boostCharge: 0.02, eventCore: 0.08 },
      competitive: false,
    },
    tutorial: {
      id: 'tutorial',
      name: 'Обучение',
      tagline: 'Первый забег в пустоту.',
      difficulty: 'tutorial',
      difficultyLabel: 'Обучение',
      theme: 'neon',
      durationSec: 40,
      energyCost: 0,
      speedCurve: [[0, 20], [20, 24], [40, 30]],
      timingScale: 1.35,
      difficultyRamp: [[0, 0, 1], [0.6, 1, 2]],
      tagWeights: { static: 1.5, laser: 0.6, moving: 0.2, holes: 0.2, debris: 0.4, shards: 1.5 },
      script: ['tut_swipe', 'tut_swipe2', 'tut_shards', 'tut_pair', 'tut_charge', 'rest', 'single_side', 'tut_gadget', 'shard_weave', 'stagger'],
      checkpointTimes: [14],
      scoreModifier: 1,
      rewardMultiplier: 1,
      rewards: { baseCredits: 600, creditsPerScore: 0.01, xp: 200, passXp: 100, fragmentChance: 0, reviveTokenChance: 1 },
      gradeThresholds: [8000, 14000, 20000, 26000],
      unlockRule: { type: 'none' },
      unlockText: '',
      rewardIcons: ['credits', 'shards', 'xp'],
      forgiving: true,
      pickupRates: { credit: 0.03, boostCharge: 0.02, eventCore: 0 },
      competitive: false,
    },
  },
  boosts: {
    speed: { id: 'speed', name: 'Скорость', description: '+12% скорости и +25% очков на 12 с', durationSec: 12, value: 0.12 },
    magnet: { id: 'magnet', name: 'Магнит', description: 'Радиус сбора ×1.8 до конца забега', value: 1.8 },
    shield: { id: 'shield', name: 'Щит', description: 'Выдерживает один тяжёлый удар', value: 1 },
    combo: { id: 'combo', name: 'Комбо', description: 'Комбо растёт ×2 и держится дольше', value: 2 },
    luck: { id: 'luck', name: 'Удача', description: '+15% к наградам после забега', value: 0.15 },
    breakthrough: { id: 'breakthrough', name: 'Прорыв', description: 'Ультимейт заряжается на 50% быстрее', value: 0.5 },
  },
  gear: {
    suit: gearSlot('suit', 'Костюм', 'Эффективность наград и устойчивость к мелким ударам'),
    core: gearSlot('core', 'Ядро', 'Быстрее заряд и дольше Прорыв Войда', 1.1),
    boots: gearSlot('boots', 'Ботинки / Борд', 'Скорость бега и отклик смены полосы', 1.15),
    shield: gearSlot('shield', 'Щит', 'Длительность и заряды щита', 0.9),
    magnet: gearSlot('magnet', 'Магнит', 'Дальность и длительность магнита', 0.9),
    boost: gearSlot('boost', 'Ускорение', 'Сила Прорыва и бонус очков', 1.05),
  },
  player: { xpBase: 400, xpGrowth: 140, maxLevel: 60, levelReward: { credits: 500, stars: 10 } },
  revive: { tokenCost: 1, starsCost: 30 },
  doubleReward: { currency: 'stars', amount: 25 },
  skins: [
    { id: 'void_guard', name: 'Страж Пустоты', rarity: 'base', description: 'Базовый костюм бегуна.', colors: { suit: '#141922', trim: '#ff8a1f', trail: '#ff9d3c', visor: '#1b2330' }, source: 'default' },
    { id: 'neon_sprinter', name: 'Неоновый спринтер', rarity: 'rare', description: 'Холодный неон для быстрых ног.', colors: { suit: '#0f1a26', trim: '#27e3ff', trail: '#39d5ff', visor: '#0d2733' }, source: 'shop', price: { type: 'currency', currency: 'credits', amount: 12000 } },
    { id: 'void_shadow', name: 'Тень Пустоты', rarity: 'epic', description: 'Беги в другом стиле. Выделяйся в Потоках.', colors: { suit: '#120e1f', trim: '#b061ff', trail: '#c07bff', visor: '#1c1030' }, source: 'shop', price: { type: 'currency', currency: 'stars', amount: 450 } },
    { id: 'shadow_warden', name: 'Теневой Страж', rarity: 'legendary', description: 'Эксклюзив VIP-набора.', colors: { suit: '#0b0b12', trim: '#ffb02e', trail: '#9d5cff', visor: '#2a1845' }, source: 'bundle' },
    { id: 'void_echo', name: 'Эхо Пустоты', rarity: 'epic', description: 'Собирается из фрагментов, найденных в забегах.', colors: { suit: '#161b26', trim: '#e8f4ff', trail: '#9fdcff', visor: '#23344a' }, source: 'fragments', price: { type: 'fragments', amount: 10 } },
    { id: 'gold_legion', name: 'Золотой легион', rarity: 'legendary', description: 'Награда 30 уровня премиум-пропуска.', colors: { suit: '#1a1510', trim: '#ffd23f', trail: '#ffcf4a', visor: '#2b2210' }, source: 'pass' },
    { id: 'blood_moon', name: 'Кровавая луна', rarity: 'legendary', description: 'Только для чемпиона недели.', colors: { suit: '#160b0d', trim: '#ff3b4f', trail: '#ff4d5e', visor: '#2d0f14' }, source: 'leaderboard' },
  ],
  skinFragmentTarget: { skinId: 'void_echo', fragments: 10 },
  products: [
    { productId: 'stars_500', type: 'stars', tab: 'stars', title: '500', contents: { stars: 500 }, price: { type: 'xtr', amount: 50 }, displayPrice: '50 XTR', image: 'stars-s', providerProductId: 'tg_stars_500' },
    { productId: 'stars_1200', type: 'stars', tab: 'stars', title: '1 200', contents: { stars: 1200 }, price: { type: 'xtr', amount: 100 }, displayPrice: '100 XTR', bonusPercent: 20, image: 'stars-m', providerProductId: 'tg_stars_1200' },
    { productId: 'stars_2800', type: 'stars', tab: 'stars', title: '2 800', contents: { stars: 2800 }, price: { type: 'xtr', amount: 200 }, displayPrice: '200 XTR', bonusPercent: 40, badge: 'Лучшее предложение', image: 'stars-l', providerProductId: 'tg_stars_2800' },
    { productId: 'stars_7500', type: 'stars', tab: 'stars', title: '7 500', contents: { stars: 7500 }, price: { type: 'xtr', amount: 500 }, displayPrice: '500 XTR', bonusPercent: 50, image: 'stars-xl', providerProductId: 'tg_stars_7500' },
    { productId: 'vip_bundle', type: 'bundle', tab: 'stars', title: 'VIP набор', subtitle: 'Максимальная выгода', contents: { stars: 5000, energy: 30, reviveTokens: 10, skin: 'shadow_warden' }, price: { type: 'xtr', amount: 1000 }, displayPrice: '1000 XTR', image: 'vip', purchaseLimit: 1, featured: true, providerProductId: 'tg_vip_bundle' },
    { productId: 'energy_10', type: 'energy', tab: 'energy', title: '+10 энергии', subtitle: 'Два забега прямо сейчас', contents: { energy: 10 }, price: { type: 'currency', currency: 'stars', amount: 25 }, displayPrice: '25', image: 'energy', popular: true },
    { productId: 'energy_full', type: 'energy', tab: 'energy', title: '+30 энергии', subtitle: 'Полный заряд', contents: { energy: 30 }, price: { type: 'currency', currency: 'stars', amount: 60 }, displayPrice: '60', image: 'energy-xl' },
    { productId: 'revive_3', type: 'revive', tab: 'energy', title: 'Возрождение ×3', subtitle: 'Продолжай забег с места падения', contents: { reviveTokens: 3 }, price: { type: 'currency', currency: 'stars', amount: 80 }, displayPrice: '80', image: 'revive', popular: true },
    { productId: 'credits_5k', type: 'credits', tab: 'energy', title: '5 000 кредитов', subtitle: 'Для улучшений снаряжения', contents: { credits: 5000 }, price: { type: 'currency', currency: 'stars', amount: 100 }, displayPrice: '100', image: 'credits' },
    { productId: 'credits_15k', type: 'credits', tab: 'energy', title: '15 000 кредитов', subtitle: '+20% выгоды', contents: { credits: 15000 }, price: { type: 'currency', currency: 'stars', amount: 250 }, displayPrice: '250', bonusPercent: 20, image: 'credits-xl' },
    { productId: 'skin_bundle', type: 'bundle', tab: 'skins', title: 'Набор скинов', subtitle: 'Неоновый спринтер + Тень Пустоты', contents: { skin: 'void_shadow', credits: 12000 }, price: { type: 'xtr', amount: 300 }, displayPrice: '300 XTR', image: 'skins', popular: true, purchaseLimit: 1, providerProductId: 'tg_skin_bundle' },
    { productId: 'season_pass', type: 'pass', tab: 'pass', title: 'Сезонный пропуск', subtitle: 'Премиум-дорожка наград', contents: { premiumPass: true }, price: { type: 'currency', currency: 'stars', amount: 950 }, displayPrice: '950', image: 'pass', featured: true },
  ],
  season: {
    epoch: '2026-09-01T00:00:00Z',
    lengthDays: 28,
    names: ['Эхо Пустоты', 'Разбитые звёзды', 'Колыбель бури', 'Последний сигнал'],
    levels: 30,
    xpPerLevel: 1000,
    rewards: passRewards(),
    premiumPrice: { type: 'currency', currency: 'stars', amount: 950 },
    premiumProductId: 'season_pass',
    dailyMissionPool: [
      { id: 'd_shards', title: 'Собери 500 осколков', metric: 'shards', target: 500, reward: { shards: 100, passXp: 150 } },
      { id: 'd_runs', title: 'Сделай 3 забега', metric: 'runs', target: 3, reward: { shards: 100, passXp: 150 } },
      { id: 'd_combo', title: 'Добейся комбо x20', metric: 'maxCombo', target: 20, reward: { shards: 100, passXp: 150 } },
      { id: 'd_ult', title: 'Активируй Прорыв 2 раза', metric: 'ultActivations', target: 2, reward: { credits: 800, passXp: 150 } },
      { id: 'd_clean', title: 'Финишируй без тяжёлого столкновения', metric: 'cleanFinish', target: 1, reward: { credits: 1000, passXp: 200 } },
      { id: 'd_near', title: 'Сделай 10 уклонений впритык', metric: 'nearMisses', target: 10, reward: { shards: 80, passXp: 150 } },
      { id: 'd_distance', title: 'Пробеги 6 000 м', metric: 'distance', target: 6000, reward: { credits: 900, passXp: 150 } },
    ],
    weeklyMissionPool: [
      { id: 'w_finish', title: 'Финишируй в 20 забегах', metric: 'finishes', target: 20, reward: { stars: 40, passXp: 600 } },
      { id: 'w_score', title: 'Набери 600 000 очков', metric: 'score', target: 600000, reward: { credits: 6000, passXp: 600 } },
      { id: 'w_upgrade', title: 'Улучши снаряжение 5 раз', metric: 'upgrades', target: 5, reward: { shards: 400, passXp: 500 } },
      { id: 'w_bridge', title: 'Пройди «Сломанный мост»', metric: 'routeFinish', target: 1, routeId: 'bridge', reward: { stars: 30, passXp: 500 } },
      { id: 'w_event', title: 'Участвуй в событии 3 раза', metric: 'eventRuns', target: 3, reward: { reviveTokens: 2, passXp: 500 } },
      { id: 'w_grade', title: 'Получи ранг S', metric: 'gradeS', target: 1, reward: { stars: 30, passXp: 600 } },
    ],
    dailyCount: 3,
    weeklyCount: 4,
  },
  leaderboard: {
    minRunsForPercentile: 1,
    tiers: [
      { id: 'top1', label: 'Топ 1', maxRank: 1, reward: { shards: 2000, stars: 300, skin: 'blood_moon' }, description: 'Эксклюзивный скин' },
      { id: 'top3', label: 'Топ 3', maxRank: 3, reward: { shards: 1200, stars: 180 }, description: 'Кристаллы и звёзды' },
      { id: 'top10', label: 'Топ 10', maxRank: 10, reward: { shards: 750, stars: 100 }, description: 'Кристаллы' },
      { id: 'top100', label: 'Топ 100', maxRank: 100, reward: { shards: 400, stars: 60, reviveTokens: 2 }, description: 'Особая награда' },
      { id: 'top10p', label: 'Топ 10%', maxPercentile: 0.1, reward: { shards: 250, stars: 50, energy: 20 }, description: 'Усилители' },
      { id: 'top50p', label: 'Топ 50%', maxPercentile: 0.5, reward: { credits: 5000 }, description: 'Монеты' },
    ],
  },
  event: {
    eventId: 'void_awakening',
    title: 'Пробуждение Пустоты',
    bossName: 'Пустотный Колосс',
    epoch: '2026-09-21T00:00:00Z',
    cycleDays: 7,
    activeDays: 7,
    bossHp: 5000000,
    contribution: { perScore: 1, perCore: 400, finishBonus: 5000, multiplier: 1, version: 1 },
    milestones: [
      { pct: 0.25, label: '25%', reward: { credits: 3000 } },
      { pct: 0.5, label: '50%', reward: { shards: 300 } },
      { pct: 0.75, label: '75%', reward: { reviveTokens: 2, energy: 15 } },
      { pct: 1, label: 'Колосс повержен', reward: { stars: 100, skinFragments: 3 } },
    ],
    freeAttemptsPerDay: 3,
    routeId: 'event',
  },
  streak: {
    rewards: [
      { credits: 500 },
      { energy: 10 },
      { shards: 60 },
      { credits: 1500 },
      { reviveTokens: 1 },
      { shards: 150 },
      { stars: 50, skinFragments: 1 },
    ],
  },
  starter: { credits: 1500, shards: 150, stars: 100, reviveTokens: 1 },
};

export function routeById(config: RemoteConfig, id: RouteId): RouteConfig {
  const route = config.routes[id];
  if (!route) throw new Error(`Unknown route ${id}`);
  return route;
}

export function skinById(config: RemoteConfig, id: string): SkinDef | undefined {
  return config.skins.find((s) => s.id === id);
}

export function productById(config: RemoteConfig, id: string): ProductDef | undefined {
  return config.products.find((p) => p.productId === id);
}
