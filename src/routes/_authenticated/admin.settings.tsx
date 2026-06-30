import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getAdminSettings, updateAdminSettings } from "@/lib/admin.functions";
import { getAdminOnboardingVideo, upsertOnboardingVideo, type OnboardingVideo } from "@/lib/onboarding.functions";
import { getPlatformSettings, updateSupportEmail } from "@/lib/platform-settings.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [{ title: "Admin settings — Shootbase" }, { name: "robots", content: "noindex" }] }),
  component: AdminSettings,
});

type VideoForm = {
  id?: string;
  title: string;
  subtitle: string;
  kind: "youtube" | "vimeo" | "mp4" | "url";
  url: string;
  thumbnail_url: string;
  duration_label: string;
  enabled: boolean;
};

const DEFAULT_VIDEO: VideoForm = {
  title: "How to Build a Profile That Wins More Clients",
  subtitle: "Learn how to optimise your ShootBase profile to increase visibility, build trust, and receive more enquiries.",
  kind: "youtube",
  url: "",
  thumbnail_url: "",
  duration_label: "",
  enabled: true,
};

function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ unlock_cost: 8, welcome_bonus: 5, lead_expiry_days: 7, priority_radius_miles: 50 });
  const [video, setVideo] = useState<VideoForm>(DEFAULT_VIDEO);
  const [savingVideo, setSavingVideo] = useState(false);
  const [supportEmail, setSupportEmail] = useState("info@shootbase.co.uk");
  const [savingSupportEmail, setSavingSupportEmail] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const s = await getAdminSettings();
        setForm({
          unlock_cost: s.unlock_cost,
          welcome_bonus: s.welcome_bonus,
          lead_expiry_days: s.lead_expiry_days,
          priority_radius_miles: (s as any).priority_radius_miles ?? 50,
        });

        const v = (await getAdminOnboardingVideo()) as OnboardingVideo | null;
        if (v) {
          setVideo({
            id: v.id,
            title: v.title,
            subtitle: v.subtitle,
            kind: v.kind,
            url: v.url,
            thumbnail_url: v.thumbnail_url ?? "",
            duration_label: v.duration_label ?? "",
            enabled: v.enabled,
          });
        }
        try {
          const ps = await getPlatformSettings();
          setSupportEmail(ps.support_email);
        } catch {
          // settings.manage permission not granted — leave default
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateAdminSettings({ data: form });
      toast.success("Settings updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveVideo(e: React.FormEvent) {
    e.preventDefault();
    setSavingVideo(true);
    try {
      await upsertOnboardingVideo({ data: video });
      toast.success("Training video updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingVideo(false);
    }
  }

  async function onSaveSupportEmail(e: React.FormEvent) {
    e.preventDefault();
    const value = supportEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setSavingSupportEmail(true);
    try {
      await updateSupportEmail({ data: { support_email: value } });
      toast.success("Support email updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingSupportEmail(false);
    }
  }

  return (
    <div className="bg-paper">
      <div className="max-w-2xl mx-auto px-2 py-2 space-y-10">
        <div>
          <h1 className="font-display text-4xl mb-2">Admin settings</h1>
          <p className="text-sm text-ink/60 mb-8">Control coins, project expiry, support contact, and onboarding content.</p>

          {loading ? (
            <p className="text-sm text-ink/60">Loading…</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4 border border-ink/10 p-6 bg-white">
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-ink/60">Unlock cost (coins)</span>
                <input
                  type="number" min={1} required
                  value={form.unlock_cost}
                  onChange={(e) => setForm({ ...form, unlock_cost: parseInt(e.target.value || "0", 10) })}
                  className="w-full border border-ink/20 px-3 py-2 mt-1"
                />
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-ink/60">Welcome bonus (coins)</span>

                <input
                  type="number" min={0} required
                  value={form.welcome_bonus}
                  onChange={(e) => setForm({ ...form, welcome_bonus: parseInt(e.target.value || "0", 10) })}
                  className="w-full border border-ink/20 px-3 py-2 mt-1"
                />
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-ink/60">Project expiry (days)</span>
                <input
                  type="number" min={1} max={365} required
                  value={form.lead_expiry_days}
                  onChange={(e) => setForm({ ...form, lead_expiry_days: parseInt(e.target.value || "0", 10) })}
                  className="w-full border border-ink/20 px-3 py-2 mt-1"
                />
                <span className="text-xs text-ink/50 mt-1 block">Applies to projects posted after this change.</span>
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-ink/60">Priority radius (miles)</span>
                <input
                  type="number" min={5} max={500} required
                  value={form.priority_radius_miles}
                  onChange={(e) => setForm({ ...form, priority_radius_miles: parseInt(e.target.value || "0", 10) })}
                  className="w-full border border-ink/20 px-3 py-2 mt-1"
                />
                <span className="text-xs text-ink/50 mt-1 block">
                  Professionals within this distance see new projects ranked higher and receive priority notifications. Projects remain visible nationwide.
                </span>
              </label>

              <button disabled={saving} className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold disabled:opacity-50">
                {saving ? "Saving…" : "Save settings"}
              </button>
            </form>
          )}
        </div>

        {!loading && (
          <div>
            <h2 className="font-display text-2xl mb-2">Support email</h2>
            <p className="text-sm text-ink/60 mb-6">
              All new support tickets trigger a notification to this address. Only Super Admins can change it.
            </p>
            <form onSubmit={onSaveSupportEmail} className="space-y-4 border border-ink/10 p-6 bg-white">
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-ink/60">Support email</span>
                <input
                  type="email"
                  required
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="info@shootbase.co.uk"
                  className="w-full border border-ink/20 px-3 py-2 mt-1"
                />
              </label>
              <button
                disabled={savingSupportEmail}
                className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold disabled:opacity-50"
              >
                {savingSupportEmail ? "Saving…" : "Save support email"}
              </button>
            </form>
          </div>
        )}


        {!loading && (
          <div>
            <h2 className="font-display text-2xl mb-2">Pro onboarding training video</h2>
            <p className="text-sm text-ink/60 mb-6">Shown inside the "Welcome to ShootBase" panel on the Professional Dashboard.</p>
            <form onSubmit={onSaveVideo} className="space-y-4 border border-ink/10 p-6 bg-white">
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-ink/60">Title</span>
                <input value={video.title} onChange={(e) => setVideo({ ...video, title: e.target.value })} required className="w-full border border-ink/20 px-3 py-2 mt-1" />
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-ink/60">Subtitle</span>
                <textarea value={video.subtitle} onChange={(e) => setVideo({ ...video, subtitle: e.target.value })} rows={2} required className="w-full border border-ink/20 px-3 py-2 mt-1" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs uppercase tracking-widest text-ink/60">Source</span>
                  <select
                    value={video.kind}
                    onChange={(e) => setVideo({ ...video, kind: e.target.value as VideoForm["kind"] })}
                    className="w-full border border-ink/20 px-3 py-2 mt-1 bg-white"
                  >
                    <option value="youtube">YouTube</option>
                    <option value="vimeo">Vimeo</option>
                    <option value="mp4">MP4 file</option>
                    <option value="url">Hosted URL</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs uppercase tracking-widest text-ink/60">Duration label</span>
                  <input value={video.duration_label} onChange={(e) => setVideo({ ...video, duration_label: e.target.value })} placeholder="e.g. 2:14" className="w-full border border-ink/20 px-3 py-2 mt-1" />
                </label>
              </div>
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-ink/60">Video URL</span>
                <input value={video.url} onChange={(e) => setVideo({ ...video, url: e.target.value })} required placeholder="https://…" className="w-full border border-ink/20 px-3 py-2 mt-1" />
                <span className="text-xs text-ink/50 mt-1 block">YouTube/Vimeo full URL, MP4 link, or any embeddable URL.</span>
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-ink/60">Thumbnail URL (optional)</span>
                <input value={video.thumbnail_url} onChange={(e) => setVideo({ ...video, thumbnail_url: e.target.value })} placeholder="https://…" className="w-full border border-ink/20 px-3 py-2 mt-1" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={video.enabled} onChange={(e) => setVideo({ ...video, enabled: e.target.checked })} />
                <span>Show video on professional dashboard</span>
              </label>
              <button disabled={savingVideo} className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold disabled:opacity-50">
                {savingVideo ? "Saving…" : video.id ? "Update video" : "Save video"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
