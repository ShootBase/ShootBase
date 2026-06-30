import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyPortfolioVideosContext,
  createPortfolioVideo,
  deletePortfolioVideo,
  reorderPortfolioVideos,
} from "@/lib/portfolio-videos.functions";

const BUCKET = "portfolio-videos";
const ALLOWED = ["video/mp4", "video/quicktime"]; // mp4 + mov
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_DURATION = 180;
const MAX_HEIGHT = 1080;

type VideoRow = {
  id: string;
  playback_url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  title: string | null;
  status: string;
  position: number | null;
  is_active: boolean;
};

type Ctx = {
  eligible: boolean;
  videos: VideoRow[];
  slotsLeft: number;
  max: number;
};

function fmtDuration(s: number | null) {
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

async function probeVideo(file: File): Promise<{
  duration: number;
  width: number;
  height: number;
  thumbBlob: Blob | null;
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    v.onloadedmetadata = () => {
      const duration = v.duration;
      const width = v.videoWidth;
      const height = v.videoHeight;
      // seek a bit in to capture a thumbnail
      v.currentTime = Math.min(1.2, duration / 2);
      v.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 720 / Math.max(width, 1));
          canvas.width = Math.round(width * scale) || 320;
          canvas.height = Math.round(height * scale) || 180;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(v, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (b) => {
              URL.revokeObjectURL(url);
              resolve({ duration, width, height, thumbBlob: b });
            },
            "image/jpeg",
            0.8,
          );
        } catch {
          URL.revokeObjectURL(url);
          resolve({ duration, width, height, thumbBlob: null });
        }
      };
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read video"));
    };
  });
}

export function PortfolioVideoManager() {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const r = await getMyPortfolioVideosContext();
    setCtx(r as Ctx);
  }
  useEffect(() => {
    void load();
  }, []);

  async function onPick(files: FileList | null) {
    if (!files || !files[0] || !ctx) return;
    const file = files[0];
    if (!ALLOWED.includes(file.type) && !/\.(mp4|mov)$/i.test(file.name)) {
      toast.error("Only MP4 or MOV files are allowed");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Maximum file size is 100 MB");
      return;
    }
    if (ctx.slotsLeft <= 0) {
      toast.error(`Maximum ${ctx.max} videos`);
      return;
    }

    setBusy(true);
    try {
      const probe = await probeVideo(file).catch(() => null);
      if (!probe) {
        toast.error("Could not read video metadata");
        return;
      }
      if (probe.duration > MAX_DURATION + 1) {
        toast.error("Maximum duration is 3 minutes");
        return;
      }
      if (probe.height > MAX_HEIGHT) {
        toast.error("Maximum resolution is 1080p");
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) {
        toast.error("Not signed in");
        return;
      }
      const ext = /mov$/i.test(file.name) ? "mov" : "mp4";
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `${uid}/${id}.${ext}`;
      setProgress(5);
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "video/mp4",
        cacheControl: "31536000",
        upsert: false,
      });
      if (upErr) {
        toast.error(`Upload failed: ${upErr.message}`);
        return;
      }
      setProgress(70);

      // thumbnail to portfolio-images (public bucket)
      let thumbUrl: string | null = null;
      if (probe.thumbBlob) {
        const tPath = `${uid}/video-thumbs/${id}.jpg`;
        const { error: tErr } = await supabase.storage
          .from("portfolio-images")
          .upload(tPath, probe.thumbBlob, {
            contentType: "image/jpeg",
            cacheControl: "31536000",
            upsert: false,
          });
        if (!tErr) {
          const { data: pub } = supabase.storage.from("portfolio-images").getPublicUrl(tPath);
          thumbUrl = pub.publicUrl;
        }
      }
      setProgress(90);

      await createPortfolioVideo({
        data: {
          storage_path: path,
          duration_seconds: Math.round(probe.duration),
          size_bytes: file.size,
          width: probe.width,
          height: probe.height,
          title: file.name.replace(/\.[^.]+$/, "").slice(0, 120),
        },
      });

      // Patch the thumbnail separately (best-effort)
      if (thumbUrl) {
        await supabase
          .from("portfolio_videos")
          .update({ thumbnail_url: thumbUrl })
          .eq("provider_asset_id", path);
      }

      toast.success("Video uploaded");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this video?")) return;
    try {
      await deletePortfolioVideo({ data: { id } });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function move(id: string, dir: -1 | 1) {
    if (!ctx) return;
    const ids = ctx.videos.map((v) => v.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setCtx({ ...ctx, videos: ids.map((x) => ctx.videos.find((v) => v.id === x)!) });
    try {
      await reorderPortfolioVideos({ data: { ids } });
    } catch {
      await load();
    }
  }

  if (!ctx) return null;
  if (!ctx.eligible) return null;

  const active = ctx.videos.filter((v) => v.is_active);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <p className="font-display text-2xl">Portfolio Videos</p>
          <p className="text-xs text-ink/55 mt-1">
            {active.length} of {ctx.max} videos uploaded · MP4/MOV · max 3 min · max 100 MB · 1080p
          </p>
        </div>
      </div>

      {ctx.slotsLeft > 0 && (
        <div className="border-2 border-dashed border-ink/20 p-6 text-center mb-5">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="text-gold underline hover:no-underline disabled:opacity-50 text-sm"
          >
            {busy ? "Uploading…" : "Upload a video"}
          </button>
          <p className="text-[11px] text-ink/50 mt-2">
            {ctx.slotsLeft} slot{ctx.slotsLeft === 1 ? "" : "s"} left
          </p>
          {progress !== null && (
            <div className="h-1 bg-ink/10 mt-3 max-w-xs mx-auto">
              <div className="h-1 bg-gold transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime,.mp4,.mov"
            hidden
            onChange={(e) => onPick(e.target.files)}
          />
        </div>
      )}

      {active.length === 0 ? (
        <p className="text-sm text-ink/55 italic">No videos yet.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {active.map((v, i) => (
            <li key={v.id} className="relative group bg-ink/5 border border-ink/5">
              <div className="aspect-video bg-ink/10 relative">
                {v.thumbnail_url ? (
                  <img
                    src={v.thumbnail_url}
                    alt={v.title ?? ""}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <video src={v.playback_url} preload="metadata" className="w-full h-full object-cover" />
                )}
                <span className="absolute bottom-2 right-2 bg-ink/80 text-paper text-[10px] tracking-widest font-mono px-2 py-1">
                  {fmtDuration(v.duration_seconds)}
                </span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-xs text-ink/70 truncate">{v.title ?? "Untitled"}</span>
                <div className="flex items-center gap-1">
                  {i > 0 && (
                    <button
                      type="button"
                      className="text-[10px] uppercase tracking-widest text-ink/60 hover:text-ink px-1"
                      onClick={() => void move(v.id, -1)}
                    >
                      ↑
                    </button>
                  )}
                  {i < active.length - 1 && (
                    <button
                      type="button"
                      className="text-[10px] uppercase tracking-widest text-ink/60 hover:text-ink px-1"
                      onClick={() => void move(v.id, 1)}
                    >
                      ↓
                    </button>
                  )}
                  <a
                    href={v.playback_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] uppercase tracking-widest text-ink/60 hover:text-ink"
                  >
                    Preview
                  </a>
                  <button
                    type="button"
                    onClick={() => void onDelete(v.id)}
                    className="text-[10px] uppercase tracking-widest text-rose-600 hover:text-rose-800"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
