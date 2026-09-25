import { CLIENT_VERSION, type BoostId, type GearSlot, type RouteId, type RunSummary } from '@void-rush/shared';
import { ApiError, api, setToken } from '../api/client';
import type { EventView, LeaderboardView, OrderView, PassView, Profile, RunResult, RunTicket, ShopProduct } from '../api/types';
import { audio } from '../audio/audio';
import { track, flushAnalytics } from '../analytics';
import { tg } from '../platform/telegram';
import { useStore } from './store';

const S = () => useStore.getState();
const PENDING_KEY = 'vr_pending_finish';

function versionLess(a: string, b: string) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  return false;
}

function deviceId(): string {
  let id = localStorage.getItem('vr_device');
  if (!id) {
    id = `dev_${crypto.getRandomValues(new Uint32Array(3)).join('')}`.slice(0, 40);
    localStorage.setItem('vr_device', id);
  }
  return id;
}

export function applySettings(p: Profile) {
  audio.setEnabled(p.settings.music, p.settings.sfx);
  tg.setHaptics(p.settings.haptics);
  document.documentElement.classList.toggle('reduced-flash', p.settings.reducedFlash);
}

export function setProfile(p: Profile) {
  S().setProfile(p);
  applySettings(p);
}

/** Central error policy: economy errors open the matching modal, everything else becomes a friendly toast. */
export function handleError(err: unknown, fallback = 'Не получилось. Попробуйте ещё раз.') {
  const st = S();
  if (!(err instanceof ApiError)) {
    console.error(err);
    st.toast(fallback, 'error');
    return;
  }
  switch (err.code) {
    case 'insufficient_energy':
      st.openModal({ type: 'energy', required: Number(err.details?.required ?? 0) });
      tg.haptic('warning');
      return;
    case 'insufficient_funds':
      st.openModal({ type: 'currency', currency: (err.details?.currency as never) ?? 'stars', required: Number(err.details?.required ?? 0), current: Number(err.details?.current ?? 0) });
      tg.haptic('warning');
      return;
    case 'maintenance':
      useStore.setState({ boot: 'maintenance' });
      return;
    case 'unauthorized':
    case 'session_expired':
      void authenticate().catch(() => st.toast('Сессия истекла. Откройте игру заново.', 'error'));
      return;
    default:
      st.toast(err.message || fallback, 'error');
      tg.haptic('error');
  }
}

async function authenticate(): Promise<Profile> {
  const meta = S().meta;
  let res: { token: string; profile: Profile };
  if (tg.available && meta?.auth.telegram) {
    res = await api.post('/api/auth/telegram', { initData: tg.initData }, { retries: 2 });
  } else if (meta?.auth.dev) {
    res = await api.post('/api/auth/dev', { deviceId: deviceId(), name: localStorage.getItem('vr_name') ?? 'Alex', startParam: tg.startParam }, { retries: 2 });
  } else {
    throw new ApiError('auth_unavailable', 401, tg.available ? 'Вход через Telegram временно недоступен' : 'Откройте VOID RUSH в Telegram');
  }
  setToken(res.token);
  setProfile(res.profile);
  return res.profile;
}

export async function boot() {
  useStore.setState({ boot: 'loading', bootProgress: 0.15, bootMessage: 'Подключение к пустоте…' });
  try {
    await tg.init();
    const conf = await api.config();
    const { config, ...meta } = conf;
    useStore.setState({ config, meta, bootProgress: 0.45, bootMessage: 'Синхронизация профиля…' });
    if (config.maintenance) {
      useStore.setState({ boot: 'maintenance' });
      return;
    }
    if (versionLess(CLIENT_VERSION, config.minClientVersion)) {
      useStore.setState({ boot: 'outdated' });
      return;
    }
    const profile = await authenticate();
    useStore.setState({ bootProgress: 0.8, bootMessage: 'Прогрев реактора…' });
    await import('../game/preload').then((m) => m.preloadCore()).catch(() => undefined);
    useStore.setState({ boot: 'ready', bootProgress: 1, homeHighlight: !profile.tutorialDone });
    track('app_open', { tg: tg.available });
    void retryPendingFinish();
  } catch (err) {
    const e = err instanceof ApiError ? err : new ApiError('network', 0, 'Нет соединения с сервером');
    if (e.code === 'maintenance') useStore.setState({ boot: 'maintenance' });
    else useStore.setState({ boot: 'error', bootMessage: e.message });
  }
}

