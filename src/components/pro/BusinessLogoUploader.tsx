import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getProBranding, setProLogoPath, removeProLogo } from "@/lib/invoices.functions";
import { toast } from "sonner";
import { Upload, RefreshCw, Trash2 } from "lucide-react";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/jpg,image/svg+xml,image/webp";

export function BusinessLogoUploader({
  onChange,
}: {
  onChange?: (logoUrl: string | null) => void;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const b = await getProBranding();
        setLogoUrl(b.logo_url);
        onChange?.(b.logo_url);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFile(file: File) {
    if (!["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"].includes(file.type)) {
      toast.error("Use a PNG, JPG, WEBP or SVG image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Logo must be 5MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getUser();
      const userId = session.user?.id;
      if (!userId) throw new Error("Not signed in");
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${userId}/logo-${Date.now()}.${ext}`;
      const up = await supabase.storage
        .from("business-logos")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (up.error) throw up.error;
      const res = await setProLogoPath({ data: { path } });
      setLogoUrl(res.url ?? null);
      onChange?.(res.url ?? null);
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (!confirm("Remove your saved business logo?")) return;
    setBusy(true);
    try {
      await removeProLogo();
      setLogoUrl(null);
      onChange?.(null);
      toast.success("Logo removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="block text-[10px] uppercase tracking-widest text-ink/60 mb-2">Business logo</p>
      <div className="flex items-start gap-4 flex-wrap">
        <div className="h-20 w-32 border border-ink/15 rounded bg-white grid place-items-center overflow-hidden shrink-0">
          {loading ? (
            <span className="text-[10px] text-ink/40">Loading…</span>
          ) : logoUrl ? (
            <img
              src={logoUrl}
              alt="Business logo"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-[10px] text-ink/40">No logo</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            id="business-logo-input"
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <label
            htmlFor="business-logo-input"
            className={`inline-flex items-center gap-2 text-xs px-3 py-2 border rounded cursor-pointer ${
              busy ? "opacity-50 pointer-events-none" : "border-ink/20 hover:border-gold"
            }`}
          >
            {logoUrl ? <RefreshCw className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
            {logoUrl ? "Change logo" : "Upload logo"}
          </label>
          {logoUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="inline-flex items-center gap-2 text-xs px-3 py-2 border border-ink/15 rounded text-red-600 hover:border-red-300 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove logo
            </button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-ink/50 mt-2">
        Upload your business logo once and it will appear on all future invoices by default. PNG, JPG, WEBP or SVG. Max 5MB.
      </p>
    </div>
  );
}
