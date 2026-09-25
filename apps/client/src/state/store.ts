import type { Currency, RemoteConfig, RouteId } from '@void-rush/shared';
import { create } from 'zustand';
import type { ConfigResponse, Profile, RunResult, RunTicket } from '../api/types';

export type Screen = 'home' | 'routes' | 'howto' | 'run' | 'results' | 'gear' | 'shop' | 'pass' | 'leaderboard' | 'event';
export type ShopTab = 'stars' | 'energy' | 'skins' | 'pass';

export type Modal =
  | { type: 'energy'; required?: number }
  | { type: 'currency'; currency: Currency | 'reviveTokens' | 'skinFragments'; required: number; current: number }
  | { type: 'streak' }
  | { type: 'settings' }
  | { type: 'purchase'; productId: string }
  | { type: 'upgrade'; slot: import('@void-rush/shared').GearSlot }
  | { type: 'upgradeAll' }
  | { type: 'skin'; skinId?: string }
  | { type: 'passTrack' }
  | { type: 'shards' }
  | { type: 'notice'; title: string; message: string; action?: { label: string; run: () => void } };

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error' | 'reward';
}

export interface ActiveRun {
  ticket: RunTicket;
  routeId: RouteId;
  tutorial: boolean;
}

interface State {
  boot: 'loading' | 'ready' | 'error' | 'maintenance' | 'outdated';
  bootMessage: string;
  bootProgress: number;
  config: RemoteConfig | null;
  meta: Omit<ConfigResponse, 'config'> | null;
  profile: Profile | null;
  profileAt: number;
  screen: Screen;
  history: Screen[];
  selectedRoute: RouteId;
  shopTab: ShopTab;
  gearHighlight: boolean;
  homeHighlight: boolean;
  modal: Modal | null;
  toasts: Toast[];
  activeRun: ActiveRun | null;
  lastResult: RunResult | null;
  busy: Record<string, boolean>;
}

interface Actions {
  navigate(screen: Screen, opts?: { replace?: boolean }): void;
  back(): void;
  setProfile(p: Profile): void;
  openModal(m: Modal): void;
  closeModal(): void;
  toast(text: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
  setBusy(key: string, on: boolean): void;
}

let toastId = 1;
const TABS: Screen[] = ['home', 'routes', 'gear', 'shop', 'pass'];

export const useStore = create<State & Actions>((set, get) => ({
  boot: 'loading',
  bootMessage: 'Подключение к пустоте…',
  bootProgress: 0.1,
  config: null,
  meta: null,
  profile: null,
  profileAt: 0,
  screen: 'home',
  history: [],
  selectedRoute: 'neon',
  shopTab: 'stars',
  gearHighlight: false,
  homeHighlight: false,
  modal: null,
  toasts: [],
  activeRun: null,
  lastResult: null,
  busy: {},

  navigate(screen, opts) {
    const { screen: cur, history } = get();
    if (screen === cur) return;
    // Bottom-nav tabs reset the stack; sub-screens push onto it.
    const nextHistory = opts?.replace || TABS.includes(screen) ? (screen === 'home' ? [] : ['home' as Screen]) : [...history, cur];
    set({ screen, history: nextHistory.filter((s, i, a) => s !== screen && a.indexOf(s) === i) });
    window.scrollTo(0, 0);
  },
  back() {
    const { history } = get();
    const prev = history[history.length - 1] ?? 'home';
    set({ screen: prev, history: history.slice(0, -1) });
  },
  setProfile(p) {
    set({ profile: p, profileAt: Date.now() });
  },
  openModal(m) {
    set({ modal: m });
  },
  closeModal() {
    set({ modal: null });
  },
  toast(text, kind = 'info') {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, kind }] }));
    setTimeout(() => get().dismissToast(id), 2800);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  setBusy(key, on) {
    set((s) => ({ busy: { ...s.busy, [key]: on } }));
  },
}));

export const cfg = (): RemoteConfig => {
  const c = useStore.getState().config;
  if (!c) throw new Error('config not loaded');
  return c;
};
