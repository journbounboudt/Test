import { formatNumber, type RewardBundle } from '@void-rush/shared';

export const fmt = (n: number) => formatNumber(n);

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 100_000) return `${Math.floor(n / 1000)}K`;
  return fmt(n);
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м ${s % 60}с`;
}

export function durationLong(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}д ${h}ч ${m}м` : `${h}ч ${m}м`;
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const REWARD_LABEL: Record<string, string> = {
  credits: 'Кредиты',
  shards: 'Осколки',
  stars: 'Звёзды',
  energy: 'Энергия',
  reviveTokens: 'Возрождения',
  xp: 'Опыт',
  passXp: 'Опыт пропуска',
  skinFragments: 'Фрагменты',
  skin: 'Скин',
  premiumPass: 'Премиум-пропуск',
};

export function rewardEntries(b: RewardBundle): { key: string; amount: number; skin?: string }[] {
  const out: { key: string; amount: number; skin?: string }[] = [];
  for (const k of ['stars', 'shards', 'credits', 'energy', 'reviveTokens', 'skinFragments', 'passXp', 'xp'] as const) if (b[k]) out.push({ key: k, amount: b[k]! });
  if (b.skin) out.push({ key: 'skin', amount: 1, skin: b.skin });
  if (b.premiumPass) out.push({ key: 'premiumPass', amount: 1 });
  return out;
}
