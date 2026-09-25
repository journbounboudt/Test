import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { DEFAULT_CONFIG, DEFAULT_GEAR, type RouteId } from '@void-rush/shared';
import { playBot } from '../../../packages/shared/test/bot.ts';
import { buildApp } from '../src/app.ts';
import { validateInitData } from '../src/auth.ts';
import { loadEnv } from '../src/env.ts';

const env = loadEnv({ dbFile: ':memory:', seedDemo: false, devAuth: true, paymentsSandbox: true, botToken: '', configOverrideFile: '/nonexistent/void-rush.json', clientDist: '/nonexistent' });
const { app, game } = buildApp(env);
let clock = Date.parse('2026-09-24T10:00:00Z');
game.clock = () => clock;

async function call(method: 'GET' | 'POST', url: string, token?: string, body?: object) {
  const res = await app.inject({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body });
  return { status: res.statusCode, json: res.json() as Record<string, any> };
}

async function login(deviceId: string) {
  const r = await call('POST', '/api/auth/dev', undefined, { deviceId, name: 'Tester' });
  assert.equal(r.status, 200);
  return r.json as { token: string; profile: any };
}

async function playRun(token: string, routeId: RouteId, mutate?: (inputs: [number, string][]) => [number, string][]) {
  const start = await call('POST', '/api/runs/start', token, { routeId });
  assert.equal(start.status, 200, JSON.stringify(start.json));
  const run = start.json.run;
  const bot = playBot({ config: DEFAULT_CONFIG, routeId, seed: run.seed, gear: run.gear ?? DEFAULT_GEAR, revivesAllowed: 0 });
  clock += 65000;
  const inputs = mutate ? mutate(bot.inputs as [number, string][]) : bot.inputs;
  const fin = await call('POST', `/api/runs/${run.runId}/finish`, token, { token: run.token, inputs, summary: bot.summary });
  return { run, bot, fin };
}

before(async () => {
  await app.ready();
});
after(async () => {
  await app.close();
});

describe('auth', () => {
  it('rejects requests without a session', async () => {
    const r = await call('GET', '/api/profile');
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, 'unauthorized');
  });

  it('validates Telegram initData signatures', () => {
    const botToken = '123456:TEST';
    const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 42, first_name: 'Alex' }), query_id: 'AAE' });
    const dataCheck = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    params.set('hash', crypto.createHmac('sha256', secret).update(dataCheck).digest('hex'));
    assert.equal(validateInitData(params.toString(), botToken).user.id, 42);
    params.set('user', JSON.stringify({ id: 43, first_name: 'Mallory' }));
    assert.throws(() => validateInitData(params.toString(), botToken));
  });
});

