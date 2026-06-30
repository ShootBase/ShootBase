/**
 * Paystack server-side helpers. All keys come from env vars — never hardcode.
 *
 *   PAYSTACK_SECRET_KEY   sk_test_... / sk_live_...
 *   PAYSTACK_PUBLIC_KEY   pk_test_... / pk_live_...   (optional; only needed
 *                                                      for client-side Inline)
 *
 * When PAYSTACK_SECRET_KEY is missing every call short-circuits with
 * `PAYSTACK_NOT_CONFIGURED` so the UI can show the "configuring" message
 * gracefully instead of crashing.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const PAYSTACK_BASE_URL = 'https://api.paystack.co';

export function paystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

export class PaystackNotConfiguredError extends Error {
  code = 'PAYSTACK_NOT_CONFIGURED' as const;
  constructor() {
    super('Paystack is currently being configured. Please try again later.');
  }
}

function secret(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new PaystackNotConfiguredError();
  return key;
}

type PaystackInitResponse = {
  status: boolean;
  message: string;
  data: { authorization_url: string; access_code: string; reference: string };
};

export type PaystackVerifyData = {
  id: number;
  reference: string;
  status: 'success' | 'failed' | 'abandoned' | string;
  amount: number; // kobo
  currency: string; // 'NGN'
  paid_at: string | null;
  customer: { email: string };
  metadata: Record<string, unknown> | string | null;
};

type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data: PaystackVerifyData;
};

async function paystackFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string } & T;
  if (!res.ok) {
    const msg = json?.message || `Paystack ${path} failed (${res.status})`;
    throw new Error(msg);
  }
  return json as T;
}

export async function initPaystackTransaction(opts: {
  email: string;
  amountKobo: number;
  reference?: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
  currency?: 'NGN';
}): Promise<PaystackInitResponse['data']> {
  const body = {
    email: opts.email,
    amount: opts.amountKobo,
    currency: opts.currency ?? 'NGN',
    callback_url: opts.callbackUrl,
    metadata: opts.metadata,
    ...(opts.reference ? { reference: opts.reference } : {}),
  };
  const res = await paystackFetch<PaystackInitResponse>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.status) throw new Error(res.message || 'Paystack init failed');
  return res.data;
}

export async function verifyPaystackTransaction(reference: string): Promise<PaystackVerifyData> {
  const safe = encodeURIComponent(reference);
  const res = await paystackFetch<PaystackVerifyResponse>(`/transaction/verify/${safe}`);
  if (!res.status) throw new Error(res.message || 'Paystack verify failed');
  return res.data;
}

/** Verifies the `x-paystack-signature` HMAC-SHA512 over the raw request body. */
export function verifyPaystackWebhookSignature(rawBody: string, signature: string | null): boolean {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !signature) return false;
  const expected = createHmac('sha512', key).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function paystackReference(prefix = 'sb'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

/** Dedupe key used in `credit_transactions.stripe_payment_id` for Paystack. */
export function paystackDedupeKey(reference: string): string {
  return `paystack:${reference}`;
}
