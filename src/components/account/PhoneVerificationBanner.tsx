import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, X } from "lucide-react";
import { PhoneVerificationCard } from "@/components/account/PhoneVerificationCard";

/**
 * Persistent non-blocking phone verification prompt for clients.
 *
 * Shown only after the user's email is verified (mirrors the post-publish
 * flow described in the spec: publish job → verify email → prompt for phone).
 * Hidden once `profiles.phone_verified` is true or the user dismisses it for
 * the session.
 */
export function PhoneVerificationBanner() {
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [phone, setPhone] = useState("");
  const [verified, setVerified] = useState(false);

  async function refresh() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    const isOAuth = (user.app_metadata?.providers ?? []).some((p: string) => p !== "email");
    const emailOk = !!user.email_confirmed_at || isOAuth;
    const { data: prof } = await supabase
      .from("profiles")
      .select("phone, verified_phone")
      .eq("id", user.id)
      .maybeSingle();
    const isVerified = !!(prof as { verified_phone?: boolean } | null)?.verified_phone;
    setPhone((prof as { phone?: string } | null)?.phone ?? "");
    setVerified(isVerified);
    setShow(emailOk && !isVerified);
  }

  useEffect(() => { void refresh(); }, []);

  if (!show || dismissed || verified) return null;

  return (
    <div className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
          <ShieldCheck className="w-5 h-5 text-gold shrink-0 mt-0.5 sm:mt-0" />
          <div className="text-sm text-ink min-w-0">
            <p className="font-medium">Verify your phone number</p>
            <p className="text-xs text-ink/65 mt-0.5">
              Verified phone numbers help professionals trust your request and rank higher in the project marketplace — increasing your chances of more responses and quotes.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="bg-ink text-paper px-4 py-2 text-[11px] uppercase tracking-widest font-medium hover:bg-gold transition-colors rounded-sm"
            >
              Verify Now
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="text-ink/40 hover:text-ink p-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3">
          <PhoneVerificationCard
            initialPhone={phone}
            verified={verified}
            onVerified={() => { setVerified(true); void refresh(); }}
          />
        </div>
      )}
    </div>
  );
}
