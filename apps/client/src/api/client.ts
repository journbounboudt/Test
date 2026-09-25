import { CLIENT_VERSION, type RemoteConfig } from '@void-rush/shared';
import type { ApiErrorBody, ConfigResponse } from './types';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown> | null;

  constructor(code: string, status: number, message: string, details: Record<string, unknown> | null = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }

  get isNetwork() {
    return this.code === 'network';
  }
}

let token: string | null = null;

export function setToken(t: string | null) {
  token = t;
}

async function request<T>(method: 'GET' | 'POST', url: string, body?: unknown, opts: { retries?: number; timeoutMs?: number } = {}): Promise<T> {
  const retries = opts.retries ?? (method === 'GET' ? 2 : 0);
  let lastErr: ApiError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          'x-client-version': CLIENT_VERSION,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        const e = (json as ApiErrorBody | null)?.error;
        throw new ApiError(e?.code ?? 'server_error', res.status, e?.message ?? 'Сервер недоступен. Попробуйте ещё раз.', e?.details ?? null);
      }
      return json as T;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status < 500 || attempt === retries) throw err;
        lastErr = err;
      } else {
        lastErr = new ApiError('network', 0, 'Нет соединения с сервером');
        if (attempt === retries) throw lastErr;
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr ?? new ApiError('network', 0, 'Нет соединения с сервером');
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown = {}, opts?: { retries?: number; timeoutMs?: number }) => request<T>('POST', url, body, opts),
  config: () => request<ConfigResponse>('GET', '/api/config', undefined, { retries: 3 }),
};

export type { RemoteConfig };
