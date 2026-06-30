/**
 * Shared idempotent credit-grant for Paystack purchases. Called by both:
 *   - verifyPaystackPayment server function (on success-page return), and
 *   - /api/public/payments/paystack/webhook (provider push).
 *
 * Idempotency is enforced by `credit_transactions.stripe_payment_id` UNIQUE
 * constraint, using the prefix `paystack:<reference>`.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { paystackDedupeKey, type PaystackVerifyData } from '@/lib/paystack.server';

let _admin: ReturnType<typeof createClient<Database>> | null = null;
function admin() {
  if (!_admin) {
    _admin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _admin;
}

type Meta = {
  userId?: string;
  professionalId?: string;
  priceId?: string;
  credits?: string | number;
  packageName?: string;
};

function parseMetadata(meta: PaystackVerifyData['metadata']): Meta {
  if (!meta) return {};
  if (typeof meta === 'string') {
    try { return JSON.parse(meta) as Meta; } catch { return {}; }
  }
  return meta as Meta;
}

export async function grantPaystackCredits(verify: PaystackVerifyData): Promise<
  | { ok: true; alreadyCredited?: boolean; credits: number }
  | { ok: false; reason: string }
> {
  if (verify.status !== 'success') {
    return { ok: false, reason: `transaction_status:${verify.status}` };
  }
  const meta = parseMetadata(verify.metadata);
  const professionalId = meta.professionalId;
  const userId = meta.userId;
  const credits = Number(meta.credits ?? 0);
  const packageName = meta.packageName ?? 'Shootbase Credits';

  if (!professionalId || !credits) {
    console.error('paystack grant: missing metadata', { reference: verify.reference, meta });
    return { ok: false, reason: 'missing_metadata' };
  }

  const sb = admin();
  const dedupe = paystackDedupeKey(verify.reference);

  // Insert tx — UNIQUE on stripe_payment_id dedupes webhook+callback races.
  const { error: txErr } = await sb.from('credit_transactions').insert({
    professional_id: professionalId,
    amount: credits,
    transaction_type: 'credit_purchase',
    description: `Paystack — ${packageName} (${credits} coins)`,
    stripe_payment_id: dedupe,
  });

  if (txErr) {
    if ((txErr as { code?: string }).code === '23505') {
      return { ok: true, alreadyCredited: true, credits };
    }
    throw txErr;
  }

  const { data: existing } = await sb
    .from('professional_credits')
    .select('credit_balance')
    .eq('professional_id', professionalId)
    .maybeSingle();

  if (existing) {
    await sb
      .from('professional_credits')
      .update({ credit_balance: (existing.credit_balance as number) + credits })
      .eq('professional_id', professionalId);
  } else {
    await sb
      .from('professional_credits')
      .insert({ professional_id: professionalId, credit_balance: credits });
  }

  if (userId) {
    await sb.from('notifications').insert({
      user_id: userId,
      title: `${credits} coins added to your account`,
      body: `Paystack payment received — ${packageName}.`,
      url: '/pro/credits',
    });

    // Branded receipt (best-effort; never blocks crediting).
    try {
      const { sendCreditReceipt } = await import('@/lib/credit-receipt.server');
      await sendCreditReceipt({
        userId,
        credits,
        packageName,
        amountPence: verify.amount, // kobo → minor units of NGN
        stripePaymentId: dedupe,
      });
    } catch (e) {
      console.error('paystack grant: receipt failed', e);
    }
  }

  return { ok: true, credits };
}
