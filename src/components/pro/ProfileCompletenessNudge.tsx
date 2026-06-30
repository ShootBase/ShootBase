import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Instagram, Images, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Props = {
  userId: string | null;
  hasInstagram: boolean;
  hasPortfolio: boolean;
  /** True once the dashboard has finished loading the underlying signals. */
  ready: boolean;
};

type StoredState = { lastShownAt: number; dismissedForever: boolean };

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function storageKey(userId: string) {
  return `shootbase.pro.profileNudge.${userId}`;
}

function readState(userId: string): StoredState {
  if (typeof window === "undefined") return { lastShownAt: 0, dismissedForever: false };
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return { lastShownAt: 0, dismissedForever: false };
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      lastShownAt: typeof parsed.lastShownAt === "number" ? parsed.lastShownAt : 0,
      dismissedForever: Boolean(parsed.dismissedForever),
    };
  } catch {
    return { lastShownAt: 0, dismissedForever: false };
  }
}

function writeState(userId: string, state: StoredState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // ignore quota / privacy mode failures
  }
}

export function ProfileCompletenessNudge({ userId, hasInstagram, hasPortfolio, ready }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || !userId) return;

    const state = readState(userId);

    // Profile is complete — never bother the user again.
    if (hasInstagram && hasPortfolio) {
      if (!state.dismissedForever) {
        writeState(userId, { lastShownAt: state.lastShownAt, dismissedForever: true });
      }
      return;
    }

    if (state.dismissedForever) return;

    const sinceLast = Date.now() - state.lastShownAt;
    if (state.lastShownAt && sinceLast < COOLDOWN_MS) return;

    // Slight delay so the dashboard renders first.
    const id = window.setTimeout(() => {
      setOpen(true);
      writeState(userId, { lastShownAt: Date.now(), dismissedForever: false });
    }, 800);
    return () => window.clearTimeout(id);
  }, [ready, userId, hasInstagram, hasPortfolio]);

  if (!userId) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg border-0 bg-ink text-paper p-0 overflow-hidden">
        <div className="relative">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 80% 0%, rgba(212,165,116,0.35), transparent 55%), radial-gradient(circle at 0% 100%, rgba(232,220,196,0.18), transparent 60%)",
            }}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 rounded-full p-1.5 text-paper/60 hover:text-paper hover:bg-paper/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="relative px-6 sm:px-8 pt-8 pb-6">
            <DialogHeader className="text-left space-y-2">
              <p className="text-[10px] uppercase tracking-[0.28em] text-champagne/80">Stand out to clients</p>
              <DialogTitle className="font-display text-2xl sm:text-3xl leading-tight text-paper">
                A complete profile helps clients choose you with confidence.
              </DialogTitle>
              <DialogDescription className="text-sm text-paper/70 leading-relaxed">
                Pros with a portfolio and active Instagram are far more likely to be contacted. Add yours in under two minutes.
              </DialogDescription>
            </DialogHeader>

            <ul className="mt-6 space-y-3">
              <ChecklistRow
                icon={<Images className="w-4 h-4" />}
                label="Portfolio gallery"
                done={hasPortfolio}
                ctaHref="/pro/onboarding"
                ctaLabel="Upload work"
                onCta={() => setOpen(false)}
              />
              <ChecklistRow
                icon={<Instagram className="w-4 h-4" />}
                label="Instagram link"
                done={hasInstagram}
                ctaHref="/pro/onboarding"
                ctaLabel="Add Instagram"
                onCta={() => setOpen(false)}
              />
            </ul>

            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[11px] uppercase tracking-[0.2em] px-4 py-2.5 rounded-full text-paper/70 hover:text-paper hover:bg-paper/10 transition-colors"
              >
                Remind me later
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistRow({
  icon,
  label,
  done,
  ctaHref,
  ctaLabel,
  onCta,
}: {
  icon: React.ReactNode;
  label: string;
  done: boolean;
  ctaHref: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-paper/10 bg-paper/[0.04] px-4 py-3">
      <span
        className={`grid place-items-center w-9 h-9 rounded-full shrink-0 ${
          done ? "bg-gold text-ink" : "bg-paper/10 text-champagne"
        }`}
      >
        {done ? <Check className="w-4 h-4" /> : icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-paper truncate">{label}</p>
        <p className="text-[11px] text-paper/55">
          {done ? "Looking great — all set." : "Missing — add now"}
        </p>
      </div>
      {done ? (
        <span className="text-[10px] uppercase tracking-[0.22em] text-paper/45 shrink-0">Done</span>
      ) : (
        <Link
          to={ctaHref}
          onClick={onCta}
          className="shrink-0 text-[10px] uppercase tracking-[0.22em] bg-gold text-ink px-3 py-2 rounded-full hover:bg-paper transition-colors font-medium whitespace-nowrap"
        >
          {ctaLabel}
        </Link>
      )}
    </li>
  );
}
