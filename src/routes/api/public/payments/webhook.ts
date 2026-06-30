import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { type StripeEnv, verifyWebhook } from '@/lib/stripe.server';

let _supabase: ReturnType<typeof createClient<Database>> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

async function grantCredits(opts: {
  professionalId: string;
  credits: number;
  txType: 'credit_purchase' | 'subscription_grant' | 'auto_topup';
  description: string;
  stripePaymentId: string;
  userId?: string;
  customerId?: string;
  priceId?: string;
  rememberPriceId?: boolean;
  amountPence?: number;
  packageName?: string;
}) {
  const supabase = getSupabase();

  const { error: insertErr } = await supabase.from('credit_transactions').insert({
    professional_id: opts.professionalId,
    amount: opts.credits,
    transaction_type: opts.txType,
    description: opts.description,
    stripe_payment_id: opts.stripePaymentId,
  });

  if (insertErr) {
    if ((insertErr as { code?: string }).code === '23505') {
      console.log('webhook: duplicate event, already credited', opts.stripePaymentId);
      return;
    }
    throw insertErr;
  }

  const { data: existing } = await supabase
    .from('professional_credits')
    .select('credit_balance')
    .eq('professional_id', opts.professionalId)
    .maybeSingle();

  const patch: Record<string, unknown> = {};
  if (opts.customerId) patch.stripe_customer_id = opts.customerId;
  if (opts.rememberPriceId && opts.priceId) patch.auto_topup_last_price_id = opts.priceId;

  if (existing) {
    await supabase
      .from('professional_credits')
      .update({
        credit_balance: (existing.credit_balance as number) + opts.credits,
        ...(opts.txType === 'auto_topup' ? { auto_topup_in_progress: false } : {}),
        ...patch,
      })
      .eq('professional_id', opts.professionalId);
  } else {
    await supabase
      .from('professional_credits')
      .insert({ professional_id: opts.professionalId, credit_balance: opts.credits, ...patch });
  }

  if (opts.userId) {
    await supabase.from('notifications').insert({
      user_id: opts.userId,
      title: `${opts.credits} credits added to your account`,
      body: opts.description,
      url: '/pro/credits',
    });

    // Branded Shootbase receipt (PDF + email) — best-effort, never blocks the webhook.
    if (opts.amountPence && opts.amountPence > 0) {
      try {
        const { sendCreditReceipt } = await import('@/lib/credit-receipt.server');
        await sendCreditReceipt({
          userId: opts.userId,
          credits: opts.credits,
          packageName: opts.packageName ?? 'Shootbase Credits',
          amountPence: opts.amountPence,
          stripePaymentId: opts.stripePaymentId,
        });
      } catch (e) {
        console.error('webhook: credit receipt failed', e);
      }
    }
  }
}

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  if (session.payment_status !== 'paid' && session.mode !== 'subscription') return;
  const meta = session.metadata || {};
  const professionalId = meta.professionalId as string | undefined;
  const userId = meta.userId as string | undefined;
  const priceId = meta.priceId as string | undefined;
  const credits = Number(meta.credits);
  const packageName = (meta.packageName as string | undefined) ?? 'credits';
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

  if (!professionalId) {
    console.log('webhook: missing professionalId metadata', { sessionId: session.id });
    return;
  }

  if (session.mode === 'payment') {
    if (credits > 0) {
      await grantCredits({
        professionalId,
        credits,
        txType: 'credit_purchase',
        description: `Purchased ${packageName} (${credits} credits)`,
        stripePaymentId: session.id,
        userId,
        customerId,
        priceId,
        rememberPriceId: true,
        amountPence: typeof session.amount_total === 'number' ? session.amount_total : undefined,
        packageName,
      });
    } else {
      // Paid but metadata says zero credits — surface loudly so finance can
      // reconcile. (User paid, got nothing; would otherwise be silent.)
      console.error('webhook: paid session has credits<=0 in metadata', {
        sessionId: session.id, professionalId, userId, priceId, meta,
      });
      if (userId) {
        try {
          await getSupabase().from('notifications').insert({
            user_id: userId,
            title: 'Payment received — credits pending',
            body: 'We received your payment but could not auto-credit your account. Our team has been notified and will resolve this shortly.',
            url: '/pro/credits',
          });
        } catch (e) { console.error('webhook: failed to notify user of credits=0', e); }
      }
    }
  } else if (session.mode === 'subscription') {
    // Persist customer id so portal works. Subscription row + first grant are
    // written by customer.subscription.created / invoice.paid handlers below.
    if (customerId) {
      const supabase = getSupabase();
      const { data: existing } = await supabase
        .from('professional_credits')
        .select('professional_id')
        .eq('professional_id', professionalId)
        .maybeSingle();
      if (existing) {
        await supabase
          .from('professional_credits')
          .update({ stripe_customer_id: customerId })
          .eq('professional_id', professionalId);
      } else {
        await supabase
          .from('professional_credits')
          .insert({ professional_id: professionalId, credit_balance: 0, stripe_customer_id: customerId });
      }
    }
  }
}

