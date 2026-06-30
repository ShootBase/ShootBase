import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { supabase } from "@/integrations/supabase/client";
import { getMyAvatar, removeMyAvatar, setMyAvatar } from "@/lib/marketplace.functions";

type Kind = "logo" | "photo";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/jpg,image/png,image/webp";

async function cropToBlob(srcUrl: string, area: Area): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = srcUrl;
  });
  const size = Math.min(area.width, area.height, 1024);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Crop failed"))), "image/jpeg", 0.9),
  );
}

export function AvatarUploader() {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("logo");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    const v = await getMyAvatar();
    setCurrentUrl(v.url);
    if (v.kind) setKind(v.kind);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(f.type)) {
      setError("Use a JPG, PNG, or WEBP image.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("Image must be 5MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSourceUrl(reader.result as string);
    reader.readAsDataURL(f);
  }

  async function handleSave() {
    if (!sourceUrl || !croppedArea) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await cropToBlob(sourceUrl, croppedArea);
      const { data: session } = await supabase.auth.getUser();
      const userId = session.user?.id;
      if (!userId) throw new Error("Not signed in");
      const path = `${userId}/avatar-${Date.now()}.jpg`;
      const up = await supabase.storage
        .from("professional-avatars")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw up.error;
      await setMyAvatar({ data: { avatar_path: path, avatar_kind: kind } });
      setSourceUrl(null);
      setSavedAt(new Date());
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      await removeMyAvatar();
      setSourceUrl(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-ink/10 p-6">
      <h2 className="font-display text-2xl mb-1">Profile image</h2>
      <p className="text-sm text-ink/60 mb-6">
        Upload a business logo or a professional photo. Profiles with an image earn more enquiries.
      </p>

      <div className="flex items-start gap-6 mb-6 flex-wrap">
        <div className="flex flex-col items-center gap-2">
          {currentUrl ? (
            <img src={currentUrl} alt="Current avatar" className="h-24 w-24 object-cover rounded-full border border-ink/10" />
          ) : (
            <div className="h-24 w-24 rounded-full border border-dashed border-ink/20 grid place-items-center text-xs text-ink/40">
              No image
            </div>
          )}
          <span className="text-[10px] uppercase tracking-widest text-ink/50">Current</span>
        </div>

        <div className="flex-1 min-w-[220px]">
          <p className="text-[10px] uppercase tracking-widest mb-2">Image type</p>
          <div className="flex gap-2 mb-4">
            {(["logo", "photo"] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`text-xs uppercase tracking-widest px-3 py-2 border ${kind === k ? "bg-ink text-paper border-ink" : "border-ink/15 hover:border-gold"}`}
              >
                {k === "logo" ? "Business logo" : "Profile photo"}
              </button>
            ))}
          </div>

          <input
            id="avatar-file"
            type="file"
            accept={ACCEPT}
            onChange={onFileChange}
            className="block text-xs text-ink/70 file:mr-3 file:bg-ink file:text-paper file:border-0 file:px-4 file:py-2 file:text-[10px] file:uppercase file:tracking-widest hover:file:bg-gold"
          />
          <p className="text-[10px] text-ink/50 mt-2">JPG, PNG or WEBP. Max 5MB.</p>
        </div>
      </div>

      {sourceUrl && (
        <div className="mb-6">
          <div className="relative h-64 bg-ink/5 mb-3">
            <Cropper
              image={sourceUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, areaPx) => setCroppedArea(areaPx)}
            />
          </div>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
        </div>
      )}

      {error && <p className="text-xs text-destructive mb-3">{error}</p>}

      <div className="flex items-center gap-3 flex-wrap">
        {sourceUrl && (
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="bg-ink text-paper px-6 py-2 text-xs uppercase tracking-widest font-medium hover:bg-gold disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save image"}
          </button>
        )}
        {sourceUrl && (
          <button
            type="button"
            onClick={() => setSourceUrl(null)}
            disabled={busy}
            className="text-xs uppercase tracking-widest border border-ink/20 px-4 py-2 hover:border-gold"
          >
            Cancel
          </button>
        )}
        {currentUrl && !sourceUrl && (
          <>
            <label
              htmlFor="avatar-file"
              className="text-xs uppercase tracking-widest border border-ink/20 px-4 py-2 hover:border-gold cursor-pointer"
            >
              Replace image
            </label>
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="text-xs uppercase tracking-widest text-destructive hover:underline"
            >
              Remove image
            </button>
          </>
        )}
        {savedAt && <span className="text-xs text-ink/60">Saved {savedAt.toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}
