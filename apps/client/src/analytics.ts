import { api } from './api/client';

type Evt = { name: string; props?: Record<string, unknown>; ts: number };
const queue: Evt[] = [];
let timer: number | null = null;

export function track(name: string, props?: Record<string, unknown>) {
  queue.push({ name, props, ts: Date.now() });
  if (queue.length >= 20) flushAnalytics();
  else if (timer === null) timer = window.setTimeout(() => flushAnalytics(), 8000);
}

export function flushAnalytics(_unloading = false) {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const events = queue.splice(0, 50);
  api.post('/api/analytics', { events }).catch(() => undefined);
}
