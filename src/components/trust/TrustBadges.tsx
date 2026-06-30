import { BadgeCheck, ShieldCheck } from "lucide-react";

type Size = "sm" | "md";

export function VerifiedClientBadge({ size = "sm" }: { size?: Size }) {
  const cls = size === "md" ? "text-xs px-2.5 py-1" : "text-[10px] px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 ${cls} rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium`}
      title="Email or social-login verified"
    >
      <BadgeCheck className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
      Verified Client
    </span>
  );
}

export function PhoneVerifiedBadge({ size = "sm" }: { size?: Size }) {
  const cls = size === "md" ? "text-xs px-2.5 py-1" : "text-[10px] px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 ${cls} rounded-full bg-gold/15 text-[#8a6b1f] border border-gold/40 font-medium`}
      title="Phone number verified via SMS"
    >
      <ShieldCheck className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
      Phone Verified
    </span>
  );
}

export function TrustBadges({
  verified,
  phoneVerified,
  size = "sm",
  showUnverified = false,
}: {
  verified: boolean | null | undefined;
  phoneVerified: boolean | null | undefined;
  size?: Size;
  showUnverified?: boolean;
}) {
  if (!verified && !phoneVerified) {
    if (!showUnverified) return null;
    return (
      <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-ink/5 text-ink/60 border border-ink/10">
        Unverified Account
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {verified && <VerifiedClientBadge size={size} />}
      {phoneVerified && <PhoneVerifiedBadge size={size} />}
    </span>
  );
}
