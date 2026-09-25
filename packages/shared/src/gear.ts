import type { RemoteConfig } from './config.ts';
import { GEAR_SLOTS, type GearLevels, type GearSlot } from './types.ts';

/** Run modifiers derived from gear. Kept intentionally small: gear improves efficiency, not auto-win. */
export interface GearMods {
  speedMult: number;
  laneSpeedMult: number;
  rewardBonus: number;
  softSlowReduce: number;
  ultChargeMult: number;
  ultDurationSec: number;
  ultSpeedMult: number;
  scoreMult: number;
  comboPtsMult: number;
  shardBonus: number;
  shieldCharges: number;
  shieldDurationSec: number;
  magnetCharges: number;
  magnetDurationSec: number;
  magnetReachBonus: number;
}

export const DEFAULT_GEAR: GearLevels = { suit: 1, core: 1, boots: 1, shield: 1, magnet: 1, boost: 1 };

export function sanitizeGear(input: Partial<Record<string, unknown>> | null | undefined, maxLevel = 10): GearLevels {
  const out = { ...DEFAULT_GEAR };
  for (const slot of GEAR_SLOTS) {
    const v = Number(input?.[slot]);
    if (Number.isInteger(v)) out[slot] = Math.max(1, Math.min(maxLevel, v));
  }
  return out;
}

export function gearMods(levels: GearLevels, config: RemoteConfig): GearMods {
  const l = (s: GearSlot) => levels[s] - 1;
  return {
    speedMult: 1 + 0.008 * l('boots'),
    laneSpeedMult: 1 + 0.035 * l('boots'),
    rewardBonus: 0.03 * l('suit'),
    softSlowReduce: 0.05 * l('suit'),
    ultChargeMult: 1 + 0.06 * l('core'),
    ultDurationSec: config.sim.ult.durationSec + 0.25 * l('core'),
    ultSpeedMult: config.sim.ult.speedMult + 0.02 * l('boost'),
    scoreMult: 1 + 0.02 * l('boost'),
    comboPtsMult: 1 + 0.03 * l('core') + 0.02 * l('suit'),
    shardBonus: 0.05 * l('magnet') + 0.02 * l('suit'),
    shieldCharges: 1 + (levels.shield >= 4 ? 1 : 0) + (levels.shield >= 8 ? 1 : 0),
    shieldDurationSec: 4 + 0.5 * l('shield'),
    magnetCharges: 1 + (levels.magnet >= 6 ? 1 : 0),
    magnetDurationSec: 5 + 0.6 * l('magnet'),
    magnetReachBonus: 0.5 * l('magnet'),
  };
}

/** The four aggregate stats shown on the Gear screen (percent values). */
export function displayStats(levels: GearLevels, config: RemoteConfig) {
  const m = gearMods(levels, config);
  const base = gearMods(DEFAULT_GEAR, config);
  return {
    speed: Math.round(((m.speedMult - 1) * 2 + (m.ultSpeedMult - base.ultSpeedMult) + (m.scoreMult - 1)) * 100),
    control: Math.round(((m.laneSpeedMult - 1) + m.softSlowReduce + (m.shieldDurationSec - base.shieldDurationSec) * 0.04) * 100),
    shardBonus: Math.round(m.shardBonus * 100),
    comboBonus: Math.round((m.comboPtsMult - 1) * 100),
  };
}

export interface UpgradeCost {
  credits: number;
  shards: number;
}

export function upgradeCost(slot: GearSlot, currentLevel: number, config: RemoteConfig): UpgradeCost | null {
  const g = config.gear[slot];
  const target = currentLevel + 1;
  if (target > g.maxLevel) return null;
  return { credits: g.creditCosts[target] ?? 0, shards: g.shardCosts[target] ?? 0 };
}

/** Human-readable before/after lines for the upgrade confirmation modal. */
export function slotStatLines(slot: GearSlot, level: number, config: RemoteConfig): { label: string; value: string }[] {
  const lv = { ...DEFAULT_GEAR, [slot]: level } as GearLevels;
  const m = gearMods(lv, config);
  const pct = (v: number) => `+${Math.round(v * 100)}%`;
  switch (slot) {
    case 'suit':
      return [
        { label: 'Бонус кредитов', value: pct(m.rewardBonus) },
        { label: 'Смягчение ударов', value: pct(m.softSlowReduce) },
      ];
    case 'core':
      return [
        { label: 'Заряд Прорыва', value: pct(m.ultChargeMult - 1) },
        { label: 'Длительность Прорыва', value: `${m.ultDurationSec.toFixed(2)} с` },
      ];
    case 'boots':
      return [
        { label: 'Скорость бега', value: pct(m.speedMult - 1) },
        { label: 'Отклик полосы', value: pct(m.laneSpeedMult - 1) },
      ];
    case 'shield':
      return [
        { label: 'Заряды', value: `${m.shieldCharges}` },
        { label: 'Длительность', value: `${m.shieldDurationSec.toFixed(1)} с` },
      ];
    case 'magnet':
      return [
        { label: 'Заряды', value: `${m.magnetCharges}` },
        { label: 'Длительность', value: `${m.magnetDurationSec.toFixed(1)} с` },
        { label: 'Бонус осколков', value: pct(0.05 * (level - 1)) },
      ];
    case 'boost':
      return [
        { label: 'Скорость Прорыва', value: `×${m.ultSpeedMult.toFixed(2)}` },
        { label: 'Бонус очков', value: pct(m.scoreMult - 1) },
      ];
  }
}

/** Greedy plan for "Улучшить всё": cheapest upgrades first until balance runs out. */
export function planUpgradeAll(levels: GearLevels, balance: { credits: number; shards: number }, config: RemoteConfig) {
  const lv = { ...levels };
  let credits = balance.credits;
  let shards = balance.shards;
  const steps: { slot: GearSlot; to: number; credits: number; shards: number }[] = [];
  for (let guard = 0; guard < 100; guard++) {
    let best: { slot: GearSlot; cost: UpgradeCost } | null = null;
    for (const slot of GEAR_SLOTS) {
      const cost = upgradeCost(slot, lv[slot], config);
      if (!cost || cost.credits > credits || cost.shards > shards) continue;
      if (!best || cost.credits + cost.shards * 20 < best.cost.credits + best.cost.shards * 20) best = { slot, cost };
    }
    if (!best) break;
    lv[best.slot] += 1;
    credits -= best.cost.credits;
    shards -= best.cost.shards;
    steps.push({ slot: best.slot, to: lv[best.slot], credits: best.cost.credits, shards: best.cost.shards });
  }
  const total = steps.reduce((a, s) => ({ credits: a.credits + s.credits, shards: a.shards + s.shards }), { credits: 0, shards: 0 });
  return { steps, total, result: lv };
}
