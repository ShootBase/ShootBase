import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getMyCreditsOverview } from "@/lib/credits.functions";
import { StripeEmbeddedCreditCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { formatPence } from "@/lib/format";
import { CoinIcon } from "@/components/ui/coin-icon";
import { CoinTermsCheckbox, RefundNotice } from "@/components/pro/CoinTermsGate";




type Pkg = {
  id: string;
  name: string;
  credits: number;
  price_pence: number;
  compare_at_pence?: number;
  featured?: boolean;
  description?: string;
};

type SubPlan = {
  price_id: string;
  name: string;
  credits: number;
  price_pence: number;
  interval: string;
};

type ActiveSub = {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
} | null;

export function BuyCreditsModal({
  open,
  onClose,
  onPurchased,
}: {
  open: boolean;
  onClose: () => void;
  onPurchased?: () => void;
}) {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [subPlan, setSubPlan] = useState<SubPlan | null>(null);
  const [activeSub, setActiveSub] = useState<ActiveSub>(null);
  const [openPriceId, setOpenPriceId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);

  function attemptBuy(priceId: string) {
    if (!agreedToTerms) {
      setTermsError(true);
      return;
    }
    setTermsError(false);
    setOpenPriceId(priceId);
  }


  useEffect(() => {
    if (!open) return;
    void getMyCreditsOverview().then((r) => {
      if (r.hasProfile) {
        setPackages(r.packages as Pkg[]);
        setBalance(r.balance);
        setSubPlan((r.subscriptionPlan as SubPlan | null) ?? null);
        setActiveSub((r.subscription as ActiveSub) ?? null);
      }
    });
  }, [open]);

  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/pro/credits/success?session_id={CHECKOUT_SESSION_ID}`
      : "";

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-4"
      onClick={() => {
        if (openPriceId) {
          setOpenPriceId(null);
        } else {
          onClose();
          onPurchased?.();
        }
      }}
    >
      <div
        className="bg-white max-w-3xl w-full mt-12 rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <PaymentTestModeBanner />
        <div className="flex justify-between items-center px-6 py-4 border-b border-[#E8E5DF]">
          <div>
            <p className="font-display text-xl text-[#1E1E1E]">
              {openPriceId ? "Checkout" : "Buy coins"}
            </p>
            <p className="text-xs text-[#6B6B6B] mt-0.5 inline-flex items-center gap-1.5">
              Your balance: <CoinIcon size={14} />
              <b className="text-[#1E1E1E]">{balance}</b> {balance === 1 ? "coin" : "coins"}
            </p>
          </div>

          <button
            aria-label="Close"
            onClick={() => {
              if (openPriceId) setOpenPriceId(null);
              else {
                onClose();
                onPurchased?.();
              }
            }}
            className="text-[#6B6B6B] hover:text-[#1E1E1E] p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {openPriceId ? (
            <>
              <p className="text-xs text-[#6B6B6B] mb-4">
                Prices exclude VAT. UK VAT (20%) is calculated and added at checkout.
              </p>
              <StripeEmbeddedCreditCheckout priceId={openPriceId} returnUrl={returnUrl} />
            </>
          ) : packages.length === 0 ? (
            <p className="text-sm text-[#6B6B6B]">Loading packages…</p>
          ) : (
            <>
              <CoinTermsCheckbox
                checked={agreedToTerms}
                onChange={(v) => { setAgreedToTerms(v); if (v) setTermsError(false); }}
                error={termsError}
                id="coin-terms-modal"
              />

              {subPlan && (
                <div className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#9A6B14] mb-2">
                    Monthly subscription
                  </p>
                  <div className="border-2 border-[#D6A23D] rounded-lg p-5 bg-[#FBF1DC]/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-display text-xl text-[#1E1E1E] mb-0.5">{subPlan.name}</p>
                      <p className="text-xs text-[#6B6B6B] mb-2">
                        {subPlan.credits} projects per month · billed monthly · cancel anytime
                      </p>
                      <div className="inline-flex items-center gap-2">
                        <CoinIcon size={18} />
                        <span className="font-display text-lg text-[#1E1E1E]">
                          {subPlan.credits} projects
                        </span>
                        <span className="text-xs text-[#6B6B6B]">/ month</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-2xl text-[#1E1E1E] leading-none">
                        {formatPence(subPlan.price_pence)}
                        <span className="text-xs text-[#6B6B6B] font-sans ml-1">/mo</span>
                      </p>
                      <p className="text-[10px] text-[#9A9690] mb-2">ex. VAT</p>
                      {activeSub && ["active", "trialing", "past_due"].includes(activeSub.status) ? (
                        <span className="inline-block bg-emerald-100 text-emerald-800 text-[10px] uppercase tracking-widest px-3 py-2 rounded-md">
                          Active
                        </span>
                      ) : (
                        <div className="flex flex-col items-stretch">
                          <button
                            onClick={() => attemptBuy(subPlan.price_id)}
                            className="bg-[#1E1E1E] text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-[#D6A23D] transition"
                          >
                            Subscribe
                          </button>
                          <RefundNotice />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B] mb-2">
                One-time coin packs
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                {packages.map((p) => (
                  <div
                    key={p.id}
                    className={`border rounded-lg p-5 flex flex-col ${
                      p.featured ? "border-[#D6A23D] bg-[#FBF1DC]/30" : "border-[#E8E5DF] bg-white"
                    }`}
                  >
                    {p.featured && (
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#9A6B14] mb-2">
                        Best value
                      </p>
                    )}
                    <p className="font-display text-xl text-[#1E1E1E] mb-1">{p.name}</p>
                    <p className="text-xs text-[#6B6B6B] mb-3">
                      {p.description ?? `${p.credits} ${p.credits === 1 ? "coin" : "coins"}`}
                    </p>
                    <div className="flex items-center gap-2 mb-1">
                      <CoinIcon size={22} />
                      <p className="font-display text-2xl text-[#1E1E1E]">{p.credits}</p>
                      <span className="text-xs text-[#6B6B6B]">{p.credits === 1 ? "coin" : "coins"}</span>
                    </div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <p className="font-mono text-2xl">{formatPence(p.price_pence)}</p>
                      {p.compare_at_pence && (
                        <p className="font-mono text-sm text-[#9A9690] line-through">
                          {formatPence(p.compare_at_pence)}
                        </p>
                      )}
                    </div>
                    <p className="text-[11px] text-[#9A9690] mb-4">ex. VAT</p>
                    <button
                      onClick={() => attemptBuy(`credits_${p.id}`)}
                      className="mt-auto bg-[#D6A23D] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#c39231] transition inline-flex items-center justify-center gap-2"
                    >
                      <CoinIcon size={16} /> Buy {p.credits} {p.credits === 1 ? "coin" : "coins"}
                    </button>
                    <RefundNotice />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
