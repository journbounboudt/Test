import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { CLIENT_VERSION, GEAR_SLOTS, productById, type GearSlot, type RouteId } from '@void-rush/shared';
import { createSessionToken, validateInitData, verifySessionToken } from './auth.ts';
import { Db } from './db.ts';
import { seedDemo } from './demo.ts';
import type { ServerEnv } from './env.ts';
import { ApiError, badRequest } from './errors.ts';
import { Game } from './game.ts';
import { ConfigStore } from './remoteConfig.ts';
import { createStarsInvoice, handleUpdate } from './telegram.ts';

declare module 'fastify' {
  interface FastifyRequest {
    playerId: string;
  }
}

type Body = Record<string, unknown>;

export function buildApp(env: ServerEnv) {
  const db = new Db(env.dbFile);
  const configs = new ConfigStore(db, env.configOverrideFile);
  const game = new Game(db, configs, env);
  if (env.seedDemo) seedDemo(game);

  const app = Fastify({ logger: env.production ? { level: 'info' } : false, bodyLimit: 512 * 1024, trustProxy: true });
  app.decorateRequest('playerId', '');

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details ?? null } });
    }
    const e = err as { statusCode?: number; validation?: unknown; message?: string };
    if (e.statusCode && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: { code: 'bad_request', message: 'Некорректный запрос', details: null } });
    }
    req.log.error(err);
    if (!env.production) console.error(err);
    return reply.status(500).send({ error: { code: 'server_error', message: 'Что-то пошло не так. Попробуйте ещё раз.', details: null } });
  });

  const auth = async (req: FastifyRequest) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    req.playerId = verifySessionToken(env.sessionSecret, token);
  };

  const maintenanceGuard = async (_req: FastifyRequest, reply: FastifyReply) => {
    if (game.config.maintenance) {
      return reply.status(503).send({ error: { code: 'maintenance', message: 'Идут технические работы', details: null } });
    }
  };

  const withProfile = (playerId: string, extra: object = {}) => ({ ...extra, profile: game.profile(game.players.load(playerId)) });

  // ── public ──
  app.get('/api/health', async () => ({ ok: true, version: CLIENT_VERSION }));

  app.get('/api/config', async () => {
    const cfg = game.config;
    return {
      config: cfg,
      clientVersion: CLIENT_VERSION,
      auth: { telegram: Boolean(env.botToken), dev: env.devAuth },
      payments: { telegram: Boolean(env.botToken), sandbox: env.paymentsSandbox },
      share: env.botUsername ? { bot: env.botUsername, app: env.appShortName } : null,
    };
  });

  app.post('/api/auth/telegram', async (req) => {
    if (!env.botToken) throw new ApiError('auth_unavailable', 503, 'Вход через Telegram не настроен на сервере');
    const { initData } = (req.body ?? {}) as Body;
    if (typeof initData !== 'string' || initData.length > 8192) throw badRequest();
    const data = validateInitData(initData, env.botToken);
    const u = data.user;
    const player = game.loginPlatform({
      platform: 'telegram',
      platformUserId: String(u.id),
      displayName: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Бегун',
      username: u.username ?? null,
      avatarUrl: u.photo_url ?? null,
      startParam: data.startParam,
    });
    const p = game.touch(player.id);
    return { token: createSessionToken(env.sessionSecret, p.id), profile: game.profile(p) };
  });

  app.post('/api/auth/dev', async (req) => {
    if (!env.devAuth) throw new ApiError('auth_unavailable', 403, 'Гостевой вход отключён');
    const { deviceId, name, startParam } = (req.body ?? {}) as Body;
    if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(deviceId)) throw badRequest();
    const player = game.loginPlatform({ platform: 'dev', platformUserId: deviceId, displayName: typeof name === 'string' ? name : 'Alex', startParam: typeof startParam === 'string' ? startParam : undefined });
    const p = game.touch(player.id);
    return { token: createSessionToken(env.sessionSecret, p.id), profile: game.profile(p) };
  });

  app.post('/api/telegram/webhook', async (req, reply) => {
    if (!env.botToken) return reply.status(404).send();
    if (env.webhookSecret && req.headers['x-telegram-bot-api-secret-token'] !== env.webhookSecret) return reply.status(401).send();
    try {
      await handleUpdate(env, game, req.body as never);
    } catch (err) {
      req.log.error(err);
    }
    return { ok: true };
  });

  // ── authenticated ──
  app.register(async (api) => {
    api.addHook('preHandler', auth);
    api.addHook('preHandler', maintenanceGuard);

    api.get('/api/profile', async (req) => ({ profile: game.profile(game.touch(req.playerId)) }));

    api.post('/api/profile/settings', async (req) => {
      game.updateSettings(req.playerId, ((req.body ?? {}) as Body).settings as never);
      return withProfile(req.playerId);
    });

    api.post('/api/profile/tutorial-skip', async (req) => {
      game.completeTutorialSkip(req.playerId);
      return withProfile(req.playerId);
    });

    api.post('/api/streak/claim', async (req) => {
      const r = game.claimStreak(req.playerId);
      return withProfile(req.playerId, { reward: r.reward });
    });

    api.post('/api/runs/start', async (req) => {
      const { routeId } = (req.body ?? {}) as Body;
      const r = game.startRun(req.playerId, routeId as RouteId);
      return withProfile(req.playerId, { run: r.run });
    });

    api.post('/api/runs/:id/revive', async (req) => {
      const { method } = (req.body ?? {}) as Body;
      if (method !== 'token' && method !== 'stars') throw badRequest();
      game.revive(req.playerId, (req.params as { id: string }).id, method);
      return withProfile(req.playerId, { ok: true });
    });

    api.post('/api/runs/:id/finish', async (req) => {
      const body = (req.body ?? {}) as Body;
      const result = game.finishRun(req.playerId, (req.params as { id: string }).id, { token: body.token as string, inputs: body.inputs, clientSummary: body.summary as never });
      return withProfile(req.playerId, { result });
    });

    api.post('/api/runs/:id/double', async (req) => {
      const r = game.doubleReward(req.playerId, (req.params as { id: string }).id);
      return withProfile(req.playerId, { bonus: r.bonus });
    });

    api.post('/api/gear/upgrade', async (req) => {
      const { slot, expectedLevel } = (req.body ?? {}) as Body;
      if (!GEAR_SLOTS.includes(slot as GearSlot) || !Number.isInteger(expectedLevel)) throw badRequest();
      const r = game.upgrade(req.playerId, slot as GearSlot, expectedLevel as number);
      return withProfile(req.playerId, { slot: r.slot, level: r.level, missionsCompleted: r.missionsCompleted });
    });

    api.post('/api/gear/upgrade-all', async (req) => {
      const { expected } = (req.body ?? {}) as Body;
      const e = expected as { credits?: unknown; shards?: unknown } | undefined;
      if (!e || !Number.isInteger(e.credits) || !Number.isInteger(e.shards)) throw badRequest();
      const r = game.upgradeAll(req.playerId, { credits: e.credits as number, shards: e.shards as number });
      return withProfile(req.playerId, { steps: r.steps, missionsCompleted: r.missionsCompleted });
    });

    api.post('/api/skins/equip', async (req) => {
      game.equipSkin(req.playerId, String(((req.body ?? {}) as Body).skinId ?? ''));
      return withProfile(req.playerId);
    });

    api.post('/api/skins/unlock', async (req) => {
      game.unlockSkin(req.playerId, String(((req.body ?? {}) as Body).skinId ?? ''));
      return withProfile(req.playerId);
    });

    api.get('/api/shop', async (req) => {
      const p = game.markSeen(req.playerId, 'shop');
      return { products: game.shop(p), profile: game.profile(p) };
    });

    api.post('/api/shop/purchase', async (req) => {
      const { productId, idempotencyKey } = (req.body ?? {}) as Body;
      if (typeof productId !== 'string' || typeof idempotencyKey !== 'string') throw badRequest();
      const r = game.createPurchase(req.playerId, productId, idempotencyKey);
      let order = r.order;
      if (r.needsInvoice) {
        const product = productById(game.config, productId)!;
        try {
          const url = await createStarsInvoice(env, order.orderId, product);
          game.setInvoiceUrl(order.orderId, url);
          order = { ...order, invoiceUrl: url };
        } catch (err) {
          req.log.error(err);
          game.cancelOrder(req.playerId, order.orderId, 'failed');
          throw new ApiError('payment_provider_error', 502, 'Не удалось создать счёт. Попробуйте ещё раз.');
        }
      }
      return withProfile(req.playerId, { order });
    });

    api.get('/api/shop/orders/:id', async (req) => withProfile(req.playerId, { order: game.orderStatus(req.playerId, (req.params as { id: string }).id) }));

    api.post('/api/shop/orders/:id/cancel', async (req) => {
      const { status } = (req.body ?? {}) as Body;
      return withProfile(req.playerId, { order: game.cancelOrder(req.playerId, (req.params as { id: string }).id, status === 'failed' ? 'failed' : 'cancelled') });
    });

    api.post('/api/shop/orders/:id/sandbox-confirm', async (req) => {
      if (!env.paymentsSandbox) throw new ApiError('forbidden', 403, 'Тестовая оплата отключена');
      const id = (req.params as { id: string }).id;
      const order = game.orderStatus(req.playerId, id);
      if (order.provider !== 'sandbox') throw new ApiError('forbidden', 403, 'Тестовая оплата недоступна для этого заказа');
      game.confirmOrder(id, `sandbox_${id}`, null);
      return withProfile(req.playerId, { order: game.orderStatus(req.playerId, id) });
    });

    api.get('/api/pass', async (req) => withProfile(req.playerId, { pass: game.passView(game.players.load(req.playerId)) }));

    api.post('/api/pass/claim', async (req) => {
      const { level, track } = (req.body ?? {}) as Body;
      const lv = level === 'all' ? 'all' : Number(level);
      if (lv !== 'all' && !Number.isInteger(lv)) throw badRequest();
      if (track !== 'free' && track !== 'premium' && track !== 'all') throw badRequest();
      const r = game.claimPass(req.playerId, lv, track);
      return withProfile(req.playerId, { granted: r.granted, pass: game.passView(r.player) });
    });

    api.post('/api/missions/claim', async (req) => {
      const { period, missionId } = (req.body ?? {}) as Body;
      if ((period !== 'daily' && period !== 'weekly') || typeof missionId !== 'string') throw badRequest();
      const r = game.claimMission(req.playerId, period, missionId);
      return withProfile(req.playerId, { reward: r.reward });
    });

    api.get('/api/leaderboard', async (req) => {
      const tab = (req.query as { tab?: string }).tab === 'friends' ? 'friends' : 'top';
      if (env.seedDemo) seedDemo(game);
      return { leaderboard: game.leaderboard(game.players.load(req.playerId), tab) };
    });

    api.post('/api/leaderboard/claim', async (req) => {
      const r = game.claimWeekly(req.playerId);
      return withProfile(req.playerId, { reward: r.reward, rank: r.rank });
    });

    api.get('/api/event', async (req) => ({ event: game.eventView(game.players.load(req.playerId)) }));

    api.post('/api/event/claim', async (req) => {
      const { index } = (req.body ?? {}) as Body;
      if (!Number.isInteger(index)) throw badRequest();
      const r = game.claimEventMilestone(req.playerId, index as number);
      return withProfile(req.playerId, { reward: r.reward, event: game.eventView(r.player) });
    });

    api.post('/api/analytics', async (req) => ({ stored: game.track(req.playerId, ((req.body ?? {}) as Body).events) }));
  });

  // ── static client (production) ──
  if (fs.existsSync(path.join(env.clientDist, 'index.html'))) {
    app.register(fastifyStatic, { root: env.clientDist, wildcard: false, maxAge: '1h' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: { code: 'not_found', message: 'Не найдено', details: null } });
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    });
  }

  app.addHook('onClose', async () => db.close());
  return { app, game, db };
}
