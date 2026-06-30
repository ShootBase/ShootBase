import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProShell } from "@/components/site/ProShell";
import { AvatarUploader } from "@/components/pro/AvatarUploader";
import { getMyLeadPrefs, updateMyLeadPrefs } from "@/lib/lead-notifications.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  notificationPermission,
  requestNotificationPermission,
  SOUND_PREF_EVENT,
} from "@/lib/notification-sound";
import { toast } from "sonner";
import { DeleteAccountSection } from "@/components/account/DeleteAccountDialog";

export const Route = createFileRoute("/_authenticated/pro/settings")({
  head: () => ({ meta: [{ title: "Settings — Shootbase" }, { name: "robots", content: "noindex" }] }),
  component: SettingsPage,
});

type Mode = "instant" | "daily" | "weekly" | "off";

function SettingsPage() {
  const [mode, setMode] = useState<Mode>("instant");
  const [inapp, setInapp] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sound, setSound] = useState(true);
  const [savingSound, setSavingSound] = useState(false);

  useEffect(() => {
    void getMyLeadPrefs().then((p) => {
      if (p.hasProfile) {
        setMode(p.lead_email_mode);
        setInapp(p.lead_inapp_enabled);
      }
      setLoaded(true);
    });
    void (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("sound_new_message" as never)
        .eq("id", uid)
        .maybeSingle();
      const s = (prof as { sound_new_message?: boolean } | null)?.sound_new_message;
      if (typeof s === "boolean") setSound(s);
    })();
  }, []);

  async function save(nextMode: Mode, nextInapp: boolean) {
    setSaving(true);
    try {
      await updateMyLeadPrefs({ data: { lead_email_mode: nextMode, lead_inapp_enabled: nextInapp } });
      toast.success("Notification preferences updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function saveSound(next: boolean) {
    const prev = sound;
    setSound(next);
    setSavingSound(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({ sound_new_message: next } as never)
        .eq("id", uid);
      if (error) throw error;
      window.dispatchEvent(new CustomEvent(SOUND_PREF_EVENT, { detail: { enabled: next } }));
      if (next && notificationPermission() === "default") {
        void requestNotificationPermission();
      }
      toast.success(next ? "Sound notifications on" : "Sound notifications off");
    } catch (e) {
      setSound(prev);
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingSound(false);
    }
  }

  function pick(next: Mode) {
    setMode(next);
    void save(next, inapp);
  }
  function toggleInapp() {
    const next = !inapp;
    setInapp(next);
    void save(mode, next);
  }

  const options: { id: Mode; title: string; desc: string }[] = [
    { id: "instant", title: "Instant", desc: "Notify me right away about every matching project (recommended)." },
    { id: "daily", title: "Daily digest", desc: "One summary email per day with all my matching projects." },
    { id: "weekly", title: "Weekly digest", desc: "One summary email every Monday." },
    { id: "off", title: "Off", desc: "Don't email me about new projects. I'll check the marketplace myself." },
  ];

  return (
    <ProShell>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-display text-4xl mb-2">Settings</h1>
        <p className="text-sm text-ink/60 mb-10">Manage your professional profile and preferences.</p>

        <div id="avatar" className="mb-6">
          <AvatarUploader />
        </div>

        <section id="notifications" className="border border-ink/10 p-6 mb-6">
          <h2 className="font-display text-2xl mb-1">Project notifications</h2>
          <p className="text-sm text-ink/60 mb-5">
            Choose how we tell you about new projects that match your selected services and city.
          </p>

          <fieldset disabled={!loaded || saving} className="space-y-3 mb-6">
            {options.map((o) => (
              <label
                key={o.id}
                className={`flex items-start gap-3 border p-4 cursor-pointer transition ${
                  mode === o.id ? "border-gold bg-gold/5" : "border-ink/10 hover:border-ink/30"
                }`}
              >
                <input
                  type="radio"
                  name="lead-email-mode"
                  value={o.id}
                  checked={mode === o.id}
                  onChange={() => pick(o.id)}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-sm">{o.title}</p>
                  <p className="text-xs text-ink/60 mt-0.5">{o.desc}</p>
                </div>
              </label>
            ))}
          </fieldset>

          <label className="flex items-center justify-between gap-3 border border-ink/10 p-4">
            <div>
              <p className="font-medium text-sm">In-app notifications</p>
              <p className="text-xs text-ink/60 mt-0.5">Show a bell badge when a matching project arrives.</p>
            </div>
            <input
              type="checkbox"
              checked={inapp}
              disabled={!loaded || saving}
              onChange={toggleInapp}
              className="h-5 w-5 accent-gold"
            />
          </label>
        </section>

        <section className="border border-ink/10 p-6 mb-6">
          <h2 className="font-display text-2xl mb-1">Message notifications</h2>
          <p className="text-sm text-ink/60 mb-5">
            Play a subtle chime when a new message arrives in any of your conversations.
          </p>
          <label className="flex items-center justify-between gap-3 border border-ink/10 p-4">
            <div>
              <p className="font-medium text-sm">Play sound for new messages</p>
              <p className="text-xs text-ink/60 mt-0.5">
                Short, soft chime. If you grant permission, we'll also show a desktop notification when the tab isn't focused.
              </p>
            </div>
            <input
              type="checkbox"
              checked={sound}
              disabled={savingSound}
              onChange={(e) => void saveSound(e.target.checked)}
              className="h-5 w-5 accent-gold"
            />
          </label>
        </section>

        <div className="grid gap-4">
          <Link to="/pro/onboarding" className="block border border-ink/10 p-5 hover:border-gold transition-colors">
            <p className="font-display text-lg">Edit profile</p>
            <p className="text-xs text-ink/60 mt-1">Business name, services and portfolio.</p>
          </Link>
          <Link to="/pro/credits" className="block border border-ink/10 p-5 hover:border-gold transition-colors">
            <p className="font-display text-lg">Coins & billing</p>
            <p className="text-xs text-ink/60 mt-1">Buy coins and view transaction history.</p>
          </Link>

        </div>

        <div className="mt-8">
          <DeleteAccountSection />
        </div>

      </div>
    </ProShell>
  );
}
