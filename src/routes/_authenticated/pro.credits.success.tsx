import { ProShell } from "@/components/site/ProShell";
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { getMyCreditsOverview } from '@/lib/credits.functions';
import { verifyPaystackPayment } from '@/lib/paystack.functions';
import { CoinIcon } from '@/components/ui/coin-icon';


export const Route = createFileRoute('/_authenticated/pro/credits/success')({
  head: () => ({ meta: [{ title: 'Payment received — Shootbase' }, { name: 'robots', content: 'noindex' }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    session_id: typeof s.session_id === 'string' ? s.session_id : undefined,
    reference: typeof s.reference === 'string' ? s.reference : undefined,
    trxref: typeof s.trxref === 'string' ? s.trxref : undefined,
  }),
  component: SuccessPage,
});

function SuccessPage() {
  const { reference, trxref } = Route.useSearch();
  const paystackRef = reference || trxref;
  const [balance, setBalance] = useState<number | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [paystackMsg, setPaystackMsg] = useState<string | null>(null);

  const refresh = async () => {
    setReloading(true);
    try {
      const res = await getMyCreditsOverview();
      if (res.hasProfile) setBalance(res.balance);
    } finally {
      setReloading(false);
    }
  };

  useEffect(() => {
    if (!paystackRef) return;
    void verifyPaystackPayment({ data: { reference: paystackRef } })
      .then((r) => {
        if ('ok' in r && r.ok) {
          setPaystackMsg(r.alreadyCredited ? 'Payment already credited.' : `${r.credits} coins credited.`);
        } else if ('error' in r) {
          setPaystackMsg(`Paystack: ${r.error}`);
        }
      })
      .catch(() => {});
  }, [paystackRef]);

  useEffect(() => {
    let attempts = 0;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const res = await getMyCreditsOverview();
      if (res.hasProfile) setBalance(res.balance);
      attempts++;
      if (attempts < 10 && !cancelled) setTimeout(tick, 1500);
      else if (!cancelled) setExhausted(true);
    };
    void tick();
    return () => { cancelled = true; };
  }, []);

  return (
    <ProShell>
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <p className="font-mono text-[10px] uppercase text-gold mb-3">Payment received</p>
        <h1 className="font-display text-4xl mb-4">Thank you</h1>
        <p className="text-sm text-ink/70 mb-2">Your coins will appear in your balance within a few seconds.</p>
        {paystackMsg && <p className="text-xs text-ink/60 mb-6">{paystackMsg}</p>}
        <div className="relative border-2 border-gold/70 bg-gradient-to-br from-[#FFF7E0] via-[#FBE7B0] to-[#F1CE74] inline-block px-10 py-6 mb-8 rounded-xl shadow-md">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#7A5A12] mb-2">Current balance</p>
          <div className="flex items-center justify-center gap-3">
            <CoinIcon size={48} />
            <p className="font-display text-5xl text-[#3A2A08] leading-none">{balance ?? '—'}</p>
          </div>
        </div>
        {exhausted && (
          <p className="text-xs text-ink/60 mb-4">
            Still waiting? Stripe occasionally delays delivery by a minute. Click refresh below — if your balance still hasn't moved after a few minutes, contact support and we'll reconcile it.
          </p>
        )}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link to="/pro/credits" className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest inline-block hover:bg-gold">
            Back to coins
          </Link>
          {exhausted && (
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={reloading}
              className="border border-ink/20 text-ink px-6 py-3 text-xs uppercase tracking-widest hover:border-gold disabled:opacity-60"
            >
              {reloading ? 'Refreshing…' : 'Refresh balance'}
            </button>
          )}
        </div>
      </div>
      </ProShell>
  );
}

