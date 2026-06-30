import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import {
  getMyPortfolio, addPortfolioImage, reorderPortfolio,
  type MyPortfolioResponse, type MyPortfolioItem,
} from "@/lib/portfolio.functions";
import { deletePortfolioItem } from "@/lib/marketplace.functions";

const BUCKET = "portfolio-images";
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

type Row = MyPortfolioItem & { url?: string };

async function signUrls(items: MyPortfolioItem[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const paths: { id: string; path: string }[] = [];
  for (const it of items) {
    if (/^https?:\/\//i.test(it.image_url)) out[it.id] = it.image_url;
    else paths.push({ id: it.id, path: it.image_url });
  }
  if (paths.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths.map((p) => p.path), 60 * 60 * 24 * 7);
    (data ?? []).forEach((d, i) => { if (d.signedUrl) out[paths[i].id] = d.signedUrl; });
  }
  return out;
}

async function compressImage(file: File): Promise<Blob> {
  // Downscale to max 1920px on long edge; re-encode JPEG @ q=0.85 for non-PNG/WEBP large files.
  if (file.size < 600 * 1024 && file.type !== "image/jpeg") return file; // small enough
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const maxEdge = 1920;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85);
  });
}

export function PortfolioManager() {
  const [state, setState] = useState<MyPortfolioResponse | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [fileOver, setFileOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const r = await getMyPortfolio();
    setState(r);
    setUrls(await signUrls(r.items));
  }

  useEffect(() => { void load(); }, []);

  async function uploadFiles(files: FileList | File[]) {
    if (!state) return;
    const list = Array.from(files);
    const slots = state.max_items - state.total;
    if (slots <= 0) {
      toast.error(
        state.has_subscription
          ? "You've reached the 20 image limit."
          : "Upgrade to increase your portfolio capacity from 10 to 20 images."
      );
      return;
    }
    const accepted = list.slice(0, slots).filter((f) => {
      if (!ALLOWED.includes(f.type)) { toast.error(`${f.name}: only JPG, PNG, WEBP allowed`); return false; }
      if (f.size > MAX_BYTES) { toast.error(`${f.name}: max 8 MB`); return false; }
      return true;
    });
    if (list.length > slots) {
      toast.message(`Only ${slots} more image${slots === 1 ? "" : "s"} fit. The rest were skipped.`);
    }
    if (accepted.length === 0) return;
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) { toast.error("Not signed in"); return; }

    setBusy(true);
    setProgress({ done: 0, total: accepted.length });
    try {
      for (let i = 0; i < accepted.length; i++) {
        const f = accepted[i];
        const blob = await compressImage(f);
        const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
        const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
          contentType: blob.type || f.type,
          cacheControl: "31536000",
          upsert: false,
        });
        if (upErr) { toast.error(`Upload failed: ${upErr.message}`); continue; }
        const res = await addPortfolioImage({ data: { image_url: path } });
        if (!res.ok) {
          await supabase.storage.from(BUCKET).remove([path]);
          if (res.error === "LIMIT_REACHED") {
            toast.error("Portfolio limit reached.");
            break;
          }
        }
        setProgress({ done: i + 1, total: accepted.length });
      }
      await load();
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(item: Row) {
    if (!confirm("Remove this image from your portfolio?")) return;
    try {
      await deletePortfolioItem({ data: { id: item.id } });
      if (!/^https?:\/\//i.test(item.image_url)) {
        await supabase.storage.from(BUCKET).remove([item.image_url]);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  async function commitReorder(items: MyPortfolioItem[]) {
    try {
      await reorderPortfolio({ data: { ordered_ids: items.map((i) => i.id) } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reorder");
      await load();
    }
  }

  function onDropReorder(targetId: string) {
    if (!state || !drag || drag === targetId) return;
    const items = [...state.items];
    const from = items.findIndex((i) => i.id === drag);
    const to = items.findIndex((i) => i.id === targetId);
    if (from === -1 || to === -1) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    setState({ ...state, items });
    void commitReorder(items);
  }

  if (!state) return <p className="text-sm text-ink/60">Loading portfolio…</p>;

  const remaining = state.max_items - state.total;
  const atLimit = remaining <= 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <p className="font-display text-2xl">Portfolio Gallery</p>
          <p className="text-xs text-ink/55 mt-1">
            {state.total} / {state.max_items} Images Used
            {state.has_subscription ? " · ShootBase Pro" : " · Free plan"}
          </p>
        </div>
        {!state.has_subscription && (
          <Link
            to="/pro/credits"
            className="text-[10px] uppercase tracking-widest text-gold border border-gold/40 px-3 py-1.5 hover:bg-gold/10"
          >
            Upgrade to 20
          </Link>
        )}
      </div>

      {atLimit && (
        <p className="text-xs bg-gold/5 border border-gold/30 text-ink/80 px-4 py-3 mb-4">
          {state.has_subscription
            ? `Portfolio limit reached (${state.max_items}/${state.max_items}).`
            : `Portfolio limit reached (${state.max_items}/${state.max_items}). Upgrade to add up to 20 portfolio images.`}
        </p>
      )}


      <div
        onDragOver={(e) => { e.preventDefault(); setFileOver(true); }}
        onDragLeave={() => setFileOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setFileOver(false);
          if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed p-6 text-center mb-5 transition-colors ${
          fileOver ? "border-gold bg-gold/5" : "border-ink/20"
        } ${atLimit ? "opacity-60" : ""}`}
      >
        <p className="text-sm text-ink/70">
          Drag &amp; drop images here, or{" "}
          <button
            type="button"
            disabled={atLimit || busy}
            onClick={() => fileRef.current?.click()}
            className="text-gold underline hover:no-underline disabled:opacity-50"
          >
            browse
          </button>
        </p>
        <p className="text-[11px] text-ink/50 mt-2">JPG, PNG or WEBP · up to 8 MB · {remaining} slot{remaining === 1 ? "" : "s"} left</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
        {progress && (
          <p className="text-[11px] text-ink/60 mt-3">Uploading {progress.done} / {progress.total}…</p>
        )}
      </div>

      {state.items.length === 0 ? (
        <p className="text-sm text-ink/55 italic">No images yet — upload your best work to attract clients.</p>
      ) : (
        <ul className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {state.items.map((it) => {
            const url = urls[it.id];
            const isOver = dragOver === it.id;
            const isDragging = drag === it.id;
            return (
              <li
                key={it.id}
                draggable
                onDragStart={() => setDrag(it.id)}
                onDragEnd={() => { setDrag(null); setDragOver(null); }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(it.id); }}
                onDrop={(e) => { e.preventDefault(); onDropReorder(it.id); setDragOver(null); }}
                className={`relative group bg-ink/5 cursor-move transition-all ${
                  isDragging ? "opacity-40" : ""
                } ${isOver ? "ring-2 ring-gold" : ""}`}
              >
                {url ? (
                  <img src={url} alt={it.caption ?? ""} loading="lazy" className="aspect-square object-cover w-full" />
                ) : (
                  <div className="aspect-square animate-pulse" />
                )}
                {state.items[0]?.id === it.id && (
                  <span className="absolute top-2 left-2 bg-gold text-ink text-[9px] uppercase tracking-widest font-mono px-2 py-1">
                    Cover
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void remove(it)}
                  className="absolute top-2 right-2 bg-paper/95 text-ink text-[10px] uppercase tracking-widest px-2 py-1 opacity-0 group-hover:opacity-100"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!state.has_subscription && (
        <div className="mt-6 rounded-2xl border border-gold/30 bg-gold/5 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink/80">
            Unlock up to <strong>20 portfolio images</strong> with ShootBase Pro.
          </p>
          <Link
            to="/pro/credits"
            className="bg-ink text-paper px-5 py-2 text-[11px] uppercase tracking-widest font-medium hover:bg-gold"
          >
            Upgrade
          </Link>
        </div>
      )}

    </div>
  );
}