async function upsertSubscription(subscription: any, env: StripeEnv) {
  const meta = subscription.metadata || {};
  const professionalId = meta.professionalId as string | undefined;
  if (!professionalId) {
    console.log('webhook: subscription missing professionalId metadata', subscription.id);
    return;
  }
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const credits = Number(meta.credits) || 30;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;

  await getSupabase()
    .from('credit_subscriptions')
    .upsert(
      {
        professional_id: professionalId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        price_id: priceId,
        status: subscription.status,
        credits_per_period: credits,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end || false,
        environment: env,
      },
      { onConflict: 'stripe_subscription_id' },
    );
}

async function handleInvoicePaid(invoice: any, env: StripeEnv) {
  // Only count subscription renewals (and the first invoice). One-off PaymentIntents
  // are credited via handleCheckoutCompleted / handlePaymentIntentSucceeded.
  const subId = invoice.subscription || invoice.parent?.subscription_details?.subscription;
  if (!subId) return;

  const supabase = getSupabase();
  const { data: sub } = await supabase
    .from('credit_subscriptions')
    .select('professional_id, credits_per_period, price_id')
    .eq('stripe_subscription_id', subId)
    .maybeSingle();
  if (!sub) {
    console.log('webhook: invoice.paid for unknown subscription', subId);
    return;
  }
  const { data: pro } = await supabase
    .from('professionals')
    .select('user_id')
    .eq('id', sub.professional_id as string)
    .maybeSingle();

  await grantCredits({
    professionalId: sub.professional_id as string,
    credits: (sub.credits_per_period as number) ?? 30,
    txType: 'subscription_grant',
    description: `Monthly subscription credits (${sub.credits_per_period} credits)`,
    stripePaymentId: invoice.id,
    userId: (pro?.user_id as string | undefined) ?? undefined,
    amountPence:
      typeof invoice.amount_paid === 'number'
        ? invoice.amount_paid
        : typeof invoice.amount_due === 'number'
          ? invoice.amount_due
          : undefined,
    packageName: 'Shootbase Monthly Credits',
  });
}

async function handlePaymentIntentSucceeded(pi: any, _env: StripeEnv) {
  const meta = pi.metadata || {};
  if (meta.autoTopup !== 'true') return;
  const professionalId = meta.professionalId as string | undefined;
  const credits = Number(meta.credits);
  const priceId = meta.priceId as string | undefined;
  const packageName = (meta.packageName as string | undefined) ?? 'credits';
  const userId = meta.userId as string | undefined;
  const customerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id;
  if (!professionalId || !credits) return;

  await grantCredits({
    professionalId,
    credits,
    txType: 'auto_topup',
    description: `Auto top-up: ${packageName} (${credits} credits)`,
    stripePaymentId: pi.id,
    userId,
    customerId,
    priceId,
    rememberPriceId: true,
    amountPence: typeof pi.amount === 'number' ? pi.amount : undefined,
    packageName,
  });
}

async function handlePaymentIntentFailed(pi: any, _env: StripeEnv) {
  const meta = pi.metadata || {};
  if (meta.autoTopup !== 'true') return;
  const professionalId = meta.professionalId as string | undefined;
  const userId = meta.userId as string | undefined;
  if (!professionalId) return;
  const supabase = getSupabase();
  await supabase
    .from('professional_credits')
    .update({ auto_topup_in_progress: false })
    .eq('professional_id', professionalId);
  if (userId) {
    await supabase.from('notifications').insert({
      user_id: userId,
      title: 'Auto top-up failed',
      body: 'Your saved payment method was declined. Please update billing in your credits page.',
      url: '/pro/credits',
    });
  }
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  await getSupabase()
    .from('credit_subscriptions')
    .update({ status: 'canceled' })
    .eq('stripe_subscription_id', subscription.id)
    .eq('environment', env);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object, env);
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await upsertSubscription(event.data.object, env);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      await handleInvoicePaid(event.data.object, env);
      break;
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object, env);
      break;
    case 'payment_intent.payment_failed':
      await handlePaymentIntentFailed(event.data.object, env);
      break;
    default:
      console.log('Unhandled event:', event.type);
  }
}

export const Route = createFileRoute('/api/public/payments/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get('env');
        if (rawEnv !== 'sandbox' && rawEnv !== 'live') {
          console.error('Webhook received with invalid env:', rawEnv);
          return Response.json({ received: true, ignored: 'invalid env' });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error('Webhook error:', e);
          return new Response('Webhook error', { status: 400 });
        }
      },
    },
  },
});
