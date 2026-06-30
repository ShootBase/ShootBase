import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StarRating } from "./StarRating";
import { submitReview } from "@/lib/reviews.functions";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  proId: string;
  jobId: string;
  proName: string;
  defaultCategory?: string;
  onSubmitted?: () => void;
};

export function LeaveReviewDialog({ open, onOpenChange, proId, jobId, proName, defaultCategory, onSubmitted }: Props) {
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(defaultCategory ?? "");
  const [recommend, setRecommend] = useState(true);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await submitReview({
        data: {
          pro_id: proId, job_id: jobId, rating, title, body,
          project_category: category, would_recommend: recommend,
        },
      });
      toast.success("Review submitted");
      onOpenChange(false);
      onSubmitted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-paper max-w-lg border-ink/10">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Review {proName}</DialogTitle>
          <DialogDescription className="text-xs uppercase tracking-widest text-ink/50">
            Your review helps other clients pick the right professional.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-5 mt-2">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest text-ink/50">Overall rating</label>
            <StarRating value={rating} interactive onChange={setRating} size={28} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest text-ink/50">Title</label>
            <input
              required maxLength={120}
              value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="A short headline"
              className="w-full bg-white border border-ink/15 px-3 py-2 text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest text-ink/50">Your review</label>
            <textarea
              required minLength={20} maxLength={4000} rows={5}
              value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Tell other clients about working with this professional…"
              className="w-full bg-white border border-ink/15 px-3 py-2 text-sm focus:outline-none focus:border-gold resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest text-ink/50">Project category</label>
            <input
              maxLength={80} value={category} onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Wedding photography"
              className="w-full bg-white border border-ink/15 px-3 py-2 text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button" onClick={() => setRecommend((v) => !v)}
              aria-pressed={recommend}
              className={`h-6 w-12 rounded-full border transition-colors relative ${recommend ? "bg-gold border-gold" : "bg-paper border-ink/20"}`}
            >
              <span className={`absolute top-0.5 ${recommend ? "right-0.5" : "left-0.5"} h-5 w-5 rounded-full bg-white shadow transition-all`} />
            </button>
            <span className="text-sm text-ink/80">I would recommend this professional</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="text-xs uppercase tracking-widest text-ink/60 hover:text-ink px-4 py-2">
              Cancel
            </button>
            <button
              type="submit" disabled={busy}
              className="text-xs uppercase tracking-widest bg-ink text-paper px-5 py-2.5 hover:bg-gold disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit Review"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