export async function refreshProfile() {
  try {
    const r = await api.get<{ profile: Profile }>('/api/profile');
    setProfile(r.profile);
  } catch (err) {
    if (err instanceof ApiError && !err.isNetwork) handleError(err);
  }
}

// ───────────── runs ─────────────

export async function startRun(routeId: RouteId, opts: { tutorial?: boolean } = {}): Promise<boolean> {
  const st = S();
  if (st.busy.startRun) return false;
  st.setBusy('startRun', true);
  try {
    const r = await api.post<{ run: RunTicket; profile: Profile }>('/api/runs/start', { routeId });
    setProfile(r.profile);
    useStore.setState({ activeRun: { ticket: r.run, routeId, tutorial: Boolean(opts.tutorial) }, lastResult: null, homeHighlight: false });
    S().navigate('run');
    track(routeId === 'event' ? 'event_run_start' : 'run_start', { routeId, energy: r.run.energySpent });
    if (opts.tutorial) track('tutorial_start');
    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    S().setBusy('startRun', false);
  }
}

export async function buyRevive(runId: string, method: 'token' | 'stars'): Promise<boolean> {
  try {
    const r = await api.post<{ profile: Profile }>(`/api/runs/${runId}/revive`, { method });
    setProfile(r.profile);
    track('revive_accept', { method });
    return true;
  } catch (err) {
    handleError(err);
    return false;
  }
}

interface PendingFinish {
  runId: string;
  token: string;
  inputs: [number, string][];
  summary: RunSummary;
}

export async function submitRun(p: PendingFinish): Promise<RunResult> {
  localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  const r = await api.post<{ result: RunResult; profile: Profile }>(`/api/runs/${p.runId}/finish`, { token: p.token, inputs: p.inputs, summary: p.summary }, { retries: 3, timeoutMs: 20000 });
  localStorage.removeItem(PENDING_KEY);
  setProfile(r.profile);
  track(r.result.summary.finished ? 'run_finish' : 'run_fail', { routeId: r.result.routeId, score: r.result.summary.score, grade: r.result.summary.grade, ranked: r.result.ranked });
  if (r.result.routeId === 'event') track('event_contribution', { damage: r.result.contribution });
  if (r.result.routeId === 'tutorial') track('tutorial_complete');
  for (const m of r.result.missionsCompleted) track('mission_complete', { title: m });
  return r.result;
}

/** Re-submits a run whose result never reached the server (tab closed, network loss). */
async function retryPendingFinish() {
  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) return;
  try {
    await submitRun(JSON.parse(raw) as PendingFinish);
    S().toast('Прошлый забег засчитан', 'success');
  } catch (err) {
    if (err instanceof ApiError && !err.isNetwork) localStorage.removeItem(PENDING_KEY);
  }
}

export async function doubleReward(runId: string): Promise<boolean> {
  const st = S();
  if (st.busy.double) return false;
  st.setBusy('double', true);
  try {
    const r = await api.post<{ profile: Profile; bonus: { credits: number; shards: number } }>(`/api/runs/${runId}/double`);
    setProfile(r.profile);
    audio.sfx('purchase');
    tg.haptic('success');
    st.toast(`Награда удвоена: +${r.bonus.credits} кредитов, +${r.bonus.shards} осколков`, 'reward');
    return true;
  } catch (err) {
    handleError(err);
    return false;
  } finally {
    S().setBusy('double', false);
  }
}

// ───────────── generic mutation helper ─────────────

