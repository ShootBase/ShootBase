import { useEffect, useState } from "react";
import { getProReviews, replyToReview, reportTarget, type PublicReview, type ReviewStats } from "@/lib/reviews.functions";
import { StarRating } from "./StarRating";
import { ProAvatar } from "@/components/pro/ProAvatar";
import { toast } from "sonner";

type Props = {
  proId: string;
  isOwner?: boolean;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ReviewsSection({ proId, isOwner }: Props) {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getProReviews({ data: { pro_id: proId } })
      .then((r) => { setReviews(r.reviews); setStats(r.stats); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [proId]);

  if (loading) return null;
  if (!stats || stats.total === 0) {
    return (
      <section id="reviews" className="mb-12">
        <h2 className="font-display text-2xl mb-3">Reviews</h2>
        <div className="border border-dashed border-ink/15 p-8 text-center">
          <p className="text-sm text-ink/60">No reviews yet.</p>
        </div>
      </section>
    );
  }

  const max = Math.max(stats.c1, stats.c2, stats.c3, stats.c4, stats.c5, 1);

  return (
    <section id="reviews" className="mb-16">
      {/* Editorial header — distinctly Shootbase */}
      <div className="border-t border-ink/10 pt-10 mb-10">
        <div className="flex items-start gap-8 flex-wrap">
          <div className="flex items-center gap-5">
            <div>
              <p className="font-display text-6xl leading-none">{Number(stats.avg_rating).toFixed(1)}</p>
              <div className="mt-2"><StarRating value={Number(stats.avg_rating)} size={16} /></div>
            </div>
            <div className="h-16 w-px bg-gold/60" aria-hidden />
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink/50">Total reviews</p>
              <p className="font-display text-2xl">{stats.total}</p>
            </div>
            <div className="h-16 w-px bg-gold/60" aria-hidden />
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink/50">Would recommend</p>
              <p className="font-display text-2xl">{stats.recommend_pct}%</p>
            </div>
          </div>
          <div className="flex-1 min-w-[260px] max-w-md ml-auto space-y-1.5">
            {[5, 4, 3, 2, 1].map((n) => {
              const c = (stats as any)[`c${n}`] as number;
              const pct = (c / max) * 100;
              return (
                <div key={n} className="flex items-center gap-3 text-xs">
                  <span className="font-mono w-3 text-ink/60">{n}</span>
                  <div className="flex-1 h-1.5 bg-ink/8 relative">
                    <div className="absolute inset-y-0 left-0 bg-gold" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-mono w-8 text-right text-ink/60">{c}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reviews list — asymmetric editorial cards */}
      <ul className="space-y-8">
        {reviews.map((r) => (
          <ReviewCard key={r.id} review={r} canReply={!!isOwner} onChanged={load} />
        ))}
      </ul>
    </section>
  );
}

function ReviewCard({ review, canReply, onChanged }: { review: PublicReview; canReply: boolean; onChanged: () => void }) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-5 border-l-2 border-transparent hover:border-gold pl-5 -ml-5 transition-colors">
      <div className="pt-1">
        <div className="h-10 w-10 rounded-full bg-ink/8 grid place-content-center font-display text-lg text-ink/70">
          {(review.reviewer_first_name?.[0] ?? "C").toUpperCase()}
        </div>
      </div>
      <div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-base">
              {review.reviewer_first_name ?? "Client"}
              {review.reviewer_verified && (
                <span className="ml-2 font-mono text-[9px] uppercase tracking-widest bg-gold/10 text-gold px-1.5 py-0.5 align-middle">
                  Verified client
                </span>
              )}
            </p>
            <div className="mt-1"><StarRating value={review.rating} size={14} /></div>
          </div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40">{fmtDate(review.created_at)}</p>
        </div>
        {review.title && <h3 className="font-display text-lg mt-3">{review.title}</h3>}
        {review.body && <p className="text-sm text-ink/80 leading-relaxed mt-1 whitespace-pre-line">{review.body}</p>}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {review.project_category && (
            <span className="text-[10px] font-mono uppercase tracking-widest border border-ink/15 px-2 py-1 text-ink/60">
              {review.project_category}
            </span>
          )}
          {review.would_recommend && (
            <span className="text-[10px] font-mono uppercase tracking-widest text-gold">Recommended</span>
          )}
          <button
            type="button"
            onClick={async () => {
              const reason = prompt("Why are you reporting this review?");
              if (!reason) return;
              try {
                await reportTarget({ data: { target_type: "review", target_id: review.id, reason } });
                toast.success("Reported. Our team will review it.");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              }
            }}
            className="text-[10px] font-mono uppercase tracking-widest text-ink/40 hover:text-ink ml-auto"
          >
            Report
          </button>
        </div>

        {/* Reply block */}
        {review.reply_body ? (
          <div className="mt-4 bg-bone/60 border-l-2 border-gold pl-4 py-3 pr-3">
            <div className="flex items-center gap-2">
              {review.reply_business_name && (
                <p className="font-display text-sm">{review.reply_business_name}</p>
              )}
              <span className="text-[9px] font-mono uppercase tracking-widest text-ink/50">Reply</span>
              {review.reply_created_at && (
                <span className="text-[9px] font-mono uppercase tracking-widest text-ink/40 ml-auto">
                  {fmtDate(review.reply_created_at)}
                </span>
              )}
            </div>
            <p className="text-sm text-ink/80 mt-1 whitespace-pre-line">{review.reply_body}</p>
          </div>
        ) : canReply ? (
          <ReplyForm reviewId={review.id} onReplied={onChanged} />
        ) : null}
      </div>
    </li>
  );
}

function ReplyForm({ reviewId, onReplied }: { reviewId: string; onReplied: () => void }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[10px] font-mono uppercase tracking-widest text-gold mt-3 hover:underline">
        Reply to this review
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await replyToReview({ data: { review_id: reviewId, body } });
          toast.success("Reply posted");
          setOpen(false); setBody("");
          onReplied();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed");
        } finally { setBusy(false); }
      }}
      className="mt-3 space-y-2"
    >
      <textarea
        required minLength={3} maxLength={2000} rows={3}
        value={body} onChange={(e) => setBody(e.target.value)}
        placeholder="Reply as your business…"
        className="w-full bg-white border border-ink/15 px-3 py-2 text-sm focus:outline-none focus:border-gold"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="text-xs uppercase tracking-widest text-ink/60 px-3 py-1.5">Cancel</button>
        <button disabled={busy} className="text-xs uppercase tracking-widest bg-ink text-paper px-4 py-1.5 hover:bg-gold disabled:opacity-50">
          {busy ? "Posting…" : "Post reply"}
        </button>
      </div>
    </form>
  );
}
