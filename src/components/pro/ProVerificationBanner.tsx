import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, AlertTriangle, Mail, Phone, X, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyProVerification } from "@/lib/pro-verification.functions";
import { PhoneVerificationCard } from "@/components/account/PhoneVerificationCard";
import { toast } from "sonner";

/**
 * Top-of-page banner shown across the Professional area until the pro has
 * verified BOTH email and mobile phone. Mirrors the server-side gate in
 * unlockLead / sendMessage / createCreditCheckout.
 */
export function ProVerificationBanner() {
  const [loading, setLoading] = useState(true);
  const [accountType, setAccountType] = useState<string | null>(null);
  const [emailOk, setEmailOk] = useState(false);
  const [phoneOk, setPhoneOk] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState<"email" | "phone" | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  async function refresh() {
    try {
      const s = await getMyProVerification();
      setAccountType(s.account_type);
      setEmailOk(s.email_verified);
      setPhoneOk(s.phone_verified);
      setPhone(s.phone);
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  if (loading || dismissed) return null;
  if (accountType !== "professional") return null;
  if (emailOk && phoneOk) return null;

  async function resendEmail() {
    if (!email) return;
    setSendingEmail(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/verified?role=professional` },
      });
      if (error) throw error;
      toast.success("Verification email sent — check your inbox.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send verification email.");
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <div className="bg-gold/10 border-b border-gold/40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <AlertTriangle className="w-5 h-5 text-[#8a6b1f] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-medium text-ink">
                Verification required: Please verify your email address and mobile number to access projects and contact clients.
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs sm:text-sm">
                <span className={`inline-flex items-center gap-1 ${emailOk ? "text-emerald-700" : "text-[#8a6b1f]"}`}>
                  {emailOk ? <CheckCircle2 className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                  {emailOk ? "Email verified" : "Email verification required"}
                </span>
                <span className={`inline-flex items-center gap-1 ${phoneOk ? "text-emerald-700" : "text-[#8a6b1f]"}`}>
                  {phoneOk ? <ShieldCheck className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                  {phoneOk ? "Mobile verified" : "Mobile verification required"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:shrink-0">
            {!emailOk && (
              <button
                type="button"
                onClick={() => setOpen(open === "email" ? null : "email")}
                className="min-h-[44px] bg-ink text-paper px-3 sm:px-4 py-2 text-[11px] uppercase tracking-widest font-medium hover:bg-gold transition-colors rounded-sm"
              >
                Verify Email
              </button>
            )}
            {!phoneOk && (
              <button
                type="button"
                onClick={() => setOpen(open === "phone" ? null : "phone")}
                className="min-h-[44px] bg-ink text-paper px-3 sm:px-4 py-2 text-[11px] uppercase tracking-widest font-medium hover:bg-gold transition-colors rounded-sm"
              >
                Verify Mobile Number
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setDismissed(true)}
              className="text-ink/40 hover:text-ink p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {open === "email" && !emailOk && (
          <div className="mt-3 rounded-lg border border-ink/15 bg-paper p-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-ink flex-1">
              We'll send a verification link to <span className="font-medium">{email || "your email"}</span>.
            </p>
            <button
              type="button"
              onClick={resendEmail}
              disabled={sendingEmail}
              className="bg-gold text-paper px-4 py-2 text-xs uppercase tracking-widest font-medium hover:bg-ink disabled:opacity-50 min-h-[44px]"
            >
              {sendingEmail ? "Sending…" : "Send verification email"}
            </button>
          </div>
        )}

        {open === "phone" && !phoneOk && (
          <div className="mt-3 rounded-lg border border-ink/15 bg-paper p-3">
            <PhoneVerificationCard
              initialPhone={phone}
              verified={false}
              onVerified={() => { void refresh(); setOpen(null); }}
            />
            <p className="text-[11px] text-ink/60 mt-2">
              Need to update other details? <Link to="/account/settings" className="underline">Go to account settings</Link>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
