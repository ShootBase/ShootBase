import { ProShell } from "@/components/site/ProShell";
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  getMyCreditsOverview,
  setAutoTopUp,
  createBillingPortalSession,
} from '@/lib/credits.functions';
import { getPaystackStatus, initPaystackCheckout } from '@/lib/paystack.functions';
import { StripeEmbeddedCreditCheckout } from '@/components/StripeEmbeddedCheckout';
import { PaymentTestModeBanner } from '@/components/PaymentTestModeBanner';
import { formatPence } from '@/lib/format';
import { getStripeEnvironment } from '@/lib/stripe';
import { Switch } from '@/components/ui/switch';
import { CoinIcon } from '@/components/ui/coin-icon';
import { CoinTermsCheckbox, RefundNotice } from '@/components/pro/CoinTermsGate';
import {
  detectCountryCode,
  PREVIEW_COUNTRY_KEY,
  type CountryCode,
} from '@/lib/country-detect';
import {
  getCountryPackages,
  getCountrySubPlan,
  NG_PACKAGES,
  NG_SUB_PLAN,
} from '@/lib/country-pricing';
import { RegisterTransferModal } from '@/components/pro/RegisterTransferModal';

export const Route = createFileRoute('/_authenticated/pro/credits')({
  head: () => ({ meta: [{ title: 'Coins — Shootbase' }, { name: 'robots', content: 'noindex' }] }),
  component: CreditsPage,
});


type Pkg = {
  id: string;
  name: string;
  credits: number;
  price_pence: number;
  compare_at_pence?: number;
  featured?: boolean;
  description?: string;
};
type Tx = { id: string; amount: number; transaction_type: string; description: string | null; created_at: string };
type SubPlan = { price_id: string; name: string; credits: number; price_pence: number; interval: string };
type ActiveSub = {
  stripe_subscription_id: string;
  price_id: string;
  status: string;
  credits_per_period: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
} | null;

type State = {
  loading: boolean;
  hasProfile: boolean;
  balance: number;
  autoTopupEnabled: boolean;
  autoTopupLastPriceId: string | null;
  autoTopupInProgress: boolean;
  hasSavedPaymentMethod: boolean;
  transactions: Tx[];
  packages: Pkg[];
  subscriptionPlan: SubPlan | null;
  subscription: ActiveSub;
  unlockCost: number;
};

