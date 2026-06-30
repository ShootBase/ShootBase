import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { NG_PACKAGES, NG_SUB_PLAN } from '@/lib/country-pricing';

/** Public server fn — UI uses this to know whether to show the Paystack button
 *  as enabled or as the "Paystack is currently being configured" notice. */
export const getPaystackStatus = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ enabled: boolean }> => ({ enabled: Boolean(process.env.PAYSTACK_SECRET_KEY) }),
);

const ALLOWED_NG_PRICES = new Set<string>([
  ...NG_PACKAGES.map((p) => `ng_${p.id.replace(/^ng_/, '')}`),
  NG_SUB_PLAN.price_id,
]);

function resolveNgPriceMeta(priceId: string):
  | { credits: number; amountKobo: number; name: string; isSubscription: boolean }
  | null {
  if (priceId === NG_SUB_PLAN.price_id) {
    return {
      credits: NG_SUB_PLAN.credits,
      amountKobo: NG_SUB_PLAN.price_pence,
      name: NG_SUB_PLAN.name,
      isSubscription: true,
    };
  }
  const slug = priceId.replace(/^ng_/, '');
  const pkg = NG_PACKAGES.find((p) => p.id === `ng_${slug}` || p.id === slug);
  if (!pkg) return null;
  return { credits: pkg.credits, amountKobo: pkg.price_pence, name: pkg.name, isSubscription: false };
}

export const initPaystackCheckout = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        priceId: z.string().min(1),
        callbackUrl: z.string().url(),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ authorization_url: string; reference: string } | { error: string; code?: string }> => {
      const { supabase, userId, claims } = context;

      // Gate by Paystack config — graceful fallback so the UI can render the
      // "configuring" message without throwing.
      const { paystackConfigured, initPaystackTransaction, paystackReference } = await import(
        '@/lib/paystack.server'
      );
      if (!paystackConfigured()) {
        return {
          error: 'Paystack is currently being configured. Please try again later.',
          code: 'PAYSTACK_NOT_CONFIGURED',
        };
      }

      if (!ALLOWED_NG_PRICES.has(data.priceId)) {
        return { error: 'Invalid Nigeria package.' };
      }

      // Pro verification gate (mirrors Stripe path)
      const { requireProVerified } = await import('@/lib/pro-verification.functions');
      try {
        await requireProVerified(supabase as never, userId, claims as never);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg.startsWith('PRO_VERIFICATION_REQUIRED')) {
          return { error: 'Verify your email and mobile number before buying coins.' };
        }
        throw e;
      }

      const { data: pro, error: proErr } = await supabase
        .from('professionals')
        .select('id, country')
        .eq('user_id', userId)
        .maybeSingle();
      if (proErr) throw proErr;
      if (!pro) return { error: 'You must set up a professional profile before buying credits.' };

      // Country isolation — Paystack is NG-only.
      const proCountry = (pro.country as string | null) ?? 'United Kingdom';
      if (proCountry !== 'Nigeria') {
        return { error: 'Paystack is only available for Nigerian accounts.' };
      }

      const meta = resolveNgPriceMeta(data.priceId);
      if (!meta) return { error: 'Package not found.' };
      if (meta.isSubscription) {
        // Paystack plan-based subscriptions need a pre-configured plan code;
        // not in scope for v1. UI hides Paystack for the sub plan.
        return { error: 'Subscriptions are not yet available via Paystack. Please use bank transfer.' };
      }

      const email = (typeof claims.email === 'string' ? claims.email : '') || '';
      if (!email) return { error: 'No email on file.' };

      const reference = paystackReference('sb');
      try {
        const init = await initPaystackTransaction({
          email,
          amountKobo: meta.amountKobo,
          reference,
          callbackUrl: data.callbackUrl,
          metadata: {
            userId,
            professionalId: pro.id,
            priceId: data.priceId,
            credits: meta.credits,
            packageName: meta.name,
          },
        });
        return { authorization_url: init.authorization_url, reference: init.reference };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Paystack initialisation failed';
        return { error: message };
      }
    },
  );

export const verifyPaystackPayment = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reference: z.string().min(3).max(120) }).parse(d))
  .handler(
    async ({ data }): Promise<{ ok: true; credits: number; alreadyCredited?: boolean } | { ok: false; error: string }> => {
      const { paystackConfigured, verifyPaystackTransaction } = await import('@/lib/paystack.server');
      if (!paystackConfigured()) return { ok: false, error: 'Paystack is currently being configured.' };

      try {
        const verify = await verifyPaystackTransaction(data.reference);
        if (verify.status !== 'success') {
          return { ok: false, error: `Payment ${verify.status}.` };
        }
        const { grantPaystackCredits } = await import('@/lib/paystack-grant.server');
        const result = await grantPaystackCredits(verify);
        if (!result.ok) return { ok: false, error: result.reason };
        return { ok: true, credits: result.credits, alreadyCredited: result.alreadyCredited };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Verification failed';
        return { ok: false, error: message };
      }
    },
  );
