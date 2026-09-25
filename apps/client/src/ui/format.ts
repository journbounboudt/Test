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

/** Russian plural form: plural(5, ['день', 'дня', 'дней']) → 'дней'. */
export function plural(n: number, forms: readonly [one: string, few: string, many: string]): string {
  const a = Math.abs(Math.trunc(n));
  const d10 = a % 10;
  const d100 = a % 100;
  if (d10 === 1 && d100 !== 11) return forms[0];
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return forms[1];
  return forms[2];
}

/** `5 дней`, with the number formatted. */
export const pluralN = (n: number, forms: readonly [string, string, string]) => `${fmt(n)} ${plural(n, forms)}`;

export const DAYS = ['день', 'дня', 'дней'] as const;
export const RUNS = ['забег', 'забега', 'забегов'] as const;
export const LEVELS = ['уровень', 'уровня', 'уровней'] as const;

/** Pill-friendly number: full up to 9 999, then `12,4K` / `1,2M`. */
export function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.', ',').replace(',0', '')}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace('.', ',').replace(',0', '')}K`;
  return fmt(n);
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
