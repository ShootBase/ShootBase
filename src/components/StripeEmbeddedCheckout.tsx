import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { getStripe, getStripeEnvironment } from '@/lib/stripe';
import { createCreditCheckout } from '@/lib/credits.functions';

interface Props {
  priceId: string;
  returnUrl: string;
}

export function StripeEmbeddedCreditCheckout({ priceId, returnUrl }: Props) {
  const fetchClientSecret = async (): Promise<string> => {
    const result = await createCreditCheckout({
      data: { priceId, returnUrl, environment: getStripeEnvironment() },
    });
    if ('error' in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error('Stripe did not return a client secret');
    return result.clientSecret;
  };

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
