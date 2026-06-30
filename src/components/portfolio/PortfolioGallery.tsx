import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PortfolioItem = { id: string; image_url: string; caption: string | null };

const BUCKET = "portfolio-images";

async function resolveUrls(items: PortfolioItem[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const paths: { id: string; path: string }[] = [];
  for (const it of items) {
    if (!it.image_url) continue;
    if (/^https?:\/\//i.test(it.image_url)) {
      map[it.id] = it.image_url;
    } else {
      paths.push({ id: it.id, path: it.image_url });
    }
  }
  if (paths.length > 0) {
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths.map((p) => p.path), 60 * 60 * 24 * 7);
    (data ?? []).forEach((d, i) => {
      if (d.signedUrl) map[paths[i].id] = d.signedUrl;
    });
  }
  return map;
}

export function PortfolioGallery({ items, businessName }: { items: PortfolioItem[]; businessName: string }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveUrls(items).then((m) => { if (!cancelled) setUrls(m); });
    return () => { cancelled = true; };
  }, [items]);

  const ordered = useMemo(() => items.filter((i) => urls[i.id]), [items, urls]);

  const close = useCallback(() => setOpenIdx(null), []);
  const next = useCallback(() => setOpenIdx((i) => (i === null ? null : (i + 1) % ordered.length)), [ordered.length]);
  const prev = useCallback(() => setOpenIdx((i) => (i === null ? null : (i - 1 + ordered.length) % ordered.length)), [ordered.length]);

  useEffect(() => {
    if (openIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [openIdx, close, next, prev]);

  if (items.length === 0) return null;

  return (
    <>
      <div
        className="columns-2 md:columns-3 gap-3 [&>*]:mb-3"
        style={{ columnFill: "balance" }}
      >
        {items.map((it, i) => {
          const url = urls[it.id];
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => url && setOpenIdx(i)}
              className="group block w-full overflow-hidden bg-ink/5 break-inside-avoid focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              {url ? (
                <img
                  src={url}
                  alt={it.caption ?? `${businessName} portfolio image ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto block transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                />
              ) : (
                <div className="aspect-[4/5] w-full animate-pulse bg-ink/5" />
              )}
            </button>
          );
        })}
      </div>

      {openIdx !== null && ordered[openIdx] && (
        <Lightbox
          src={urls[ordered[openIdx].id]}
          caption={ordered[openIdx].caption}
          businessName={businessName}
          index={openIdx}
          total={ordered.length}
          onClose={close}
          onNext={next}
          onPrev={prev}
        />
      )}
    </>
  );
}

function Lightbox({
  src, caption, businessName, index, total, onClose, onNext, onPrev,
}: {
  src: string; caption: string | null; businessName: string;
  index: number; total: number;
  onClose: () => void; onNext: () => void; onPrev: () => void;
}) {
  // Basic touch swipe
  const [touchX, setTouchX] = useState<number | null>(null);
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/95 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`Portfolio image ${index + 1} of ${total}`}
      onClick={onClose}
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 50) (dx < 0 ? onNext : onPrev)();
        setTouchX(null);
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-paper/80 text-[10px] uppercase tracking-widest font-mono">
        <span>{index + 1} / {total}</span>
        <button onClick={onClose} className="hover:text-gold">Close ✕</button>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-4 relative">
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label="Previous image"
          className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center text-paper/70 hover:text-gold text-2xl"
        >‹</button>
        <img
          src={src}
          alt={caption ?? `${businessName} portfolio image ${index + 1}`}
          onClick={(e) => e.stopPropagation()}
          className="max-w-full max-h-full object-contain animate-[fadeIn_.18s_ease-out]"
        />
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label="Next image"
          className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center text-paper/70 hover:text-gold text-2xl"
        >›</button>
      </div>
      {caption && (
        <p className="text-center text-paper/80 text-xs px-4 pb-6 italic">{caption}</p>
      )}
    </div>
  );
}
