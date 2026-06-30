import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site/Header";
import { DashboardFooter } from "@/components/site/DashboardFooter";
import { ClientMobileNav } from "@/components/site/ClientMobileNav";
import { useRole } from "@/lib/role-context";
import {
  notificationPermission,
  requestNotificationPermission,
  SOUND_PREF_EVENT,
} from "@/lib/notification-sound";
import { TrustBadges } from "@/components/trust/TrustBadges";
import { DeleteAccountSection } from "@/components/account/DeleteAccountDialog";
import { PhoneVerificationCard } from "@/components/account/PhoneVerificationCard";

export const Route = createFileRoute("/_authenticated/account/settings")({
  head: () => ({ meta: [{ title: "Account Settings — Shootbase" }, { name: "robots", content: "noindex" }] }),
  component: AccountSettings,
});

function AccountSettings() {
  const navigate = useNavigate();
  const { loaded, activeRole } = useRole();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<string>("email");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [emailNewMessage, setEmailNewMessage] = useState(true);
  const [soundNewMessage, setSoundNewMessage] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingSound, setSavingSound] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);

  // Pros have their own settings page
  useEffect(() => {
    if (loaded && activeRole === "professional") {
      void navigate({ to: "/pro/settings" });
    }
  }, [loaded, activeRole, navigate]);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;
      setEmail(user.email ?? "");
      // Identify primary provider (e.g., "google" vs "email")
      const providers = user.app_metadata?.providers as string[] | undefined;
      const primary = (user.app_metadata?.provider as string | undefined) ?? providers?.[0] ?? "email";
      setProvider(primary);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone, sound_new_message, verified, verified_phone" as never)
        .eq("id", user.id)
        .maybeSingle();
      setFullName((profile as { full_name?: string | null } | null)?.full_name ?? "");
      setPhone((profile as { phone?: string | null } | null)?.phone ?? "");
      const sound = (profile as { sound_new_message?: boolean } | null)?.sound_new_message;
      if (typeof sound === "boolean") setSoundNewMessage(sound);
      setVerified(Boolean((profile as { verified?: boolean } | null)?.verified) || Boolean(user.email_confirmed_at));
      setVerifiedPhone(Boolean((profile as { verified_phone?: boolean } | null)?.verified_phone));
      const { data: prefs } = await supabase
        .from("client_notification_prefs" as any)
        .select("email_new_message")
        .eq("user_id", user.id)
        .maybeSingle();
      if (prefs && typeof (prefs as any).email_new_message === "boolean") {
        setEmailNewMessage((prefs as any).email_new_message);
      }
      setLoading(false);
    })();
  }, []);

  async function saveNotifPrefs(next: boolean) {
    setEmailNewMessage(next);
    setSavingPrefs(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { error } = await supabase
        .from("client_notification_prefs" as any)
        .upsert({ user_id: uid, email_new_message: next });
      if (error) throw error;
      toast.success("Notification preferences updated");
    } catch (err) {
      setEmailNewMessage(!next);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function saveSoundPref(next: boolean) {
    const previous = soundNewMessage;
    setSoundNewMessage(next);
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
      window.dispatchEvent(
        new CustomEvent(SOUND_PREF_EVENT, { detail: { enabled: next } }),
      );
      if (next && notificationPermission() === "default") {
        void requestNotificationPermission();
      }
      toast.success(next ? "Sound notifications on" : "Sound notifications off");
    } catch (err) {
      setSoundNewMessage(previous);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingSound(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Not signed in");
      // Read the currently-saved phone so we can detect a change and reset
      // verification accordingly. Changing phone in Profile Settings MUST
      // invalidate any prior Twilio verification per spec.
      const { data: existing } = await supabase
        .from("profiles")
        .select("phone, verified_phone" as never)
        .eq("id", uid)
        .maybeSingle();
      const prevPhone = ((existing as { phone?: string | null } | null)?.phone ?? "").trim();
      const wasVerified = !!(existing as { verified_phone?: boolean } | null)?.verified_phone;
      const nextPhone = phone.trim();
      const phoneChanged = nextPhone !== prevPhone;
      const patch: Record<string, unknown> = {
        id: uid,
        full_name: fullName.trim() || null,
        phone: nextPhone || null,
      };
      if (phoneChanged) {
        patch.verified_phone = false;
        patch.phone_verified_at = null;
      }
      const { error } = await supabase.from("profiles").upsert(patch as never);
      if (error) throw error;
      if (phoneChanged && wasVerified) {
        setVerifiedPhone(false);
        toast.success("Phone number updated — please verify the new number before posting jobs.");
      } else {
        toast.success("Profile saved");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.length < 8) return toast.error("Password must be at least 8 characters");
    if (newPwd !== confirmPwd) return toast.error("Passwords do not match");
    setSavingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      toast.success("Password updated");
      setNewPwd("");
      setConfirmPwd("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setSavingPwd(false);
    }
  }

  const inputCls = "w-full border border-ink/20 px-3 py-2 mt-1 bg-white";
  const labelCls = "text-xs uppercase tracking-widest text-ink/60";
  const isOAuthOnly = provider !== "email";

  if (!loaded || activeRole === "professional") {
    return <div className="min-h-screen bg-paper" aria-hidden />;
  }

  return (
    <div className="dashboard-readable bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <button onClick={() => navigate({ to: "/dashboard" })} className="text-xs uppercase tracking-widest text-ink/60 mb-4">← Dashboard</button>
          <h1 className="font-display text-4xl mb-2">Account Settings</h1>
          <p className="text-sm text-ink/60 mb-8">Update your profile and account credentials.</p>

          {loading ? (
            <p className="text-sm text-ink/60">Loading…</p>
          ) : (
            <div className="space-y-8">
              <form onSubmit={saveProfile} className="border border-ink/10 p-6 bg-white space-y-4">
                <h2 className="font-display text-2xl">Profile</h2>
                <label className="block">
                  <span className={labelCls}>Email</span>
                  <input value={email} readOnly disabled className={`${inputCls} bg-ink/5 cursor-not-allowed`} />
                </label>
                <label className="block">
                  <span className={labelCls}>Full name</span>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="Your name" />
                </label>
                <label className="block">
                  <span className={labelCls}>Phone (optional)</span>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="07…" />
                </label>
                <button disabled={savingProfile} className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold disabled:opacity-50">
                  {savingProfile ? "Saving…" : "Save changes"}
                </button>
              </form>

              <div className="border border-ink/10 p-6 bg-white space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-display text-2xl">Verification Center</h2>
                    <p className="text-xs text-ink/60 mt-1">
                      Verified clients get a trust badge that professionals see on every project — helping you get better responses.
                    </p>
                  </div>
                  <TrustBadges verified={verified} phoneVerified={verifiedPhone} size="md" showUnverified />
                </div>

                <div className="border-t border-ink/10 pt-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Email verification</p>
                      <p className="text-xs text-ink/60 mt-0.5">
                        {verified
                          ? "Your email or social sign-in is verified. You appear as a Verified Client."
                          : "Verify your email to become a Verified Client."}
                      </p>
                    </div>
                    {!verified && (
                      <button
                        disabled={resendingEmail}
                        onClick={async () => {
                          setResendingEmail(true);
                          try {
                            const { error } = await supabase.auth.resend({ type: "signup", email });
                            if (error) throw error;
                            toast.success("Verification email sent");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed to resend");
                          } finally {
                            setResendingEmail(false);
                          }
                        }}
                        className="bg-ink text-paper px-4 py-2 text-xs uppercase tracking-widest font-medium hover:bg-gold disabled:opacity-50"
                      >
                        {resendingEmail ? "Sending…" : "Resend Verification Email"}
                      </button>
                    )}
                  </div>

                  <div className="flex items-start justify-between gap-3 flex-wrap border-t border-ink/10 pt-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">Phone verification</p>
                      <p className="text-xs text-ink/60 mt-0.5 mb-3">
                        {verifiedPhone
                          ? "Your phone number is verified. The gold shield badge appears on your projects."
                          : "Verify your phone via a 6-digit code to earn the gold shield Phone Verified badge."}
                      </p>
                      <PhoneVerificationCard
                        initialPhone={phone}
                        verified={verifiedPhone}
                        onVerified={(p) => {
                          setVerifiedPhone(true);
                          setPhone(p);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>


              <div className="border border-ink/10 p-6 bg-white space-y-4">
                <h2 className="font-display text-2xl">Notifications</h2>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailNewMessage}
                    disabled={savingPrefs}
                    onChange={(e) => void saveNotifPrefs(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-gold"
                  />
                  <span>
                    <span className="block text-sm font-medium">Email me when I receive a new message</span>
                    <span className="block text-xs text-ink/60 mt-0.5">
                      We send an instant email for the first unread message, then wait up to 45 minutes before sending another for the same conversation.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={soundNewMessage}
                    disabled={savingSound}
                    onChange={(e) => void saveSoundPref(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-gold"
                  />
                  <span>
                    <span className="block text-sm font-medium">Play a sound when I receive a new message</span>
                    <span className="block text-xs text-ink/60 mt-0.5">
                      A short, subtle chime plays while you're using Shootbase. If you've granted permission, we'll also show a desktop notification when the tab isn't focused.
                    </span>
                  </span>
                </label>
              </div>

              <div className="border border-ink/10 p-6 bg-white space-y-4">
                <h2 className="font-display text-2xl">Password</h2>
                {isOAuthOnly ? (
                  <p className="text-sm text-ink/70">
                    You signed in with <span className="font-medium capitalize">{provider}</span>. Password changes are managed by your {provider} account.
                  </p>
                ) : (
                  <form onSubmit={changePassword} className="space-y-4">
                    <label className="block">
                      <span className={labelCls}>New password</span>
                      <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className={inputCls} minLength={8} required />
                    </label>
                    <label className="block">
                      <span className={labelCls}>Confirm new password</span>
                      <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} className={inputCls} minLength={8} required />
                    </label>
                    <button disabled={savingPwd} className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold disabled:opacity-50">
                      {savingPwd ? "Updating…" : "Update password"}
                    </button>
                  </form>
                )}
              </div>

              <DeleteAccountSection />

            </div>
          )}
        </div>
      </main>
      <DashboardFooter />
      <ClientMobileNav />
    </div>
  );
}
