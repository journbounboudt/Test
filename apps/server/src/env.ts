import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function flag(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

export interface ServerEnv {
  port: number;
  host: string;
  production: boolean;
  dataDir: string;
  dbFile: string;
  clientDist: string;
  botToken: string;
  botUsername: string;
  appShortName: string;
  publicUrl: string;
  sessionSecret: string;
  webhookSecret: string;
  devAuth: boolean;
  paymentsSandbox: boolean;
  seedDemo: boolean;
  configOverrideFile: string;
}

export function loadEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  const production = process.env.NODE_ENV === 'production';
  const botToken = process.env.BOT_TOKEN ?? '';
  const dataDir = process.env.DATA_DIR ?? path.join(root, 'data');
  const sessionSecret = process.env.SESSION_SECRET ?? '';
  if (production && !sessionSecret && !overrides.sessionSecret) {
    throw new Error('SESSION_SECRET must be set in production');
  }
  const env: ServerEnv = {
    port: Number(process.env.PORT ?? 8787),
    host: process.env.HOST ?? '0.0.0.0',
    production,
    dataDir,
    dbFile: process.env.DB_FILE ?? path.join(dataDir, 'void-rush.sqlite'),
    clientDist: process.env.CLIENT_DIST ?? path.join(root, 'apps/client/dist'),
    botToken,
    botUsername: process.env.BOT_USERNAME ?? '',
    appShortName: process.env.APP_SHORT_NAME ?? 'play',
    publicUrl: process.env.PUBLIC_URL ?? '',
    sessionSecret: sessionSecret || 'dev-only-session-secret-change-me',
    webhookSecret: process.env.WEBHOOK_SECRET ?? '',
    // Dev identities are never allowed in production.
    devAuth: !production && flag('DEV_AUTH', true),
    // Sandbox payments confirm orders without Telegram; only outside production and without a bot token.
    paymentsSandbox: !production && flag('PAYMENTS_SANDBOX', !botToken),
    seedDemo: flag('SEED_DEMO', !production),
    configOverrideFile: process.env.REMOTE_CONFIG_FILE ?? path.join(dataDir, 'remote-config.json'),
  };
  return { ...env, ...overrides };
}