export async function mutate<T extends { profile?: Profile }>(key: string, url: string, body: unknown, success?: string): Promise<T | null> {
  const st = S();
  if (st.busy[key]) return null;
  st.setBusy(key, true);
  try {
    const r = await api.post<T>(url, body);
    if (r.profile) setProfile(r.profile);
    if (success) st.toast(success, 'success');
    return r;
  } catch (err) {
    handleError(err);
    return null;
  } finally {
    S().setBusy(key, false);
  }
}

export async function upgradeGear(slot: GearSlot, expectedLevel: number) {
  const r = await mutate<{ profile: Profile; level: number; missionsCompleted: string[] }>(`upgrade:${slot}`, '/api/gear/upgrade', { slot, expectedLevel });
  if (r) {
    audio.sfx('upgrade');
    tg.haptic('success');
    track('gear_upgrade', { slot, level: r.level });
    useStore.setState({ gearHighlight: false });
    r.missionsCompleted.forEach((m) => S().toast(`Задание выполнено: ${m}`, 'reward'));
  }
  return r;
}

export async function upgradeAll(expected: { credits: number; shards: number }) {
  const r = await mutate<{ profile: Profile; steps: unknown[]; missionsCompleted: string[] }>('upgradeAll', '/api/gear/upgrade-all', { expected });
  if (r) {
    audio.sfx('upgrade');
    tg.haptic('success');
    track('gear_upgrade', { all: true, steps: r.steps.length });
    useStore.setState({ gearHighlight: false });
  }
  return r;
}

export async function claimStreak() {
  const r = await mutate<{ profile: Profile; reward: object }>('streak', '/api/streak/claim', {});
  if (r) {
    audio.sfx('chest');
    tg.haptic('success');
    track('reward_claim', { source: 'streak' });
  }
  return r;
}

export async function claimMission(period: 'daily' | 'weekly', missionId: string) {
  const r = await mutate<{ profile: Profile }>(`mission:${missionId}`, '/api/missions/claim', { period, missionId }, 'Награда получена');
  if (r) {
    audio.sfx('chest');
    track('reward_claim', { source: 'mission', missionId });
  }
  return r;
}

export async function claimPass(level: number | 'all', trackName: 'free' | 'premium' | 'all') {
  const r = await mutate<{ profile: Profile; pass: PassView; granted: object[] }>(`pass:${level}:${trackName}`, '/api/pass/claim', { level, track: trackName });
  if (r) {
    audio.sfx('chest');
    tg.haptic('success');
    track('reward_claim', { source: 'pass', level, track: trackName });
    S().toast(r.granted.length > 1 ? `Получено наград: ${r.granted.length}` : 'Награда получена', 'reward');
  }
  return r;
}

export async function equipSkin(skinId: string) {
  const r = await mutate<{ profile: Profile }>('equip', '/api/skins/equip', { skinId }, 'Скин надет');
  if (r) audio.sfx('click');
  return r;
}

export async function unlockSkin(skinId: string) {
  const r = await mutate<{ profile: Profile }>('unlockSkin', '/api/skins/unlock', { skinId }, 'Скин открыт!');
  if (r) {
    audio.sfx('purchase');
    tg.haptic('success');
  }
  return r;
}

export async function saveSettings(settings: Partial<Profile['settings']>) {
  const p = S().profile;
  if (p) setProfile({ ...p, settings: { ...p.settings, ...settings } });
  await mutate('settings', '/api/profile/settings', { settings });
}

export async function skipTutorial() {
  await mutate('tutorialSkip', '/api/profile/tutorial-skip', {});
  useStore.setState({ homeHighlight: false });
}

export const fetchShop = () => api.get<{ products: ShopProduct[]; profile: Profile }>('/api/shop');
export const fetchPass = () => api.get<{ pass: PassView; profile: Profile }>('/api/pass');
export const fetchLeaderboard = (tab: 'top' | 'friends') => api.get<{ leaderboard: LeaderboardView }>(`/api/leaderboard?tab=${tab}`);
export const fetchEvent = () => api.get<{ event: EventView }>('/api/event');

