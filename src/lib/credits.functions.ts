import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from '@/lib/stripe.server';

type CheckoutResult = { clientSecret: string } | { error: string };

// Allow legacy + new lookup keys (back-compat with older Stripe price rows)
const ALLOWED_PRICES = new Set([
  'credits_starter',
  'credits_growth',
  'credits_professional',
  'credits_pro_pack',
  'credits_monthly_sub',
]);

const SUBSCRIPTION_PRICE_IDS = new Set(['credits_monthly_sub']);

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId: string },
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error('Invalid userId');
  const found = await stripe.customers.search({
    query: `metadata['userId']:'${options.userId}'`,
    limit: 1,
  });
  if (found.data.length) return found.data[0].id;
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    metadata: { userId: options.userId },
  });
  return created.id;
}

type PackageRow = {
  id: string;
  name: string;
  credits: number;
  price_pence: number;
  compare_at_pence?: number;
  featured?: boolean;
  description?: string;
};

type SubscriptionConfig = {
  price_id: string;
  name: string;
  credits: number;
  price_pence: number;
  interval: string;
};

export const createCreditCheckout = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { priceId: string; returnUrl: string; environment: StripeEnv }) => {
    if (!ALLOWED_PRICES.has(data.priceId)) throw new Error('Invalid priceId');
    if (data.environment !== 'sandbox' && data.environment !== 'live') throw new Error('Invalid environment');
    return data;
  })
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    try {
      const { supabase, userId, claims } = context;

      // Pro verification gate — block coin purchases until email + phone verified.
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
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (proErr) throw proErr;
      if (!pro) return { error: 'You must set up a professional profile before buying credits.' };

      const isSubscription = SUBSCRIPTION_PRICE_IDS.has(data.priceId);

      const { data: settings, error: setErr } = await supabase
        .from('credit_settings')
        .select('packages, subscription')
        .eq('id', 1)
        .single();
      if (setErr) throw setErr;

      let creditAmount = 0;
      let displayName = 'Credits';
      if (isSubscription) {
        const sub = settings.subscription as unknown as SubscriptionConfig;
        creditAmount = sub?.credits ?? 30;
        displayName = sub?.name ?? 'Monthly Credits';
      } else {
        const packages = (settings.packages as unknown as PackageRow[]) ?? [];
        const slug = data.priceId.replace(/^credits_/, '');
        const pkg = packages.find((p) => p.id === slug);
        if (!pkg) return { error: 'Package not found.' };
        creditAmount = pkg.credits;
        displayName = pkg.name;
      }

      const stripe = createStripeClient(data.environment);

      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) return { error: 'Price not found in Stripe' };
      const stripePrice = prices.data[0];

      const email = typeof claims.email === 'string' ? claims.email : undefined;
      const customerId = await resolveOrCreateCustomer(stripe, { email, userId });

      const metadata = {
        userId,
        professionalId: pro.id,
        priceId: data.priceId,
        credits: String(creditAmount),
        packageName: displayName,
      };

      const productId = typeof stripePrice.product === 'string' ? stripePrice.product : stripePrice.product.id;
      const product = await stripe.products.retrieve(productId);

      // VAT/tax automation disabled for now — display prices exactly as configured.
      // Re-enable by adding back `managed_payments: { enabled: true }` (or `automatic_tax: { enabled: true }`).
      const sessionParams = {
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: isSubscription ? 'subscription' : 'payment',
        ui_mode: 'embedded_page',
        return_url: data.returnUrl,
        customer: customerId,
        metadata,
        ...(isSubscription
          ? { subscription_data: { metadata } }
          : { payment_intent_data: { description: product.name, metadata } }),
      } as unknown as Parameters<typeof stripe.checkout.sessions.create>[0];
      const session = await stripe.checkout.sessions.create(sessionParams);

      // Returning an empty client_secret would silently break the embedded
      // Stripe component with no user-visible error. Fail loudly instead.
      if (!session.client_secret) {
        console.error('createCreditCheckout: Stripe returned no client_secret', { sessionId: session.id });
        return { error: 'Checkout session could not be initialised. Please try again.' };
      }
      return { clientSecret: session.client_secret };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const getMyCreditsOverview = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase.from('professionals').select('id').eq('user_id', userId).maybeSingle();
    if (!pro) return { hasProfile: false as const };

    const [{ data: credits }, { data: txs }, { data: settings }, { data: subs }] = await Promise.all([
      supabase
        .from('professional_credits')
        .select('credit_balance, auto_topup_enabled, auto_topup_last_price_id, auto_topup_in_progress, stripe_customer_id')
        .eq('professional_id', pro.id)
        .maybeSingle(),
      supabase
        .from('credit_transactions')
        .select('id, amount, transaction_type, description, created_at')
        .eq('professional_id', pro.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('credit_settings').select('packages, unlock_cost, subscription').eq('id', 1).single(),
      supabase
        .from('credit_subscriptions')
        .select('stripe_subscription_id, price_id, status, credits_per_period, current_period_end, cancel_at_period_end')
        .eq('professional_id', pro.id)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    const activeSub = (subs ?? []).find((s) => ['active', 'trialing', 'past_due'].includes(s.status));

    return {
      hasProfile: true as const,
      balance: (credits?.credit_balance as number | undefined) ?? 0,
      autoTopupEnabled: Boolean(credits?.auto_topup_enabled),
      autoTopupLastPriceId: (credits?.auto_topup_last_price_id as string | null) ?? null,
      autoTopupInProgress: Boolean(credits?.auto_topup_in_progress),
      hasSavedPaymentMethod: Boolean(credits?.stripe_customer_id),
      transactions: txs ?? [],
      packages: (settings?.packages as unknown as PackageRow[]) ?? [],
      subscriptionPlan: (settings?.subscription as unknown as SubscriptionConfig) ?? null,
      subscription: activeSub ?? null,
      unlockCost: settings?.unlock_cost ?? 8,
    };
  });

export const setAutoTopUp = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean(), priceId: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase.from('professionals').select('id').eq('user_id', userId).maybeSingle();
    if (!pro) throw new Error('Not a professional');

    const update: { auto_topup_enabled: boolean; auto_topup_last_price_id?: string } = {
      auto_topup_enabled: data.enabled,
    };
    if (data.enabled && data.priceId) {
      if (!ALLOWED_PRICES.has(data.priceId) || SUBSCRIPTION_PRICE_IDS.has(data.priceId)) {
        throw new Error('Invalid auto top-up package');
      }
      update.auto_topup_last_price_id = data.priceId;
    }

    // professional_credits has no INSERT/UPDATE policy for end users — writes
    // go through the service-role client, scoped to the verified caller's pro row.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: existing } = await supabaseAdmin
      .from('professional_credits')
      .select('professional_id')
      .eq('professional_id', pro.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin.from('professional_credits').update(update).eq('professional_id', pro.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from('professional_credits')
        .insert({ professional_id: pro.id, credit_balance: 0, ...update });
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

export const createBillingPortalSession = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ returnUrl: z.string().url(), environment: z.enum(['sandbox', 'live']) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ url: string } | { error: string }> => {
    try {
      const { supabase, userId } = context;
      const { data: pro } = await supabase.from('professionals').select('id').eq('user_id', userId).maybeSingle();
      if (!pro) return { error: 'No professional profile' };
      const { data: credits } = await supabase
        .from('professional_credits')
        .select('stripe_customer_id')
        .eq('professional_id', pro.id)
        .maybeSingle();
      const customerId = credits?.stripe_customer_id as string | null | undefined;
      if (!customerId) return { error: 'No saved payment customer yet. Make a purchase first.' };
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: data.returnUrl,
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const triggerAutoTopUpIfLow = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ environment: z.enum(['sandbox', 'live']) }).parse(d))
  .handler(async ({ data, context }): Promise<{ triggered: boolean; reason?: string }> => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase.from('professionals').select('id').eq('user_id', userId).maybeSingle();
    if (!pro) return { triggered: false, reason: 'no_pro' };

    const { data: credits } = await supabase
      .from('professional_credits')
      .select('credit_balance, auto_topup_enabled, auto_topup_last_price_id, auto_topup_in_progress, stripe_customer_id')
      .eq('professional_id', pro.id)
      .maybeSingle();

    if (!credits?.auto_topup_enabled) return { triggered: false, reason: 'disabled' };
    // Threshold = configurable per-lead unlock cost so a pro with exactly the floor still tops up
    // before a higher-cost premium lead pushes them into INSUFFICIENT_CREDITS.
    const { data: settings } = await supabase.from('credit_settings').select('unlock_cost').eq('id', 1).single();
    const threshold = (settings?.unlock_cost as number | undefined) ?? 8;
    if ((credits.credit_balance as number) > threshold) return { triggered: false, reason: 'sufficient' };
    if (credits.auto_topup_in_progress) return { triggered: false, reason: 'in_progress' };
    if (!credits.stripe_customer_id) return { triggered: false, reason: 'no_customer' };
    const priceId = credits.auto_topup_last_price_id as string | null;
    if (!priceId || SUBSCRIPTION_PRICE_IDS.has(priceId)) return { triggered: false, reason: 'no_package' };

    // Service-role writes (RLS denies direct UPDATE/INSERT on professional_credits + notifications)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // Claim the in-progress lock
    const { error: lockErr } = await supabaseAdmin
      .from('professional_credits')
      .update({ auto_topup_in_progress: true, auto_topup_in_progress_at: new Date().toISOString() })
      .eq('professional_id', pro.id)
      .eq('auto_topup_in_progress', false);
    if (lockErr) return { triggered: false, reason: 'lock_failed' };

    try {
      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({ lookup_keys: [priceId] });
      if (!prices.data.length) throw new Error('Price not found');
      const stripePrice = prices.data[0];
      if (stripePrice.unit_amount == null) throw new Error('Price missing amount');

      const { data: settings2 } = await supabaseAdmin.from('credit_settings').select('packages').eq('id', 1).single();
      const packages = (settings2?.packages as unknown as PackageRow[]) ?? [];
      const pkg = packages.find((p) => p.id === priceId.replace(/^credits_/, ''));
      const creditAmount = pkg?.credits ?? 0;
      const pkgName = pkg?.name ?? 'Credits';

      const customerId = credits.stripe_customer_id as string;

      // Prefer the customer's default invoice payment method; otherwise pick
      // any saved card. (Previously restricted to `type:'card'` which silently
      // failed for users with only a BACS/SEPA debit on file.)
      const pms = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
      const paymentMethodId = pms.data[0]?.id;
      if (!paymentMethodId) throw new Error('No saved card on file. Please buy credits once to save a card before enabling auto top-up.');

      await stripe.paymentIntents.create({
        amount: stripePrice.unit_amount,
        currency: stripePrice.currency,
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `Auto top-up: ${pkgName}`,
        metadata: {
          userId,
          professionalId: pro.id,
          priceId,
          credits: String(creditAmount),
          packageName: pkgName,
          autoTopup: 'true',
        },
      });
      return { triggered: true };
    } catch (error) {
      // Release the lock and notify (admin: RLS denies these writes for end users)
      await supabaseAdmin
        .from('professional_credits')
        .update({ auto_topup_in_progress: false })
        .eq('professional_id', pro.id);
      await supabaseAdmin.from('notifications').insert({
        user_id: userId,
        title: 'Auto top-up failed',
        body: getStripeErrorMessage(error),
        url: '/pro/credits',
      });
      return { triggered: false, reason: 'error' };
    }
  });
