import { createFileRoute } from '@tanstack/react-router';
import {
  paystackConfigured,
  verifyPaystackWebhookSignature,
  verifyPaystackTransaction,
  type PaystackVerifyData,
} from '@/lib/paystack.server';
import { grantPaystackCredits } from '@/lib/paystack-grant.server';

/**
 * Paystack webhook endpoint.
 *
 * Configure in Paystack dashboard → Settings → API Keys & Webhooks:
 *   https://<your-host>/api/public/payments/paystack/webhook
 *
 * Paystack signs the raw body with HMAC-SHA512 using the SECRET key in the
 * `x-paystack-signature` header. We MUST read the raw body before parsing.
 */
export const Route = createFileRoute('/api/public/payments/paystack/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!paystackConfigured()) {
          // 200 so Paystack stops retrying while we're still configuring.
          return Response.json({ received: true, ignored: 'paystack_not_configured' });
        }
        const raw = await request.text();
        const signature = request.headers.get('x-paystack-signature');
        if (!verifyPaystackWebhookSignature(raw, signature)) {
          return new Response('Invalid signature', { status: 401 });
        }

        let payload: { event: string; data: PaystackVerifyData };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response('Bad JSON', { status: 400 });
        }

        if (payload.event !== 'charge.success') {
          return Response.json({ received: true, ignored: payload.event });
        }

        try {
          // Re-verify against Paystack to defend against forged events.
          const verified = await verifyPaystackTransaction(payload.data.reference);
          await grantPaystackCredits(verified);
          return Response.json({ received: true });
        } catch (e) {
          console.error('paystack webhook error', e);
          // 500 → Paystack retries.
          return new Response('Webhook handler error', { status: 500 });
        }
      },
    },
  },
});
