import { RunSim, type RunSetup } from '../src/sim.ts';
import type { BoostId, InputRecord, RunAction } from '../src/types.ts';

type Plan = { at: number; a: RunAction }[];
const PLANS: Plan[] = [
  [],
  [{ at: 0, a: 'L' }],
  [{ at: 0, a: 'R' }],
  [{ at: 0, a: 'L' }, { at: 8, a: 'L' }],
  [{ at: 0, a: 'R' }, { at: 8, a: 'R' }],
  [{ at: 12, a: 'L' }],
  [{ at: 12, a: 'R' }],
];

function pickBoost(options: BoostId[]): BoostId {
  // Worst case for survivability: take Speed when offered, never rely on Shield.
  if (options.includes('speed')) return 'speed';
  return options.find((o) => o !== 'shield') ?? options[0];
}

function evaluate(sim: RunSim, plan: Plan, horizon: number) {
  const s = sim.clone();
  const startShards = s.shards;
  for (let i = 0; i < horizon; i++) {
    if (s.done) break;
    if (s.phase === 'checkpoint' && s.checkpointOptions) {
      s.step([`boost:${pickBoost(s.checkpointOptions)}`]);
      continue;
    }
    if (s.phase === 'down') return { alive: false, t: i, shards: s.shards - startShards, soft: s.softHits };
    const acts = plan.filter((p) => p.at === i).map((p) => p.a);
    s.step(acts);
  }
  return { alive: s.phase !== 'down', t: horizon, shards: s.shards - startShards, soft: s.softHits };
}

/** Lookahead bot that plays a run without gadgets. Used to prove generated routes are survivable. */
export function playBot(setup: RunSetup, opts: { horizon?: number; every?: number } = {}) {
  const horizon = opts.horizon ?? 84;
  const every = opts.every ?? 3;
  const sim = new RunSim(setup);
  const inputs: InputRecord[] = [];
  let pending: Plan = [];
  let pendingStart = 0;
  while (!sim.done && sim.tick < sim.durationTicks + 400) {
    const acts: RunAction[] = [];
    if (sim.phase === 'checkpoint' && sim.checkpointOptions) {
      acts.push(`boost:${pickBoost(sim.checkpointOptions)}`);
    } else if (sim.phase === 'down') {
      acts.push('end');
    } else {
      if (sim.tick % every === 0 && sim.phase === 'run') {
        let best: { plan: Plan; score: number } | null = null;
        for (const plan of PLANS) {
          const r = evaluate(sim, plan, horizon);
          const score = (r.alive ? 1e6 : r.t * 1000) - plan.length * 3 - r.soft * 50 + r.shards;
          if (!best || score > best.score) best = { plan, score };
        }
        pending = best ? best.plan : [];
        pendingStart = sim.tick;
      }
      for (const p of pending) if (sim.tick - pendingStart === p.at) acts.push(p.a);
    }
    for (const a of acts) inputs.push([sim.tick, a]);
    sim.step(acts);
  }
  return { sim, summary: sim.summary(), inputs };
}
