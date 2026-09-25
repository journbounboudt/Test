import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/config.ts';
import { DEFAULT_GEAR } from '../src/gear.ts';
import { RouteStream, type Entity } from '../src/generator.ts';
import { computeRunRewards, currentEnergy, weekKey } from '../src/progression.ts';
import { RunSim, replayRun } from '../src/sim.ts';
import { gearMods } from '../src/gear.ts';
import type { GearLevels, RouteId } from '../src/types.ts';
import { playBot } from './bot.ts';

const config = DEFAULT_CONFIG;
const MAX_GEAR: GearLevels = { suit: 10, core: 10, boots: 10, shield: 10, magnet: 10, boost: 10 };

function stream(routeId: RouteId, seed: number, until = 3000) {
  const s = new RouteStream(config.routes[routeId], config.sim, seed);
  const out: Entity[] = [];
  s.fill(until, out);
  return { s, out };
}

describe('route generator', () => {
  it('is deterministic for a seed', () => {
    const a = stream('rift', 12345);
    const b = stream('rift', 12345);
    assert.deepEqual(a.out, b.out);
    assert.deepEqual(a.s.stats.chunks, b.s.stats.chunks);
    const c = stream('rift', 54321);
    assert.notDeepEqual(a.s.stats.chunks, c.s.stats.chunks);
  });

  it('never places a hard row with all three lanes blocked', () => {
    for (const route of ['neon', 'rift', 'bridge', 'secret', 'event'] as RouteId[]) {
      for (let seed = 1; seed <= 25; seed++) {
        const { out } = stream(route, seed * 7919);
        for (const e of out) if (e.hard && e.kind !== 'mine' && e.kind !== 'pulse') assert.notEqual(e.mask, 7, `${route}/${seed} ${e.kind}`);
      }
    }
  });

  it('places checkpoints near the configured times', () => {
    const { out, s } = stream('neon', 99, 2600);
    const cps = out.filter((e) => e.kind === 'checkpoint');
    assert.equal(cps.length, 3);
    cps.forEach((cp, i) => {
      const t = s.profile.timeAtDistance(cp.z);
      assert.ok(Math.abs(t - config.routes.neon.checkpointTimes[i]) < 3, `checkpoint ${i} at ${t.toFixed(1)}s`);
    });
  });
});

describe('run simulation', () => {
  it('lanes: one swipe = one lane, clamped at the edges', () => {
    const sim = new RunSim({ config, routeId: 'neon', seed: 1, gear: DEFAULT_GEAR, revivesAllowed: 0 });
    sim.step(['R']);
    for (let i = 0; i < 20; i++) sim.step();
    assert.equal(sim.laneX, 2);
    sim.step(['R']);
    for (let i = 0; i < 20; i++) sim.step();
    assert.equal(sim.laneX, 2);
    sim.step(['L']);
    sim.step(['L']); // too early to buffer → dropped
    for (let i = 0; i < 20; i++) sim.step();
    assert.equal(sim.laneX, 1);
  });

  it('an idle run takes ~60 s and ends by collision or finish', () => {
    const sim = new RunSim({ config, routeId: 'neon', seed: 7, gear: DEFAULT_GEAR, revivesAllowed: 0 });
    let guard = 0;
    while (!sim.done && guard++ < 10000) {
      if (sim.phase === 'checkpoint') sim.step([`boost:${sim.checkpointOptions![0]}`]);
      else if (sim.phase === 'down') sim.step(['end']);
      else sim.step();
    }
    assert.ok(sim.done);
    assert.ok(sim.tick <= sim.durationTicks + 90);
  });

  it('revive is refused unless authorised, and grants invulnerability', () => {
    for (const allowed of [0, 1]) {
      const sim = new RunSim({ config, routeId: 'rift', seed: 42, gear: DEFAULT_GEAR, revivesAllowed: allowed });
      let guard = 0;
      while (sim.phase !== 'down' && !sim.done && guard++ < 10000) {
        if (sim.phase === 'checkpoint') sim.step([`boost:${sim.checkpointOptions!.find((b) => b !== 'shield')!}`]);
        else sim.step();
      }
      assert.equal(sim.phase, 'down');
      sim.step(['revive']);
      if (allowed) {
        assert.equal(sim.phase, 'run');
        assert.ok(sim.invulnUntil > sim.tick);
        sim.step(['revive']);
        assert.equal(sim.revivesUsed, 1);
      } else {
        assert.equal(sim.phase, 'down');
      }
    }
  });

  it('server replay reproduces the live run exactly', () => {
    for (const route of ['neon', 'bridge', 'event'] as RouteId[]) {
      const setup = { config, routeId: route, seed: 2024 + route.length, gear: DEFAULT_GEAR, revivesAllowed: 0 };
      const live = playBot(setup);
      const replay = replayRun(setup, live.inputs);
      assert.equal(replay.stalled, false);
      assert.deepEqual(replay.summary, live.summary);
    }
  });

  it('tampered inputs change the outcome', () => {
    const setup = { config, routeId: 'neon' as RouteId, seed: 555, gear: DEFAULT_GEAR, revivesAllowed: 0 };
    const live = playBot(setup);
    const replay = replayRun(setup, live.inputs.filter((_, i) => i % 3 !== 0));
    assert.notDeepEqual(replay.summary, live.summary);
  });
});

describe('survivability', () => {
  const routes: RouteId[] = ['neon', 'rift', 'bridge', 'secret', 'event', 'tutorial'];
  for (const route of routes) {
    it(`${route}: a perfect player can finish every sampled seed without gadgets`, () => {
      for (let i = 0; i < 4; i++) {
        for (const gear of [DEFAULT_GEAR, MAX_GEAR]) {
          const seed = (i + 1) * 104729 + route.length;
          const { summary } = playBot({ config, routeId: route, seed, gear, revivesAllowed: 0 });
          assert.equal(summary.hardHits, 0, `${route} seed ${seed} died at ${summary.distance}m`);
          assert.ok(summary.finished, `${route} seed ${seed} not finished`);
        }
      }
    });
  }
});

describe('economy helpers', () => {
  it('energy regenerates on server time and preserves partial progress', () => {
    const now = 1_000_000_000_000;
    const r = currentEnergy({ energy: 10, updatedAt: now - 360_000 * 2.5 }, now, config);
    assert.equal(r.energy, 12);
    assert.equal(r.nextInSec, 180);
    assert.equal(currentEnergy({ energy: 29, updatedAt: now - 3_600_000 }, now, config).energy, 30);
  });

  it('rewards are deterministic per seed', () => {
    const setup = { config, routeId: 'bridge' as RouteId, seed: 31337, gear: DEFAULT_GEAR, revivesAllowed: 0 };
    const { summary } = playBot(setup);
    const mods = gearMods(DEFAULT_GEAR, config);
    assert.deepEqual(computeRunRewards(summary, config.routes.bridge, mods, 31337), computeRunRewards(summary, config.routes.bridge, mods, 31337));
  });

  it('week keys follow ISO-8601', () => {
    assert.equal(weekKey(Date.parse('2026-09-25T12:00:00Z')), '2026-W39');
    assert.equal(weekKey(Date.parse('2027-01-01T12:00:00Z')), '2026-W53');
  });
});
