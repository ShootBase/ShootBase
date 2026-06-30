import { Link } from "@tanstack/react-router";

export function CoinTermsCheckbox({
  checked,
  onChange,
  error,
  id = "coin-terms",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: boolean;
  id?: string;
}) {
  return (
    <div className="mb-4">
      <label
        htmlFor={id}
        className={`flex items-start gap-3 text-sm leading-snug ${error ? "text-destructive" : "text-ink/85"}`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-[3px] h-4 w-4 shrink-0 accent-gold"
          aria-invalid={!!error}
        />
        <span>
          I agree to the{" "}
          <Link
            to="/legal/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gold"
          >
            Terms and Conditions
          </Link>
        </span>
      </label>
      {error && (
        <p className="text-xs text-destructive mt-1 ml-7">
          Please agree to the Terms and Conditions before continuing.
        </p>
      )}
    </div>
  );
}

export function RefundNotice({ className = "" }: { className?: string }) {
  return (
    <p
      className={`mt-2 text-[13px] leading-snug text-ink/60 text-center ${className}`}
    >
      All sales final. Coins are non-refundable and hold no cash value.
    </p>
  );
}
