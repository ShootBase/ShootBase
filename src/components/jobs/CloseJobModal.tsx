import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import {
  closeJobWithOutcome,
  proCandidatesForJob,
  type ProCandidate,
} from "@/lib/job-outcomes.functions";

type Step = "reason" | "through" | "pickPro" | "outsideSource" | "review";

const REASONS: { id: "hired" | "no_longer_needed" | "decided_not_to_proceed" | "posted_by_mistake" | "other"; label: string }[] = [
  { id: "hired", label: "I hired someone" },
  { id: "no_longer_needed", label: "I no longer need this service" },
  { id: "decided_not_to_proceed", label: "I decided not to proceed" },
  { id: "posted_by_mistake", label: "I posted by mistake" },
  { id: "other", label: "Other" },
];

const OUTSIDE_SOURCES = [
  "Referral",
  "Google Search",
  "Social Media",
  "Existing Contact",
  "Another Marketplace",
  "Other",
];

const SOURCE_BADGE: Record<ProCandidate["source"], string> = {
  unlocked: "Unlocked your project",
  messaged: "Messaged you",
  invited: "You invited",
};

export function CloseJobModal({
  open,
  onOpenChange,
  jobId,
  jobTitle,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobId: string;
  jobTitle?: string;
  onClosed?: () => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState<(typeof REASONS)[number]["id"] | null>(null);
  const [through, setThrough] = useState<"shootbase" | "outside" | null>(null);
  const [candidates, setCandidates] = useState<ProCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [chosenPro, setChosenPro] = useState<ProCandidate | null>(null);
  const [outsideSource, setOutsideSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hiredQrId, setHiredQrId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("reason");
      setReason(null);
      setThrough(null);
      setChosenPro(null);
      setOutsideSource(null);
      setHiredQrId(null);
    }
  }, [open]);

  async function finalize(payload: {
    reason: NonNullable<typeof reason>;
    through?: "shootbase" | "outside";
    proId?: string;
    outsideSource?: string;
  }) {
    setBusy(true);
    try {
      const res = await closeJobWithOutcome({
        data: {
          job_id: jobId,
          reason: payload.reason,
          hired_through: payload.through ?? null,
          hired_pro_id: payload.proId ?? null,
          outside_source: payload.outsideSource ?? null,
        },
      });
      toast.success("Request closed");
      onClosed?.();
      if (payload.through === "shootbase" && res?.hired_qr_id) {
        setHiredQrId(res.hired_qr_id);
        setStep("review");
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to close request");
    } finally {
      setBusy(false);
    }
  }

  async function pickReason(id: NonNullable<typeof reason>) {
    setReason(id);
    if (id === "hired") {
      setStep("through");
    } else {
      await finalize({ reason: id });
    }
  }

  async function pickThrough(value: "shootbase" | "outside") {
    setThrough(value);
    if (value === "shootbase") {
      setStep("pickPro");
      setLoadingCandidates(true);
      try {
        const rows = await proCandidatesForJob({ data: { job_id: jobId } });
        setCandidates(rows);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load professionals");
      } finally {
        setLoadingCandidates(false);
      }
    } else {
      setStep("outsideSource");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white max-w-lg w-full border border-ink/10 max-h-[85vh] overflow-y-auto">
        <div className="p-6 border-b border-ink/10 flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-xl">
              {step === "reason" && "Why are you closing this request?"}
              {step === "through" && "Did you hire someone through Shootbase?"}
              {step === "pickPro" && "Which professional did you hire?"}
              {step === "outsideSource" && "Where did you find them?"}
              {step === "review" && "Would you like to leave a review?"}
            </p>
            {jobTitle && <p className="text-xs text-ink/55 mt-1 truncate">{jobTitle}</p>}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="text-[10px] uppercase tracking-widest text-ink/50 hover:text-ink"
          >
            Close
          </button>
        </div>

        <div className="p-6">
          {step === "reason" && (
            <div className="space-y-2">
              {REASONS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => void pickReason(r.id)}
                  disabled={busy}
                  className="w-full text-left text-sm border border-ink/15 px-4 py-3 hover:border-gold hover:bg-gold/5 transition-colors disabled:opacity-50"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {step === "through" && (
            <div className="space-y-2">
              <button
                onClick={() => void pickThrough("shootbase")}
                disabled={busy}
                className="w-full text-left text-sm border border-ink/15 px-4 py-3 hover:border-gold hover:bg-gold/5 transition-colors disabled:opacity-50"
              >
                <span className="font-display text-base block">Yes, through Shootbase</span>
                <span className="text-xs text-ink/60">Credit the professional and leave a review.</span>
              </button>
              <button
                onClick={() => void pickThrough("outside")}
                disabled={busy}
                className="w-full text-left text-sm border border-ink/15 px-4 py-3 hover:border-gold hover:bg-gold/5 transition-colors disabled:opacity-50"
              >
                <span className="font-display text-base block">No, outside of Shootbase</span>
                <span className="text-xs text-ink/60">Help us learn where you found them.</span>
              </button>
              <button
                onClick={() => setStep("reason")}
                className="text-[11px] uppercase tracking-widest text-ink/50 hover:text-ink mt-2"
              >
                ← Back
              </button>
            </div>
          )}

          {step === "pickPro" && (
            <div className="space-y-2">
              {loadingCandidates ? (
                <p className="text-sm text-ink/60">Loading professionals…</p>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-ink/60">
                  No professionals have interacted with this job yet. You can still close it as hired outside Shootbase.
                </p>
              ) : (
                candidates.map((c) => {
                  const selected = chosenPro?.professional_id === c.professional_id;
                  return (
                    <button
                      key={c.professional_id}
                      onClick={() => setChosenPro(c)}
                      className={`w-full text-left flex items-center justify-between gap-3 border px-4 py-3 transition-colors ${
                        selected ? "border-gold bg-gold/5" : "border-ink/15 hover:border-gold"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-display text-base truncate">{c.business_name ?? "Professional"}</p>
                        <p className="text-[11px] uppercase tracking-widest text-ink/50 mt-0.5">
                          {SOURCE_BADGE[c.source]}
                          {c.city ? ` · ${c.city}` : ""}
                        </p>
                      </div>
                      {selected && <span className="text-gold font-mono text-[10px] uppercase">Selected</span>}
                    </button>
                  );
                })
              )}
              <div className="flex justify-between items-center pt-3 mt-3 border-t border-ink/10">
                <button
                  onClick={() => setStep("through")}
                  className="text-[11px] uppercase tracking-widest text-ink/50 hover:text-ink"
                >
                  ← Back
                </button>
                <button
                  onClick={() => chosenPro && void finalize({ reason: "hired", through: "shootbase", proId: chosenPro.professional_id })}
                  disabled={!chosenPro || busy}
                  className="text-xs uppercase tracking-widest bg-ink text-paper px-5 py-2.5 hover:bg-gold disabled:opacity-40"
                >
                  Confirm hire
                </button>
              </div>
            </div>
          )}

          {step === "outsideSource" && (
            <div className="space-y-2">
              <p className="text-sm text-ink/70 mb-3">Optional — helps us improve matching.</p>
              {OUTSIDE_SOURCES.map((s) => {
                const selected = outsideSource === s;
                return (
                  <button
                    key={s}
                    onClick={() => setOutsideSource(s)}
                    className={`w-full text-left text-sm border px-4 py-2.5 transition-colors ${
                      selected ? "border-gold bg-gold/5" : "border-ink/15 hover:border-gold"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
              <div className="flex justify-between items-center pt-3 mt-3 border-t border-ink/10">
                <button
                  onClick={() => setStep("through")}
                  className="text-[11px] uppercase tracking-widest text-ink/50 hover:text-ink"
                >
                  ← Back
                </button>
                <button
                  onClick={() => void finalize({ reason: "hired", through: "outside", outsideSource: outsideSource ?? undefined })}
                  disabled={busy}
                  className="text-xs uppercase tracking-widest bg-ink text-paper px-5 py-2.5 hover:bg-gold disabled:opacity-40"
                >
                  Close request
                </button>
              </div>
            </div>
          )}

          {step === "review" && (
            <div>
              <p className="text-sm text-ink/70 mb-5">
                Reviews help other clients pick the right professional and reward great work.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => onOpenChange(false)}
                  className="text-xs uppercase tracking-widest border border-ink/15 px-5 py-2.5 hover:border-gold"
                >
                  Maybe Later
                </button>
                <button
                  onClick={() => {
                    onOpenChange(false);
                    if (hiredQrId) navigate({ to: "/threads/$id", params: { id: hiredQrId } });
                  }}
                  className="text-xs uppercase tracking-widest bg-gold text-white px-5 py-2.5 hover:bg-ink"
                >
                  Leave Review
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
