import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Phone, ShieldCheck } from "lucide-react";
import { requestPhoneOtp, verifyPhoneOtp } from "@/lib/phone-verification.functions";

interface Props {
  initialPhone: string;
  verified: boolean;
  onVerified: (phone: string) => void;
}

export function PhoneVerificationCard({ initialPhone, verified, onVerified }: Props) {
  const requestFn = useServerFn(requestPhoneOtp);
  const verifyFn = useServerFn(verifyPhoneOtp);
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [step, setStep] = useState<"idle" | "sent">(verified ? "idle" : "idle");
  const [resendIn, setResendIn] = useState(0);
  const [verifiedPhone, setVerifiedPhone] = useState(phone);

  async function sendCode() {
    if (!phone.trim()) return toast.error("Enter a phone number");
    setSending(true);
    try {
      const res = await requestFn({ data: { phone: phone.trim() } });
      setVerifiedPhone(res.phone);
      setStep("sent");
      setResendIn(60);
      toast.success("Verification code sent — check your phone.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send code";
      if (msg.includes("rate_limited")) toast.error("Too many attempts. Try again in an hour.");
      else if (msg.includes("invalid_phone")) toast.error("That phone number looks invalid.");
      else toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function submitCode() {
    if (!/^\d{4,8}$/.test(code.trim())) return toast.error("Enter the 6-digit code");
    setVerifying(true);
    try {
      const res = await verifyFn({ data: { code: code.trim(), phone: verifiedPhone || phone.trim() } });
      if (res.ok) {
        toast.success("Phone verified ✓");
        onVerified(res.phone);
        setStep("idle");
        setCode("");
      } else {
        const msg = res.error || "Verification failed";
        if (msg.includes("invalid_code")) toast.error("Wrong code — try again");
        else if (msg.includes("expired")) toast.error("Code expired — request a new one");
        else if (msg.includes("too_many_attempts")) toast.error("Too many attempts — request a new code");
        else if (msg.includes("no_pending_code")) toast.error("Send a new code first");
        else toast.error(msg);
      }
    } finally {
      setVerifying(false);
    }
  }

  if (verified) {
    return (
      <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-[#8a6b1f]" />
        <span className="text-sm text-ink">
          {initialPhone || "Phone"} <span className="text-ink/60">— verified</span>
        </span>
        <button
          onClick={() => setStep("idle")}
          className="ml-auto text-[11px] uppercase tracking-widest text-ink/60 hover:text-ink"
          type="button"
        >
          Change number
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40" />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="07123 456789"
            className="w-full border border-ink/20 pl-9 pr-3 py-2 bg-white text-sm"
            disabled={step === "sent" || sending}
          />
        </div>
        <button
          type="button"
          onClick={sendCode}
          disabled={sending || !phone.trim() || resendIn > 0}
          className="bg-ink text-paper px-4 py-2 text-xs uppercase tracking-widest font-medium hover:bg-gold disabled:opacity-50 whitespace-nowrap"
        >
          {sending ? "Sending…" : step === "sent" ? (resendIn > 0 ? `Resend in ${resendIn}s` : "Resend") : "Send Code"}
        </button>
      </div>

      {step === "sent" && (
        <div className="rounded-lg border border-ink/15 bg-paper p-3 space-y-2">
          <p className="text-xs text-ink/70">
            We sent a 6-digit code to <span className="font-medium">{verifiedPhone || phone}</span>. Enter it below.
          </p>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="flex-1 border border-ink/20 px-3 py-2 bg-white font-mono text-lg tracking-widest text-center"
            />
            <button
              type="button"
              onClick={submitCode}
              disabled={verifying || code.length < 4}
              className="bg-gold text-paper px-4 py-2 text-xs uppercase tracking-widest font-medium hover:bg-ink disabled:opacity-50"
            >
              {verifying ? "Verifying…" : "Verify"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
