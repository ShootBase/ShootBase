import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "portfolio-images";

export type StripItem = { id: string; image_url: string; display_order?: number | null };

export function CardPortfolioStrip({
  items,
  coverUrl,
  businessName,
}: {
  items: StripItem[];
  coverUrl: string | null;
  businessName: string;
}) {
  const sorted = [...items].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
  );
  const first3 = sorted.slice(0, 3);
  const extra = Math.max(0, sorted.length - 3);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const paths = first3
      .filter((i) => i.image_url && !/^https?:\/\//i.test(i.image_url))
      .map((i) => ({ id: i.id, path: i.image_url }));
    const httpMap: Record<string, string> = {};
    first3.forEach((i) => {
      if (/^https?:\/\//i.test(i.image_url)) httpMap[i.id] = i.image_url;
    });
    if (paths.length === 0) {
      setUrls(httpMap);
      return;
    }
    let cancelled = false;
    void supabase.storage
      .from(BUCKET)
      .createSignedUrls(
        paths.map((p) => p.path),
        60 * 60 * 24 * 7,
      )
      .then(({ data }) => {
        if (cancelled) return;
        const map = { ...httpMap };
        (data ?? []).forEach((d, i) => {
          if (d.signedUrl) map[paths[i].id] = d.signedUrl;
        });
        setUrls(map);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.id).join(",")]);

  if (first3.length === 0) {
    return (
      <div className="aspect-[4/5] bg-stone-100 overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={businessName}
            loading="lazy"
            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-[10px] uppercase tracking-widest text-ink/30">
            Portfolio
          </div>
        )}
      </div>
    );
  }

  if (first3.length === 1) {
    const url = urls[first3[0].id];
    return (
      <div className="aspect-[4/5] bg-stone-100 overflow-hidden relative">
        {url ? (
          <img
            src={url}
            alt={businessName}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full animate-pulse" />
        )}
      </div>
    );
  }

  // 2 or 3 images: main + stack
  const [main, ...rest] = first3;
  const mainUrl = urls[main.id];
  return (
    <div className="aspect-[4/5] bg-stone-100 overflow-hidden relative grid grid-cols-3 grid-rows-2 gap-1">
      <div className="col-span-2 row-span-2 overflow-hidden bg-stone-100">
        {mainUrl ? (
          <img
            src={mainUrl}
            alt={businessName}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full animate-pulse" />
        )}
      </div>
      {rest.map((it, idx) => {
        const u = urls[it.id];
        const isLast = idx === rest.length - 1;
        return (
          <div key={it.id} className="overflow-hidden bg-stone-100 relative">
            {u ? (
              <img
                src={u}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="w-full h-full animate-pulse" />
            )}
            {isLast && extra > 0 && (
              <div className="absolute inset-0 bg-black/55 grid place-items-center text-paper font-mono text-sm tracking-wider">
                +{extra} more
              </div>
            )}
          </div>
        );
      })}
      {rest.length === 1 && (
        <div className="overflow-hidden bg-stone-100 relative grid place-items-center text-[10px] text-ink/40 uppercase tracking-widest">
          {extra > 0 ? (
            <div className="absolute inset-0 bg-black/55 grid place-items-center text-paper font-mono text-sm tracking-wider">
              +{extra} more
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
