import { Rng } from '../src/rng.ts';
import { RunSim, type RunSetup } from '../src/sim.ts';
import type { BoostId, RunAction } from '../src/types.ts';

/**
 * Approximates a real player: decisions take effect after a reaction latency, the lookahead is short,
 * and some decisions are missed. Used to tune difficulty (finish rates per route), not to prove
 * survivability (that is bot.ts).
 */
export interface HumanProfile {
  latencySec: number;
  jitterSec: number;
  missRate: number;
  horizonSec: number;
}

export const PLAYERS: Record<string, HumanProfile> = {
  casual: { latencySec: 0.5, jitterSec: 0.1, missRate: 0.18, horizonSec: 0.8 },
  average: { latencySec: 0.4, jitterSec: 0.08, missRate: 0.1, horizonSec: 0.95 },
  skilled: { latencySec: 0.3, jitterSec: 0.05, missRate: 0.05, horizonSec: 1.15 },
};

type Plan = { at: number; a: RunAction }[];
const PLANS: Plan[] = [[], [{ at: 0, a: 'L' }], [{ at: 0, a: 'R' }], [{ at: 0, a: 'L' }, { at: 9, a: 'L' }], [{ at: 0, a: 'R' }, { at: 9, a: 'R' }]];

function pickBoost(o: BoostId[]): BoostId {
  return o.includes('shield') ? 'shield' : o[0];
}

export function playHuman(setup: RunSetup, prof: HumanProfile, seed: number) {
  const rng = new Rng(seed);
  const sim = new RunSim(setup);
  const scheduled = new Map<number, RunAction[]>();
  const push = (t: number, a: RunAction) => {
    const arr = scheduled.get(t) ?? [];
    arr.push(a);
    scheduled.set(t, arr);
  };
  let busyUntil = 0;
  const horizon = Math.round(prof.horizonSec * 60);
  while (!sim.done && sim.tick < sim.durationTicks + 400) {
    if (sim.phase === 'checkpoint' && sim.checkpointOptions) {
      sim.step([`boost:${pickBoost(sim.checkpointOptions)}`]);
      continue;
    }
    if (sim.phase === 'down') {
      sim.step(['end']);
      break;
    }
    if (sim.phase === 'run' && sim.tick % 5 === 0 && sim.tick >= busyUntil && !rng.chance(prof.missRate)) {
      const lat = Math.max(6, Math.round((prof.latencySec + (rng.next() * 2 - 1) * prof.jitterSec) * 60));
      let best: { plan: Plan; score: number } | null = null;
      for (const plan of PLANS) {
        const s = sim.clone();
        let alive = true;
        let t = 0;
        for (; t < lat + horizon && !s.done; t++) {
          if (s.phase === 'checkpoint' && s.checkpointOptions) s.step([`boost:${pickBoost(s.checkpointOptions)}`]);
          else if (s.phase === 'down') {
            alive = false;
            break;
          } else {
            const acts = [...(scheduled.get(sim.tick + t) ?? []), ...plan.filter((p) => p.at + lat === t).map((p) => p.a)];
            s.step(acts);
          }
        }
        const score = (alive ? 1e6 : t * 1000) - plan.length * 5 + s.shards - s.softHits * 40;
        if (!best || score > best.score) best = { plan, score };
      }
      if (best && best.plan.length) {
        for (const p of best.plan) push(sim.tick + lat + p.at, p.a);
        busyUntil = sim.tick + lat + 8;
      }
    }
    const acts = scheduled.get(sim.tick) ?? [];
    scheduled.delete(sim.tick);
    if (sim.ult >= 1 && !sim.ultActive) acts.push('ult');
    sim.step(acts);
  }
  return sim.summary();
}