describe('runs', () => {
  it('consumes energy, grants rewards once and ranks the run', async () => {
    const { token, profile } = await login('device-runs-1');
    assert.equal(profile.energy.value, 30);
    const { fin } = await playRun(token, 'neon');
    assert.equal(fin.status, 200, JSON.stringify(fin.json));
    const res = fin.json.result;
    assert.equal(res.rejected, null);
    assert.equal(res.desync, false);
    assert.equal(res.ranked, true);
    assert.ok(res.summary.finished);
    assert.ok(res.rewards.bundle.credits > 0);
    const p = fin.json.profile;
    assert.equal(p.energy.value, 25);
    assert.equal(p.balances.credits, DEFAULT_CONFIG.starter.credits + res.rewards.bundle.credits + (res.levelUps > 0 ? res.levelUps * 500 : 0));
    assert.equal(p.leaderboard.best, res.summary.score);
    assert.equal(p.stats.bestScore, res.summary.score);
  });

  it('duplicate submission returns the stored result without paying twice', async () => {
    const { token } = await login('device-runs-2');
    const { run, bot, fin } = await playRun(token, 'neon');
    const credits = fin.json.profile.balances.credits;
    const again = await call('POST', `/api/runs/${run.runId}/finish`, token, { token: run.token, inputs: bot.inputs, summary: bot.summary });
    assert.equal(again.status, 200);
    assert.equal(again.json.result.summary.score, fin.json.result.summary.score);
    assert.equal(again.json.profile.balances.credits, credits);
  });

  it('rejects a forged run token', async () => {
    const { token } = await login('device-runs-3');
    const start = await call('POST', '/api/runs/start', token, { routeId: 'neon' });
    clock += 65000;
    const r = await call('POST', `/api/runs/${start.json.run.runId}/finish`, token, { token: 'forged', inputs: [] });
    assert.equal(r.status, 403);
  });

  it('rejects impossibly fast submissions from the leaderboard', async () => {
    const { token } = await login('device-runs-4');
    const start = await call('POST', '/api/runs/start', token, { routeId: 'neon' });
    const run = start.json.run;
    const bot = playBot({ config: DEFAULT_CONFIG, routeId: 'neon', seed: run.seed, gear: DEFAULT_GEAR, revivesAllowed: 0 });
    clock += 5000;
    const r = await call('POST', `/api/runs/${run.runId}/finish`, token, { token: run.token, inputs: bot.inputs, summary: bot.summary });
    assert.equal(r.json.result.rejected, 'abnormal_timing');
    assert.equal(r.json.result.ranked, false);
    assert.equal(r.json.profile.leaderboard.best, 0);
  });

  async function reviveRun(token: string, pay: boolean) {
    const start = await call('POST', '/api/runs/start', token, { routeId: 'neon' });
    const run = start.json.run;
    if (pay) assert.equal((await call('POST', `/api/runs/${run.runId}/revive`, token, { method: 'token' })).status, 200);
    const { RunSim } = await import('@void-rush/shared');
    const local = new RunSim({ config: DEFAULT_CONFIG, routeId: 'neon', seed: run.seed, gear: DEFAULT_GEAR, revivesAllowed: 1 });
    const inputs: [number, string][] = [];
    while (!local.done) {
      const acts: any[] = [];
      if (local.phase === 'checkpoint') acts.push(`boost:${local.checkpointOptions!.find((b) => b !== 'shield')}`);
      else if (local.phase === 'down') acts.push(local.revivesUsed === 0 ? 'revive' : 'end');
      for (const a of acts) inputs.push([local.tick, a]);
      local.step(acts);
    }
    assert.equal(local.revivesUsed, 1, 'idle runner should crash at least once');
    clock += 65000;
    const r = await call('POST', `/api/runs/${run.runId}/finish`, token, { token: run.token, inputs, summary: local.summary() });
    assert.equal(r.status, 200);
    return { run, r };
  }

  it('ignores revives that were not paid for (desync, unranked)', async () => {
    const { token } = await login('device-runs-5');
    const { r } = await reviveRun(token, false);
    assert.equal(r.json.result.desync, true);
    assert.equal(r.json.result.ranked, false);
    assert.equal(r.json.result.summary.revivesUsed, 0);
  });

  it('a paid revive is honoured by the replay and cannot be bought twice', async () => {
    const { token } = await login('device-runs-6');
    const { run, r } = await reviveRun(token, true);
    assert.equal(r.json.result.desync, false);
    assert.equal(r.json.result.summary.revivesUsed, 1);
    assert.equal(r.json.profile.balances.reviveTokens, 0);
    const second = await call('POST', `/api/runs/${run.runId}/revive`, token, { method: 'stars' });
    assert.equal(second.status, 409);
  });

  it('refuses runs without energy', async () => {
    const { token } = await login('device-runs-7');
    for (let i = 0; i < 6; i++) assert.equal((await call('POST', '/api/runs/start', token, { routeId: 'neon' })).status, 200);
    const r = await call('POST', '/api/runs/start', token, { routeId: 'neon' });
    assert.equal(r.status, 402);
    assert.equal(r.json.error.code, 'insufficient_energy');
    assert.ok(r.json.error.details.nextInSec > 0);
  });

  it('locks routes by level', async () => {
    const { token } = await login('device-runs-8');
    const r = await call('POST', '/api/runs/start', token, { routeId: 'bridge' });
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, 'route_locked');
  });
});