export async function claimWeekly() {
  const r = await mutate<{ profile: Profile; rank: number }>('claimWeekly', '/api/leaderboard/claim', {});
  if (r) {
    audio.sfx('chest');
    S().toast(`Награда турнира за место #${r.rank} получена`, 'reward');
  }
  return r;
}

export async function claimEventMilestone(index: number) {
  const r = await mutate<{ profile: Profile; event: EventView }>(`event:${index}`, '/api/event/claim', { index }, 'Награда события получена');
  if (r) audio.sfx('chest');
  return r;
}

// ───────────── purchases ─────────────

export type PurchaseOutcome = { status: 'paid'; order: OrderView } | { status: 'cancelled' | 'failed' | 'pending'; order?: OrderView; message?: string };

async function pollOrder(orderId: string, timeoutMs = 60000): Promise<OrderView> {
  const until = Date.now() + timeoutMs;
  let last: OrderView | null = null;
  while (Date.now() < until) {
    const r = await api.get<{ order: OrderView; profile: Profile }>(`/api/shop/orders/${orderId}`);
    last = r.order;
    if (r.order.status !== 'pending') {
      setProfile(r.profile);
      return r.order;
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return last ?? { orderId, productId: '', status: 'pending', provider: 'telegram' };
}

/**
 * Purchase flow: create order (idempotent key per attempt) → pay via Telegram Stars invoice (or the
 * dev sandbox) → poll until the backend confirms → entitlement is granted server-side exactly once.
 */
export async function purchase(productId: string, idempotencyKey: string, confirmSandbox: () => Promise<boolean>): Promise<PurchaseOutcome> {
  track('purchase_start', { productId });
  try {
    const r = await api.post<{ order: OrderView; profile: Profile }>('/api/shop/purchase', { productId, idempotencyKey }, { retries: 2 });
    setProfile(r.profile);
    let order = r.order;
    if (order.status === 'pending') {
      if (order.provider === 'telegram' && order.invoiceUrl) {
        const status = await tg.openInvoice(order.invoiceUrl);
        if (status === 'cancelled' || status === 'failed') {
          await api.post(`/api/shop/orders/${order.orderId}/cancel`, { status }).catch(() => undefined);
          track('purchase_fail', { productId, status });
          return { status, order };
        }
        order = await pollOrder(order.orderId);
      } else if (order.provider === 'sandbox') {
        const ok = await confirmSandbox();
        if (!ok) {
          await api.post(`/api/shop/orders/${order.orderId}/cancel`, { status: 'cancelled' }).catch(() => undefined);
          return { status: 'cancelled', order };
        }
        const c = await api.post<{ order: OrderView; profile: Profile }>(`/api/shop/orders/${order.orderId}/sandbox-confirm`, {}, { retries: 2 });
        setProfile(c.profile);
        order = c.order;
      } else {
        return { status: 'failed', message: 'Оплата сейчас недоступна' };
      }
    }
    if (order.status === 'paid') {
      track(productId === S().config?.season.premiumProductId ? 'pass_purchase' : 'purchase_success', { productId });
      audio.sfx('purchase');
      tg.haptic('success');
      return { status: 'paid', order };
    }
    track('purchase_fail', { productId, status: order.status });
    return { status: order.status === 'pending' ? 'pending' : 'failed', order };
  } catch (err) {
    track('purchase_fail', { productId, error: err instanceof ApiError ? err.code : 'unknown' });
    if (err instanceof ApiError && (err.code === 'insufficient_funds' || err.code === 'insufficient_energy')) {
      handleError(err);
      return { status: 'cancelled' };
    }
    return { status: 'failed', message: err instanceof ApiError ? err.message : 'Не удалось завершить покупку' };
  }
}

export function boostName(id: BoostId) {
  return S().config?.boosts[id].name ?? id;
}

window.addEventListener('pagehide', () => flushAnalytics(true));
