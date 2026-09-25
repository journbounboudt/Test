import crypto from 'node:crypto';
import { ApiError } from './errors.ts';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface InitDataResult {
  user: TelegramUser;
  startParam?: string;
  authDate: number;
}

/** Validates Telegram WebApp initData per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
export function validateInitData(initData: string, botToken: string, maxAgeSec = 86400, now = Date.now()): InitDataResult {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new ApiError('auth_invalid', 401, 'Не удалось подтвердить вход через Telegram');
  params.delete('hash');
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new ApiError('auth_invalid', 401, 'Не удалось подтвердить вход через Telegram');
  }
  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || now / 1000 - authDate > maxAgeSec) throw new ApiError('auth_expired', 401, 'Сессия Telegram устарела, откройте игру заново');
  const userRaw = params.get('user');
  if (!userRaw) throw new ApiError('auth_invalid', 401, 'Нет данных пользователя Telegram');
  const user = JSON.parse(userRaw) as TelegramUser;
  return { user, startParam: params.get('start_param') ?? undefined, authDate };
}

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

export function sign(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(secret: string, playerId: string, ttlSec = 7 * 86400, now = Date.now()): string {
  const body = b64(JSON.stringify({ pid: playerId, exp: Math.floor(now / 1000) + ttlSec }));
  return `${body}.${sign(secret, body)}`;
}

export function verifySessionToken(secret: string, token: string, now = Date.now()): string {
  const [body, sig] = token.split('.');
  if (!body || !sig) throw new ApiError('unauthorized', 401, 'Требуется вход');
  const expected = sign(secret, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new ApiError('unauthorized', 401, 'Требуется вход');
  const { pid, exp } = JSON.parse(Buffer.from(body, 'base64url').toString()) as { pid: string; exp: number };
  if (exp * 1000 < now) throw new ApiError('session_expired', 401, 'Сессия истекла');
  return pid;
}

export function runToken(secret: string, run: { id: string; playerId: string; seed: number; routeId: string; configVersion: string }): string {
  return sign(secret, `run|${run.id}|${run.playerId}|${run.seed}|${run.routeId}|${run.configVersion}`);
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString('base64url')}`;
}

export function randomSeed(): number {
  return crypto.randomBytes(4).readUInt32LE(0);
}
