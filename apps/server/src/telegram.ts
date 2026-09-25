import type { ProductDef } from '@void-rush/shared';
import type { ServerEnv } from './env.ts';
import type { Game } from './game.ts';

async function botApi<T>(env: ServerEnv, method: string, body: object): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${env.botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
  return json.result as T;
}

/** Creates a Telegram Stars (XTR) invoice link for a pending order. */
export function createStarsInvoice(env: ServerEnv, orderId: string, product: ProductDef): Promise<string> {
  if (product.price.type !== 'xtr') throw new Error('Only XTR products use Telegram invoices');
  return botApi<string>(env, 'createInvoiceLink', {
    title: `VOID RUSH — ${product.title}`.slice(0, 32),
    description: (product.subtitle ?? 'Покупка в VOID RUSH').slice(0, 255),
    payload: orderId,
    currency: 'XTR',
    prices: [{ label: product.title.slice(0, 32), amount: product.price.amount }],
  });
}

interface Update {
  pre_checkout_query?: { id: string; currency: string; total_amount: number; invoice_payload: string };
  message?: {
    chat: { id: number };
    text?: string;
    successful_payment?: { currency: string; total_amount: number; invoice_payload: string; telegram_payment_charge_id: string };
  };
}

/** Handles Bot API webhook updates: pre-checkout validation, payment settlement and /start. */
export async function handleUpdate(env: ServerEnv, game: Game, update: Update): Promise<void> {
  const pcq = update.pre_checkout_query;
  if (pcq) {
    const ok = game.canCheckout(pcq.invoice_payload, pcq.total_amount, pcq.currency);
    await botApi(env, 'answerPreCheckoutQuery', ok ? { pre_checkout_query_id: pcq.id, ok: true } : { pre_checkout_query_id: pcq.id, ok: false, error_message: 'Заказ устарел. Откройте магазин заново.' });
    return;
  }
  const pay = update.message?.successful_payment;
  if (pay) {
    game.confirmOrder(pay.invoice_payload, pay.telegram_payment_charge_id, pay.total_amount);
    return;
  }
  const text = update.message?.text ?? '';
  if (text.startsWith('/start') && env.publicUrl) {
    await botApi(env, 'sendMessage', {
      chat_id: update.message!.chat.id,
      text: 'VOID RUSH — 60 секунд. Один забег. Большой лут.\nЖми кнопку и беги в пустоту!',
      reply_markup: { inline_keyboard: [[{ text: 'Играть', web_app: { url: env.publicUrl } }]] },
    });
  }
}