describe('economy', () => {
  it('currency purchases are idempotent per key', async () => {
    const { token } = await login('device-shop-1');
    const body = { productId: 'energy_10', idempotencyKey: 'key-energy-0001' };
    const a = await call('POST', '/api/shop/purchase', token, body);
    const b = await call('POST', '/api/shop/purchase', token, body);
    assert.equal(a.status, 200);
    assert.equal(a.json.order.status, 'paid');
    assert.equal(b.json.order.orderId, a.json.order.orderId);
    assert.equal(b.json.profile.balances.stars, DEFAULT_CONFIG.starter.stars - 25);
    assert.equal(b.json.profile.energy.value, 40);
  });

  it('provider callbacks never grant twice', async () => {
    const { token } = await login('device-shop-2');
    const a = await call('POST', '/api/shop/purchase', token, { productId: 'stars_500', idempotencyKey: 'key-stars-0001' });
    assert.equal(a.json.order.status, 'pending');
    assert.equal(a.json.order.provider, 'sandbox');
    const id = a.json.order.orderId;
    assert.equal(game.confirmOrder(id, 'charge-1', 50).granted, true);
    assert.equal(game.confirmOrder(id, 'charge-1', 50).granted, false);
    assert.equal(game.confirmOrder(id, 'charge-2', 50).granted, false);
    const st = await call('GET', `/api/shop/orders/${id}`, token);
    assert.equal(st.json.order.status, 'paid');
    assert.equal(st.json.profile.balances.stars, DEFAULT_CONFIG.starter.stars + 500);
  });

  it('insufficient funds are reported with required/current amounts', async () => {
    const { token } = await login('device-shop-3');
    const r = await call('POST', '/api/shop/purchase', token, { productId: 'season_pass', idempotencyKey: 'key-pass-00001' });
    assert.equal(r.status, 402);
    assert.deepEqual(r.json.error.details, { currency: 'stars', required: 950, current: DEFAULT_CONFIG.starter.stars });
  });

  it('gear upgrades are guarded by expected level', async () => {
    const { token } = await login('device-gear-1');
    const a = await call('POST', '/api/gear/upgrade', token, { slot: 'boots', expectedLevel: 1 });
    assert.equal(a.status, 200);
    assert.equal(a.json.profile.gear.boots, 2);
    const b = await call('POST', '/api/gear/upgrade', token, { slot: 'boots', expectedLevel: 1 });
    assert.equal(b.status, 409);
    assert.equal(b.json.error.code, 'stale_level');
  });

  it('missions and streak rewards cannot be claimed twice', async () => {
    const { token } = await login('device-miss-1');
    const s1 = await call('POST', '/api/streak/claim', token);
    assert.equal(s1.status, 200);
    assert.equal((await call('POST', '/api/streak/claim', token)).status, 409);
    for (let i = 0; i < 3; i++) await playRun(token, 'neon');
    const prof = (await call('GET', '/api/profile', token)).json.profile;
    const claimable = [...prof.missions.daily.map((m: any) => ({ ...m, period: 'daily' })), ...prof.missions.weekly.map((m: any) => ({ ...m, period: 'weekly' }))].find((m: any) => m.claimable);
    assert.ok(claimable, 'expected at least one completed mission after 3 runs');
    const c1 = await call('POST', '/api/missions/claim', token, { period: claimable.period, missionId: claimable.id });
    assert.equal(c1.status, 200);
    const c2 = await call('POST', '/api/missions/claim', token, { period: claimable.period, missionId: claimable.id });
    assert.equal(c2.status, 409);
  });

  it('weekly leaderboard rewards settle once', async () => {
    const { token } = await login('device-lb-1');
    await playRun(token, 'neon');
    clock += 8 * 86400000;
    const prof = (await call('GET', '/api/profile', token)).json.profile;
    assert.equal(prof.leaderboard.pendingReward, true);
    assert.equal((await call('POST', '/api/leaderboard/claim', token)).status, 200);
    assert.equal((await call('POST', '/api/leaderboard/claim', token)).status, 409);
  });
});
