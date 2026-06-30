import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, X } from "lucide-react";

/**
 * Persistent non-blocking banner shown on the client dashboard until the
 * user has verified their email. Publishing jobs never blocks on this —
 * verification is purely a trust signal that improves response rates.
 */
export function EmailVerificationBanner() {
  const [needsVerify, setNeedsVerify] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const user = data.user;
      if (!user) return;
      setEmail(user.email ?? "");
      // Provider-based accounts (google/apple) are implicitly verified.
      const isOAuth = (user.app_metadata?.providers ?? []).some((p: string) => p !== "email");
      setNeedsVerify(!user.email_confirmed_at && !isOAuth);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!needsVerify || dismissed || !email) return null;

  async function resend() {
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/verified?role=customer` },
      });
      if (error) throw error;
      toast.success("Verification email sent. Please check your inbox.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send verification email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row gap-3 sm:items-center">
      <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
        <Mail className="w-5 h-5 text-gold shrink-0 mt-0.5 sm:mt-0" />
        <div className="text-sm text-ink min-w-0">
          <p className="font-medium">Please verify your email address</p>
          <p className="text-xs text-ink/65 mt-0.5">
            Verified clients receive more responses from professionals and build greater trust.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:shrink-0">
        <button
          type="button"
          disabled={sending}
          onClick={resend}
          className="bg-ink text-paper px-4 py-2 text-[11px] uppercase tracking-widest font-medium hover:bg-gold transition-colors disabled:opacity-50 rounded-sm"
        >
          {sending ? "Sending…" : "Verify Email"}
        </button>
        <button
          type="button"
          aria-label="Remind me later"
          onClick={() => setDismissed(true)}
          className="text-ink/40 hover:text-ink p-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
