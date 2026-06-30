import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { submitLeadReport } from "@/lib/lead-reports.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  onSubmitted?: () => void;
};

const REASON_LABELS: Record<string, string> = {
  disconnected: "Number is disconnected / out of service",
  wrong_number: "Wrong number (reached someone else entirely)",
};

export function ReportInvalidNumberModal({ open, onOpenChange, jobId, onSubmitted }: Props) {
  const submit = useServerFn(submitLeadReport);
  const [reason, setReason] = useState<"disconnected" | "wrong_number" | "">("");
  const [attemptedCall, setAttemptedCall] = useState(false);
  const [attemptedSms, setAttemptedSms] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setReason("");
    setAttemptedCall(false);
    setAttemptedSms(false);
    setNotes("");
    setBusy(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      toast.error("Please choose a reason");
      return;
    }
    if (!attemptedCall && !attemptedSms) {
      toast.error("Confirm at least one contact attempt");
      return;
    }
    setBusy(true);
    try {
      await submit({
        data: { job_id: jobId, reason, attempted_call: attemptedCall, attempted_sms: attemptedSms, notes },
      });
      toast.success(
        'Thank you. Your invalid contact report has been submitted. Our team will investigate the project and update you if action is required.',
        { duration: 8000 },
      );
      reset();
      onOpenChange(false);
      onSubmitted?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit report";
      if (msg.includes("already_reported")) toast.error("You've already reported this project.");
      else if (msg.includes("report_window_expired")) toast.error("Reports must be filed within 24 hours of unlocking.");
      else if (msg.includes("not_unlocked")) toast.error("You can only report projects you've unlocked.");
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report Invalid Contact Information</DialogTitle>
          <DialogDescription>
            If the client&apos;s phone number is disconnected or belongs to someone else, you may submit a
            report for verification. Invalid projects may qualify for a credit refund.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-5 mt-2">
          <div className="space-y-2">
            <Label>Reason <span className="text-destructive">*</span></Label>
            <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
              <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
              <SelectContent>
                {Object.entries(REASON_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Contact attempt verification <span className="text-destructive">*</span></Label>
            <p className="text-xs text-muted-foreground">Select at least one.</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={attemptedCall} onCheckedChange={(v) => setAttemptedCall(!!v)} />
              I attempted a phone call
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={attemptedSms} onCheckedChange={(v) => setAttemptedSms(!!v)} />
              I attempted an SMS
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lr-notes">Additional details (optional)</Label>
            <Textarea
              id="lr-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              maxLength={500}
              placeholder="What happened when you tried to contact the client?"
              rows={4}
            />
            <p className="text-[11px] text-muted-foreground text-right">{notes.length}/500</p>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit Report"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
