import { useEffect, useState } from "react";
import {
  listPublicPortfolioVideos,
  reportPortfolioVideo,
} from "@/lib/portfolio-videos.functions";
import { toast } from "sonner";

type Video = {
  video_id: string;
  playback_url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  title: string | null;
};

function fmtDuration(s: number | null) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function ProfileVideoGallery({ professionalId }: { professionalId: string }) {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [active, setActive] = useState<Video | null>(null);
  const [reporting, setReporting] = useState<Video | null>(null);

  useEffect(() => {
    listPublicPortfolioVideos({ data: { professional_id: professionalId } })
      .then((r) => setVideos((r.videos ?? []) as Video[]))
      .catch(() => setVideos([]));
  }, [professionalId]);

  if (!videos || videos.length === 0) return null;

  return (
    <section className="rounded-3xl bg-white/70 border border-ink/5 px-5 sm:px-8 py-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-2xl">Portfolio Videos</h2>
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink/40">
          {videos.length} {videos.length === 1 ? "video" : "videos"}
        </span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {videos.map((v) => (
          <li key={v.video_id} className="relative group">
            <button
              type="button"
              onClick={() => setActive(v)}
              className="block w-full aspect-video bg-ink/10 overflow-hidden relative"
            >
              {v.thumbnail_url ? (
                <img
                  src={v.thumbnail_url}
                  alt={v.title ?? ""}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="absolute inset-0 bg-ink/20" />
              )}
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="bg-paper/90 text-ink w-14 h-14 rounded-full flex items-center justify-center text-2xl">
                  ▶
                </span>
              </span>
              {v.duration_seconds && (
                <span className="absolute bottom-2 right-2 bg-ink/80 text-paper text-[10px] tracking-widest font-mono px-2 py-1">
                  {fmtDuration(v.duration_seconds)}
                </span>
              )}
            </button>
            <div className="flex items-center justify-between mt-2 px-1">
              <span className="text-xs text-ink/70 truncate">{v.title ?? ""}</span>
              <button
                type="button"
                onClick={() => setReporting(v)}
                className="text-[10px] uppercase tracking-widest text-ink/40 hover:text-ink"
              >
                Report
              </button>
            </div>
          </li>
        ))}
      </ul>

      {active && (
        <div
          className="fixed inset-0 z-[100] bg-ink/80 flex items-center justify-center p-4"
          onClick={() => setActive(null)}
        >
          <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <video
              src={active.playback_url}
              controls
              autoPlay
              playsInline
              className="w-full aspect-video bg-black"
            />
            <button
              type="button"
              className="mt-3 text-paper text-xs uppercase tracking-widest"
              onClick={() => setActive(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {reporting && (
        <ReportModal
          video={reporting}
          onClose={() => setReporting(null)}
        />
      )}
    </section>
  );
}

function ReportModal({ video, onClose }: { video: Video; onClose: () => void }) {
  const [reason, setReason] = useState<string>("inappropriate");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await reportPortfolioVideo({
        data: {
          video_id: video.video_id,
          reason: reason as any,
          notes: notes || undefined,
        },
      });
      toast.success("Reported. Thank you.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] bg-ink/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-paper max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl mb-3">Report video</h3>
        <label className="block text-xs uppercase tracking-widest text-ink/60 mb-1">Reason</label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full border border-ink/20 bg-paper px-3 py-2 text-sm mb-3"
        >
          <option value="inappropriate">Inappropriate content</option>
          <option value="copyright">Copyright infringement</option>
          <option value="spam">Spam</option>
          <option value="wrong_category">Wrong category</option>
          <option value="other">Other</option>
        </select>
        <label className="block text-xs uppercase tracking-widest text-ink/60 mb-1">Details (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full border border-ink/20 bg-paper px-3 py-2 text-sm mb-4"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs uppercase tracking-widest px-3 py-2">
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={() => void submit()}
            className="bg-ink text-paper text-xs uppercase tracking-widest px-4 py-2 disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