function CreditsPage() {
  const [state, setState] = useState<State>({
    loading: true,
    hasProfile: false,
    balance: 0,
    autoTopupEnabled: false,
    autoTopupLastPriceId: null,
    autoTopupInProgress: false,
    hasSavedPaymentMethod: false,
    transactions: [],
    packages: [],
    subscriptionPlan: null,
    subscription: null,
    unlockCost: 8,
  });
  const [openPriceId, setOpenPriceId] = useState<string | null>(null);
  const [confirmAutoTopUp, setConfirmAutoTopUp] = useState<{ priceId: string } | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [countryCode, setCountryCode] = useState<CountryCode>(() =>
    typeof window === 'undefined' ? 'GB' : detectCountryCode(),
  );
  const [paymentMethodFor, setPaymentMethodFor] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [paystackEnabled, setPaystackEnabled] = useState(false);
  const [paystackLoading, setPaystackLoading] = useState(false);
  const isNG = countryCode === 'NG';

  useEffect(() => {
    if (!isNG) return;
    void getPaystackStatus().then((s) => setPaystackEnabled(Boolean(s?.enabled))).catch(() => {});
  }, [isNG]);

  async function startPaystackCheckout(priceId: string) {
    if (!paystackEnabled) {
      toast.info('Paystack is currently being configured. Please try again later.');
      return;
    }
    setPaystackLoading(true);
    try {
      const callbackUrl = `${window.location.origin}/pro/credits/success`;
      const res = await initPaystackCheckout({ data: { priceId, callbackUrl } });
      if ('error' in res) {
        toast.error(res.error);
        return;
      }
      window.location.href = res.authorization_url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start Paystack checkout.');
    } finally {
      setPaystackLoading(false);
    }
  }

  useEffect(() => {
    function sync() { setCountryCode(detectCountryCode()); }
    sync();
    function onStorage(e: StorageEvent) { if (e.key === PREVIEW_COUNTRY_KEY) sync(); }
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', sync);
    };
  }, []);

  function attemptBuy(priceId: string) {
    if (!agreedToTerms) {
      setTermsError(true);
      toast.error('Please agree to the Terms and Conditions before continuing.');
      return;
    }
    setTermsError(false);
    if (isNG) {
      setPaymentMethodFor(priceId);
    } else {
      setOpenPriceId(priceId);
    }
  }


  const load = () => {
    void getMyCreditsOverview().then((res) => {
      if (!res.hasProfile) {
        setState((s) => ({ ...s, loading: false, hasProfile: false }));
        return;
      }
      setState({
        loading: false,
        hasProfile: true,
        balance: res.balance,
        autoTopupEnabled: res.autoTopupEnabled,
        autoTopupLastPriceId: res.autoTopupLastPriceId,
        autoTopupInProgress: res.autoTopupInProgress,
        hasSavedPaymentMethod: res.hasSavedPaymentMethod,
        transactions: res.transactions as Tx[],
        packages: res.packages,
        subscriptionPlan: res.subscriptionPlan,
        subscription: res.subscription as ActiveSub,
        unlockCost: res.unlockCost,
      });
    });
  };

  useEffect(() => { load(); }, []);

  const returnUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/pro/credits/success?session_id={CHECKOUT_SESSION_ID}`
    : '';

  async function toggleAutoTopUp(next: boolean) {
    if (next) {
      const fallbackPack = state.packages.find((p) => p.featured) ?? state.packages[0];
      const priceId = state.autoTopupLastPriceId ?? (fallbackPack ? `credits_${fallbackPack.id}` : null);
      if (!priceId) {
        toast.error('Buy a coin pack first so we know what to top up.');
        return;
      }
      if (!state.hasSavedPaymentMethod) {
        toast.error('Make a purchase first so we have a saved payment method.');
        return;
      }
      setConfirmAutoTopUp({ priceId });
    } else {
      const res = await setAutoTopUp({ data: { enabled: false } });
      if ('ok' in res) {
        toast.success('Auto top-up disabled');
        load();
      }
    }
  }

  async function confirmEnableAutoTopUp() {
    if (!confirmAutoTopUp) return;
    try {
      await setAutoTopUp({ data: { enabled: true, priceId: confirmAutoTopUp.priceId } });
      toast.success('Auto top-up enabled');
      setConfirmAutoTopUp(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to enable auto top-up');
    }
  }

  async function openPortal() {
    const env = getStripeEnvironment();
    const res = await createBillingPortalSession({
      data: { returnUrl: window.location.href, environment: env },
    });
    if ('error' in res) {
      toast.error(res.error);
      return;
    }
    window.open(res.url, '_blank');
  }

  if (!state.loading && !state.hasProfile) {
    return (
      <ProShell>
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h1 className="font-display text-3xl mb-4">Set up your profile first</h1>
          <p className="text-sm text-ink/70 mb-6">You need a professional profile before you can buy coins.</p>
          <Link to="/pro/onboarding" className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest inline-block">Build profile</Link>
        </div>
      </ProShell>
    );
  }

  const effectivePackages = useMemo(
    () => getCountryPackages(countryCode, state.packages as unknown as Pkg[]),
    [countryCode, state.packages],
  ) as Pkg[];
  const effectiveSubPlan = useMemo(
    () => getCountrySubPlan(countryCode, state.subscriptionPlan),
    [countryCode, state.subscriptionPlan],
  ) as SubPlan | null;
  const featured = effectivePackages.find((p) => p.featured) ?? effectivePackages[1] ?? effectivePackages[0];
  const otherPacks = effectivePackages.filter((p) => p.id !== featured?.id);
  const sub = state.subscription;
  const subPlan = effectiveSubPlan;
  const coinWord = (n: number) => (n === 1 ? 'coin' : 'coins');
  const fmt = (p: number) => formatPence(p, countryCode);

  return (
    <ProShell>
      <PaymentTestModeBanner />
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex justify-between items-end mb-10 flex-wrap gap-4">
          <div>
            <h1 className="font-display text-4xl">Coins</h1>
            <p className="text-sm text-ink/60">Buy coins to unlock customer contact details on new projects.</p>
          </div>
          <div className="relative border-2 border-gold/70 bg-gradient-to-br from-[#FFF7E0] via-[#FBE7B0] to-[#F1CE74] px-7 py-5 rounded-xl shadow-md text-right min-w-[220px]">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#7A5A12] mb-2">Your Balance</p>
            <div className="flex items-center justify-end gap-3">
              <CoinIcon size={44} className="drop-shadow-sm" />
              <p className="font-display text-5xl leading-none text-[#3A2A08]">{state.balance}</p>
            </div>
            <p className="text-[11px] text-[#7A5A12] mt-2 font-medium">
              {state.balance === 1 ? 'Coin' : 'Coins'} · {state.unlockCost} {coinWord(state.unlockCost)} per unlock
            </p>
          </div>
        </div>


        <p className="text-xs text-ink/60 mb-4 border-l-2 border-gold pl-3">
          {isNG
            ? 'Prices in Nigerian Naira (₦). Pay with Paystack or register a bank transfer.'
            : 'Prices exclude VAT. UK VAT (20%) is calculated and added at checkout.'}
        </p>
        {isNG && (
          <div className="mb-4 flex items-center justify-between gap-3 border border-ink/15 rounded-md p-3 bg-paper">
            <p className="text-sm text-ink/70">
              <b>Paid by bank transfer?</b> Register your payment for admin review and we'll credit your coins.
            </p>
            <button
              onClick={() => setTransferOpen(true)}
              className="text-xs uppercase tracking-widest bg-ink text-paper px-4 py-2 rounded-md whitespace-nowrap"
            >
              Register Transfer
            </button>
          </div>
        )}

        <CoinTermsCheckbox
          checked={agreedToTerms}
          onChange={(v) => { setAgreedToTerms(v); if (v) setTermsError(false); }}
          error={termsError}
          id="coin-terms-page"
        />

        {/* Featured pro pack + monthly subscription side-by-side */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">


          {featured && (
            <div className="relative border-2 border-gold p-6 flex flex-col bg-paper">
              <span className="absolute -top-3 left-6 bg-gold text-ink px-3 py-1 text-[10px] font-mono uppercase tracking-widest">Best Value</span>
              <p className="font-mono text-[10px] uppercase text-gold mb-2">One-time purchase</p>
              <p className="font-display text-2xl mb-1">{featured.name}</p>
              <p className="text-xs text-ink/60 mb-4">{featured.description ?? `${featured.credits} coins to unlock customer projects`}</p>
              <div className="flex items-baseline gap-3 mb-2">
                <p className="font-mono text-3xl">{fmt(featured.price_pence)}</p>
                {featured.compare_at_pence && (
                  <p className="font-mono text-base text-ink/40 line-through">{fmt(featured.compare_at_pence)}</p>
                )}
              </div>
              <p className="font-display text-lg mb-4 inline-flex items-center gap-2">
                <CoinIcon size={20} /> {featured.credits} {coinWord(featured.credits)}
              </p>
              <p className="text-[10px] text-ink/50 mb-4">ex. VAT</p>
              <button
                onClick={() => attemptBuy(`credits_${featured.id}`)}
                className="mt-auto bg-ink text-paper py-3 text-xs uppercase tracking-widest transition-all duration-300 ease-out hover:bg-gold hover:scale-[1.02] hover:shadow-lg"
              >
                Buy {featured.credits} {coinWord(featured.credits)}
              </button>
              <RefundNotice />
            </div>
          )}

          {subPlan && (
            <div className="border-2 border-gold/60 p-6 flex flex-col bg-paper relative">
              <span className="absolute -top-3 right-6 bg-gold text-ink px-3 py-1 text-[10px] font-mono uppercase tracking-widest">⭐ Priority alerts</span>
              <p className="font-mono text-[10px] uppercase text-ink/60 mb-2">Monthly subscription</p>
              <p className="font-display text-2xl mb-1">{subPlan.name}</p>
              <p className="text-xs text-ink/60 mb-3">{subPlan.credits} coins delivered every month</p>

              <ul className="text-xs text-ink/75 space-y-1.5 mb-4 border-l-2 border-gold pl-3">
                <li className="flex items-start gap-1.5"><span className="text-gold">✓</span> {subPlan.credits} coins / month</li>
                <li className="flex items-start gap-1.5"><span className="text-gold">✓</span> Invoice generator access</li>
                <li className="flex items-start gap-1.5"><span className="text-gold">✓</span> <span><b>Priority email alerts</b> for fresh projects before non-subscribers</span></li>
              </ul>

              <div className="flex items-baseline gap-2 mb-2">
                <p className="font-mono text-3xl">{fmt(subPlan.price_pence)}</p>
                <p className="text-xs text-ink/60">/month</p>
              </div>
              <p className="font-display text-lg mb-4 inline-flex items-center gap-2">
                <CoinIcon size={20} /> {subPlan.credits} {coinWord(subPlan.credits)} / month
              </p>

              <p className="text-[10px] text-ink/50 mb-4">Billed monthly · cancel anytime</p>
              {sub && ['active', 'trialing', 'past_due'].includes(sub.status) ? (
                <div className="mt-auto">
                  <div className="text-xs text-ink/70 mb-2">
                    {sub.cancel_at_period_end ? 'Cancels' : 'Renews'} {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : ''}
                  </div>
                  <button
                    onClick={openPortal}
                    className="w-full border border-ink py-3 text-xs uppercase tracking-widest transition-all duration-300 ease-out hover:bg-ink hover:text-paper hover:scale-[1.02] hover:shadow-lg"
                  >
                    Manage subscription
                  </button>
                </div>
              ) : (
                <div className="mt-auto flex flex-col">
                  <button
                    onClick={() => attemptBuy(subPlan.price_id)}
                    className="bg-ink text-paper py-3 text-xs uppercase tracking-widest transition-all duration-300 ease-out hover:bg-gold hover:scale-[1.02] hover:shadow-lg"
                  >
                    Subscribe
                  </button>
                  <RefundNotice />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border border-gold/40 bg-gold/5 p-4 mb-8 text-sm text-ink/80 flex items-start gap-3">
          <span className="text-lg leading-none">⭐</span>
          <p>
            <b>Subscribers get priority notifications for new projects before non-subscribers.</b>{" "}
            We email you the moment a fresh project matches your services — non-subscribers receive the same alerts later in a lower-priority queue.
          </p>
        </div>

        {/* Auto Top-Up (Stripe only) */}
        {!isNG && (
          <section className="border border-ink/15 p-6 mb-12 flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg mb-1">Auto Top-Up when coins are low</p>
              <p className="text-sm text-ink/60">
                Automatically replenishes your last coin package when balance drops below 5 coins.
                {!state.hasSavedPaymentMethod && ' Make a purchase first so we can save your payment method.'}
              </p>
              {state.autoTopupInProgress && (
                <p className="text-xs text-amber-700 mt-2">A top-up is currently processing…</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={state.autoTopupEnabled}
                onCheckedChange={toggleAutoTopUp}
                disabled={state.autoTopupInProgress}
              />
              <span className="text-xs uppercase tracking-widest text-ink/70">
                {state.autoTopupEnabled ? 'On' : 'Off'}
              </span>
            </div>
          </section>
        )}

        {/* Other packs */}
        {otherPacks.length > 0 && (
          <>
            <h2 className="font-display text-xl mb-3">Other packs</h2>
            <p className="text-xs text-ink/60 mb-3">{isNG ? 'Prices in Nigerian Naira (₦).' : 'Prices exclude VAT. UK VAT (20%) is calculated and added at checkout.'}</p>
            <section className="grid md:grid-cols-3 gap-4 mb-16">
              {otherPacks.map((p) => (
                <div key={p.id} className="border border-ink/15 p-6 flex flex-col">
                  <p className="font-mono text-[10px] uppercase text-gold mb-2">{p.name}</p>
                  <div className="flex items-center gap-2 mb-1">
                    <CoinIcon size={28} />
                    <p className="font-display text-4xl">{p.credits}</p>
                  </div>
                  <p className="text-xs text-ink/60 mb-6">{coinWord(p.credits)}</p>
                  <p className="font-mono text-2xl">{fmt(p.price_pence)}</p>
                  <p className="text-[10px] text-ink/50 mb-4">ex. VAT</p>
                  <button
                    onClick={() => attemptBuy(`credits_${p.id}`)}
                    className="mt-auto bg-ink text-paper py-3 text-xs uppercase tracking-widest transition-all duration-300 ease-out hover:bg-gold hover:scale-[1.02] hover:shadow-lg"
                  >
                    Buy coins
                  </button>
                  <RefundNotice />
                </div>
              ))}
            </section>
          </>
        )}


        <section>
          <h2 className="font-display text-2xl mb-4">Transactions</h2>
          {state.transactions.length === 0 ? (
            <p className="text-sm text-ink/60">No transactions yet.</p>
          ) : (
            <div className="border border-ink/10 divide-y divide-ink/10">
              {state.transactions.map((t) => (
                <div key={t.id} className="flex justify-between p-4 text-sm">
                  <div className="min-w-0 mr-4">
                    <p className="truncate">{t.description ?? t.transaction_type}</p>
                    <p className="text-[10px] text-ink/50">{new Date(t.created_at).toLocaleString()}</p>
                  </div>
                  <p className={`font-mono shrink-0 ${t.amount >= 0 ? 'text-emerald-700' : 'text-ink/80'}`}>
                    {t.amount >= 0 ? '+' : ''}{t.amount}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {openPriceId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-4" onClick={() => setOpenPriceId(null)}>
          <div className="bg-paper max-w-2xl w-full mt-12 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <p className="font-display text-xl">Checkout</p>
              <button onClick={() => setOpenPriceId(null)} className="text-xs uppercase tracking-widest text-ink/60 hover:text-ink">Close</button>
            </div>
            <p className="text-xs text-ink/60 mb-4">
              Prices exclude VAT. UK VAT (20%) is calculated and added at checkout.
            </p>
            <StripeEmbeddedCreditCheckout priceId={openPriceId} returnUrl={returnUrl} />
          </div>
        </div>
      )}

      {confirmAutoTopUp && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setConfirmAutoTopUp(null)}>
          <div className="bg-paper max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-xl mb-3">Enable Auto Top-Up?</p>
            <p className="text-sm text-ink/70 mb-5">
              When your balance drops below 5 coins, we'll charge your saved payment method to repurchase your last coin package automatically. You can disable this any time.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmAutoTopUp(null)}
                className="text-xs uppercase tracking-widest border border-ink/20 px-4 py-2 transition-all duration-300 ease-out hover:scale-[1.02]"
              >
                Cancel
              </button>
              <button
                onClick={confirmEnableAutoTopUp}
                className="text-xs uppercase tracking-widest bg-ink text-paper px-4 py-2 transition-all duration-300 ease-out hover:bg-gold hover:scale-[1.02] hover:shadow-lg"
              >
                Enable
              </button>
            </div>
          </div>
        </div>
      )}

      {isNG && paymentMethodFor && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPaymentMethodFor(null)}>
          <div className="bg-paper max-w-md w-full p-6 rounded-xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-xl mb-1">Choose payment method</p>
            <p className="text-xs text-ink/60 mb-5">Paystack is in test mode. Bank transfers are reviewed by our admin team.</p>
            <div className="space-y-3">
              <button
                disabled={paystackLoading || !paystackEnabled}
                onClick={() => {
                  if (!paymentMethodFor) return;
                  const priceId = paymentMethodFor;
                  setPaymentMethodFor(null);
                  void startPaystackCheckout(priceId);
                }}
                className="w-full text-left border border-ink/20 rounded-md px-4 py-3 hover:bg-ink/5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <p className="font-display text-base">Paystack {paystackLoading ? '…' : ''}</p>
                <p className="text-xs text-ink/60">
                  {paystackEnabled
                    ? 'Pay instantly with card, USSD or bank — you\'ll be redirected securely.'
                    : 'Paystack is currently being configured. Please try again later.'}
                </p>
              </button>
              <button
                onClick={() => { setTransferOpen(true); setPaymentMethodFor(null); }}
                className="w-full text-left border-2 border-gold rounded-md px-4 py-3 hover:bg-gold/10"
              >
                <p className="font-display text-base">Bank Transfer</p>
                <p className="text-xs text-ink/60">Pay into our account and register your transfer for review.</p>
              </button>
            </div>
            <div className="flex justify-end mt-5">
              <button onClick={() => setPaymentMethodFor(null)} className="text-xs uppercase tracking-widest text-ink/60 hover:text-ink">Close</button>
            </div>
          </div>
        </div>
      )}

      <RegisterTransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        packages={NG_PACKAGES}
        subPlan={NG_SUB_PLAN}
        onSubmitted={load}
      />
    </ProShell>
  );
}
