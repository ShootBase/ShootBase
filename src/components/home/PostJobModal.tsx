import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { postLead, attachInspiration } from "@/lib/leads.functions";
import { getBudgetBands, DURATIONS } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CitySelect } from "@/components/ui/city-select";
import { URGENCY_OPTIONS } from "@/lib/urgency";
import { useRole } from "@/lib/role-context";
import { checkClientAccountExists } from "@/lib/client-account.functions";
import { setAccountType } from "@/lib/marketplace.functions";
import { PhoneVerificationCard } from "@/components/account/PhoneVerificationCard";
import { lovable } from "@/integrations/lovable/index";




type Service = { id: string; name: string; kind: "photography" | "videography"; slug: string };

type Props = {
  services: Service[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialServiceId?: string;
};

const STORAGE_KEY = "postJob:draft";
const STEP_KEY = "postJob:step";

type Draft = {
  service_id: string;
  city: string;
  details: string;
  event_date: string;
  event_time: string;
  flexible_dates: boolean;
  duration: string;
  duration_days: string;
  duration_start_date: string;
  duration_end_date: string;
  duration_consecutive: boolean;
  duration_flexible: boolean;
  budget_band: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  linksRaw: string;
  event_type: string;
  urgency: string;
  allow_extra_pros: boolean;
};

const empty: Draft = {
  service_id: "",
  city: "",
  details: "",
  event_date: "",
  event_time: "",
  flexible_dates: false,
  duration: "",
  duration_days: "",
  duration_start_date: "",
  duration_end_date: "",
  duration_consecutive: false,
  duration_flexible: false,
  budget_band: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  linksRaw: "",
  event_type: "",
  urgency: "",
  allow_extra_pros: false,
};

import { EventTypeSelect } from "@/components/ui/event-type-select";
import { isEventCategory } from "@/lib/event-types";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const MIME_ALLOW = /^(image\/|video\/(mp4|quicktime))/;

const inputCls =
  "w-full border border-ink/15 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-gold rounded-sm";
const labelCls = "text-[10px] uppercase tracking-widest text-ink/60 mb-1.5 block";

export function PostJobModal({ services, open, onOpenChange, initialServiceId }: Props) {
  const navigate = useNavigate();
  const { activeRole } = useRole();
  const dashboardPath = activeRole === "professional" ? "/pro/dashboard" : "/dashboard";
  const jobsListPath = activeRole === "professional" ? "/pro/posted-jobs" : "/dashboard";
  const [form, setForm] = useState<Draft>(empty);
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Inline auth panel state (replaces redirect to /auth)
  type AuthPanel = null | "signup" | "login";
  const [authPanel, setAuthPanel] = useState<AuthPanel>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifyMode, setVerifyMode] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");

  const svc = services.find((s) => s.id === form.service_id);
  const needsEventType = !!svc && /^event\s+(photography|videography)$/i.test(svc.name);
  const ctaLabel = useMemo(() => "Post Job", []);

  // Resume after returning from OAuth (only when the explicit resume flag is set).
  // Without this guard, a stale draft from an abandoned OAuth attempt would
  // auto-open the modal on every subsequent page mount.
  useEffect(() => {
    const resumeFlag = sessionStorage.getItem("postJob:resume");
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (resumeFlag !== "1" || !raw) return;
    try {
      const saved = JSON.parse(raw) as Draft;
      setForm({ ...empty, ...saved });
      const savedStep = Number(sessionStorage.getItem(STEP_KEY) || 3);
      setStep(Math.min(3, Math.max(1, savedStep)));
      onOpenChange(true);
    } catch { /* corrupt draft — clear silently below */ }
    finally {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STEP_KEY);
      sessionStorage.removeItem("postJob:resume");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefill contact details from the signed-in user's profile so verified
  // clients are never asked to re-enter (or re-verify) their phone, and the
  // email field is locked to their account email.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) {
        if (!cancelled) { setIsLoggedIn(false); setAccountEmail(""); setPhoneVerified(false); }
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, phone, verified_phone, phone_verified_at" as never)
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const p = (prof ?? {}) as { full_name?: string | null; phone?: string | null; verified_phone?: boolean | null; phone_verified_at?: string | null };
      const isVerified = !!(p.verified_phone && p.phone && p.phone_verified_at);
      setIsLoggedIn(true);
      setAccountEmail(user.email ?? "");
      setPhoneVerified(isVerified);
      setForm((f) => ({
        ...f,
        contact_email: user.email ?? f.contact_email,
        contact_name: f.contact_name || p.full_name || (user.user_metadata?.full_name as string | undefined) || "",
        contact_phone: f.contact_phone || p.phone || "",
      }));
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Category must always default to "Select Service" — do NOT preselect from caller.
  // The `initialServiceId` prop is intentionally ignored so every entry point
  // (Post a Job, Hero CTAs, Popular Categories) opens a blank form.


  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function parseLinks(raw: string): string[] {
    return raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
  }

  function handleFiles(list: FileList | null) {
    if (!list) return;
    const next: File[] = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) { toast.error(`Max ${MAX_FILES} files`); break; }
      if (f.size > MAX_BYTES) { toast.error(`${f.name} exceeds 10 MB`); continue; }
      if (!MIME_ALLOW.test(f.type)) { toast.error(`${f.name}: only images and mp4/mov`); continue; }
      next.push(f);
    }
    setFiles(next);
  }

  const step1Valid = form.service_id && form.city.trim().length > 0 && !!form.urgency && (!needsEventType || !!form.event_type);
  const step2Valid = form.details.trim().length >= 10 && form.budget_band;
  const effectiveEmail = (isLoggedIn ? accountEmail : form.contact_email).trim();
  const step3Valid = form.contact_name.trim() && effectiveEmail && /^[+\d][\d\s\-()]{6,}$/.test(form.contact_phone.trim());

  function goNext() {
    if (step === 1 && !step1Valid) {
      if (!form.service_id) toast.error("Please select a service category.");
      else if (!form.city.trim()) toast.error("Pick a city");
      else if (needsEventType && !form.event_type) toast.error("Choose your event type");
      else if (!form.urgency) toast.error("Pick how urgent your job is");
      return;
    }
    if (step === 2 && !step2Valid) { toast.error("Describe your project and pick a budget"); return; }
    setStep((s) => Math.min(3, s + 1));
  }

  async function publishJob(userId: string) {
    if (!svc) throw new Error("Pick a category");
    const links = parseLinks(form.linksRaw);
    const title = `${svc.name} — ${form.city}`;
    const job = await postLead({
      data: {
        service_id: form.service_id,
        kind: svc.kind,
        title,
        city: form.city.trim(),
        event_date: form.event_date,
        event_time: form.event_time,
        flexible_dates: form.flexible_dates,
        duration: form.duration,
        duration_days: form.duration === "multi-day" && form.duration_days ? Number(form.duration_days) : null,
        duration_start_date: form.duration === "multi-day" ? form.duration_start_date : "",
        duration_end_date: form.duration === "multi-day" ? form.duration_end_date : "",
        duration_consecutive: form.duration === "multi-day" ? form.duration_consecutive : undefined,
        duration_flexible: form.duration === "multi-day" ? form.duration_flexible : undefined,
        budget_band: form.budget_band,
        details: form.details,
        contact_name: form.contact_name,
        contact_phone: form.contact_phone,
        inspiration_links: links,
        event_type: needsEventType ? form.event_type : "",
        urgency: form.urgency,
        client_display_name: form.contact_name,
        allow_extra_pros: form.allow_extra_pros,
      },
    });

    if (job && "verification_required" in job) {
      // Persist phone so PhoneVerificationCard prefills + server-side
      // verification can validate against the same number.
      if (form.contact_phone.trim()) {
        try { await supabase.from("profiles").update({ phone: form.contact_phone.trim() } as never).eq("id", userId); } catch { /* noop */ }
      }
      setVerifyMode(true);
      toast.error("Please verify your mobile number before posting your job. Professionals need verified contact details before they unlock projects.");
      return;
    }

    if (files.length && job?.id) {
      const uploaded: { storage_path: string; mime_type?: string; size_bytes?: number }[] = [];
      for (const f of files) {
        const path = `${userId}/${job.id}/${crypto.randomUUID()}-${f.name}`;
        const { error } = await supabase.storage.from("job-inspiration").upload(path, f, { contentType: f.type, upsert: false });
        if (error) { toast.error(`Upload failed: ${f.name}`); continue; }
        uploaded.push({ storage_path: path, mime_type: f.type, size_bytes: f.size });
      }
      if (uploaded.length) {
        try { await attachInspiration({ data: { job_id: job.id, files: uploaded } }); } catch { /* non-blocking */ }
      }
    }

    // Persist phone on profile so verification CTA prefills — but NEVER
    // overwrite a saved verified phone with whatever was typed in the form
    // (which may differ and would silently desync verification state).
    if (form.contact_phone.trim() && !phoneVerified) {
      try { await supabase.from("profiles").update({ phone: form.contact_phone.trim() } as never).eq("id", userId); } catch { /* noop */ }
    }

    toast.success("Job posted successfully!");
    setSuccess(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!svc) { setStep(1); toast.error("Pick a category"); return; }
    if (!step2Valid) { setStep(2); toast.error("Add details and budget"); return; }
    if (!step3Valid) {
      if (!form.contact_name.trim() || !form.contact_email.trim()) toast.error("Name and email are required");
      else toast.error("Please enter a valid phone number.");
      return;
    }

    const { data: userRes } = await supabase.auth.getUser();
    if (userRes.user) {
      setSubmitting(true);
      try { await publishJob(userRes.user.id); }
      catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to post job";
        toast.error(msg);
      }
      finally { setSubmitting(false); }
      return;
    }

    // Not signed in — check whether the email is already registered.
    // IMPORTANT: only the email is authoritative for "existing account".
    // Phone matches are fuzzy (trailing-digits) and can collide between
    // unrelated users, so they MUST NOT trigger the "Welcome back" login
    // panel for a brand-new email.
    setSubmitting(true);
    setAuthError(null);
    const normalisedEmail = form.contact_email.trim().toLowerCase();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalisedEmail);
    if (!validEmail) {
      setSubmitting(false);
      toast.error("Please enter a valid email address.");
      return;
    }
    try {
      const res = await checkClientAccountExists({ data: { email: normalisedEmail } });
      setAuthPanel(res.email_exists ? "login" : "signup");
    } catch {
      // On lookup failure, default to signup; the API will surface "already registered".
      setAuthPanel("signup");
    } finally {
      setSubmitting(false);
    }
  }

  // Persist the entire form payload before redirecting to OAuth so we can
  // resume publishing immediately after the provider returns.
  function saveResumeDraft() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form));
      sessionStorage.setItem("postJob:resume", "1");
    } catch { /* quota — non-blocking */ }
  }

  // After successful auth, refresh local "logged in" state and return the
  // user to step 3 so they explicitly click Post Job to publish. We never
  // auto-publish from auth callbacks — only the final Post Job click does.
  async function finishAuthAndReturnToForm() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    try { await setAccountType({ data: { role: "customer" } }); } catch { /* non-blocking */ }
    if (form.contact_phone.trim()) {
      try { await supabase.from("profiles").update({ phone: form.contact_phone.trim() } as never).eq("id", user.id); } catch { /* noop */ }
    }
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name, phone, verified_phone, phone_verified_at" as never)
      .eq("id", user.id)
      .maybeSingle();
    const p = (prof ?? {}) as { full_name?: string | null; phone?: string | null; verified_phone?: boolean | null; phone_verified_at?: string | null };
    setIsLoggedIn(true);
    setAccountEmail(user.email ?? "");
    setPhoneVerified(!!(p.verified_phone && p.phone && p.phone_verified_at));
    setAuthPanel(null);
    setAuthError(null);
    setPassword("");
    setConfirmPassword("");
    setStep(3);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem("postJob:resume");
    toast.success("You're signed in. Review your details and click Post Job to publish.");
  }

  async function handleOAuth(provider: "google" | "apple") {
    setAuthError(null);
    saveResumeDraft();
    try {
      const resumePath = encodeURIComponent("/?postJob=resume");
      const redirectUri = `${window.location.origin}/auth?as=customer&redirect=${resumePath}`;
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: redirectUri });
      if (result.error) {
        setAuthError(`${provider === "google" ? "Google" : "Apple"} sign-in failed. Please try again.`);
        return;
      }
      if (result.redirected) return; // browser is navigating away
      // Same-window session was set — return to form, don't auto-publish.
      await finishAuthAndReturnToForm();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Sign-in failed");
    }
  }

  async function handleSignup() {
    setAuthError(null);
    if (password.length < 6) { setAuthError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setAuthError("Passwords do not match."); return; }
    setSubmitting(true);
    saveResumeDraft();
    try {
      const email = form.contact_email.trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/verified?role=customer`,
          data: { full_name: form.contact_name.trim(), intended_role: "customer" },
        },
      });
      if (error) {
        if (/already registered|already exists|user already/i.test(error.message)) {
          setAuthPanel("login");
          setAuthError("This email is already registered — please sign in.");
        } else {
          setAuthError(error.message);
        }
        return;
      }

      // Ensure session exists before returning to form.
      if (!data.session) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) {
          setAuthError("Account created. Please check your inbox to confirm your email, then sign in to publish your job.");
          return;
        }
      }

      await finishAuthAndReturnToForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-up failed";
      setAuthError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogin() {
    setAuthError(null);
    if (!password) { setAuthError("Enter your password."); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.contact_email.trim(),
        password,
      });
      if (error) {
        setAuthError(/invalid login|invalid credentials/i.test(error.message) ? "Email or password is incorrect." : error.message);
        return;
      }
      await finishAuthAndReturnToForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      setAuthError(msg);
    } finally {
      setSubmitting(false);
    }
  }




  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSuccess(false); }}>
      <DialogContent className="w-[calc(100%-1rem)] sm:w-full max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto p-0 rounded-lg">
        {verifyMode && !success ? (
          <div className="p-6 sm:p-8 md:p-10 relative">
            <button
              type="button"
              aria-label="Close"
              onClick={() => { setVerifyMode(false); onOpenChange(false); }}
              className="absolute top-3 right-3 text-ink/40 hover:text-ink text-xl leading-none w-8 h-8 flex items-center justify-center"
            >
              ×
            </button>
            <div className="text-center mb-5">
              <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-gold/10 border border-gold/40 flex items-center justify-center text-3xl">📱</div>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">Verify your mobile number</h2>
              <p className="text-sm text-ink/70 max-w-md mx-auto">
                Please verify your mobile number before posting your job. Professionals need verified contact details before they unlock projects.
              </p>
            </div>
            <PhoneVerificationCard
              initialPhone={form.contact_phone}
              verified={phoneVerified}
              onVerified={async () => {
                // Per spec: auto-resume the interrupted Post Project action
                // after successful phone verification — do NOT make the user
                // click Post Job again.
                setPhoneVerified(true);
                setVerifyMode(false);
                toast.success("✅ Mobile number verified successfully. Publishing your project…");
                const { data: userRes } = await supabase.auth.getUser();
                if (!userRes.user) { setStep(3); return; }
                setSubmitting(true);
                try { await publishJob(userRes.user.id); }
                catch (err) {
                  const msg = err instanceof Error ? err.message : "Failed to post job";
                  toast.error(msg);
                  setStep(3);
                } finally { setSubmitting(false); }
              }}
            />
          </div>
        ) : success ? (
          <div className="p-6 sm:p-8 md:p-10 relative">
            <button
              type="button"
              aria-label="Close"
              onClick={() => { setSuccess(false); onOpenChange(false); navigate({ to: dashboardPath }); }}
              className="absolute top-3 right-3 text-ink/40 hover:text-ink text-xl leading-none w-8 h-8 flex items-center justify-center"
            >
              ×
            </button>
            <div className="text-center">
              <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-3xl">✅</div>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-3">Your job is now live</h2>
              <p className="text-sm text-ink/70 max-w-md mx-auto mb-6">
                Professionals can now start sending quotes for your project.
              </p>
            </div>

            {!phoneVerified && (
              <div className="border border-gold/30 bg-gold/5 rounded-lg p-4 sm:p-5 mb-6">
                <h3 className="font-display text-lg font-semibold mb-1">Verify your phone number</h3>
                <p className="text-xs text-ink/65 mb-3">
                  Verified clients receive more responses from professionals and build greater trust.
                </p>
                <PhoneVerificationCard
                  initialPhone={form.contact_phone}
                  verified={phoneVerified}
                  onVerified={() => setPhoneVerified(true)}
                />
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => { setSuccess(false); setForm(empty); setFiles([]); setStep(1); setPassword(""); setConfirmPassword(""); setAuthPanel(null); onOpenChange(false); navigate({ to: dashboardPath }); }}
                className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-bold hover:bg-gold transition-colors"
              >
                {phoneVerified ? "Go to Dashboard" : "Verify Later"}
              </button>
              <button
                type="button"
                onClick={() => { setSuccess(false); setForm(empty); setFiles([]); setStep(1); onOpenChange(false); navigate({ to: jobsListPath, hash: activeRole === "professional" ? undefined : "my-jobs" } as any); }}
                className="border border-ink/20 px-6 py-3 text-xs uppercase tracking-widest font-bold hover:border-gold transition-colors"
              >
                View My Jobs
              </button>
            </div>
          </div>

        ) : authPanel ? (
          <div className="p-6 sm:p-8 md:p-10 relative">
            <button
              type="button"
              aria-label="Back to form"
              onClick={() => { setAuthPanel(null); setAuthError(null); setPassword(""); setConfirmPassword(""); }}
              className="absolute top-3 left-3 text-ink/50 hover:text-ink text-xs uppercase tracking-widest"
            >
              ← Back
            </button>
            {authPanel === "signup" ? (
              <div className="mt-4">
                <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">Create your Shootbase account</h2>
                <p className="text-sm text-ink/70 mb-6">
                  Continue with Google or Apple — or create a password. Your job details are saved.
                </p>
                <SocialAuthButtons onPick={handleOAuth} disabled={submitting} />
                <OrDivider />
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>Email</label>
                    <input value={form.contact_email} disabled className={`${inputCls} bg-ink/5`} />
                  </div>
                  <div>
                    <label className={labelCls}>Password *</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="At least 6 characters" />
                  </div>
                  <div>
                    <label className={labelCls}>Confirm password *</label>
                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} placeholder="Re-enter your password" />
                  </div>
                  {authError && <p className="text-xs text-destructive">{authError}</p>}
                  <button
                    type="button"
                    onClick={handleSignup}
                    disabled={submitting}
                    className="w-full bg-gold text-white px-6 py-3 text-xs uppercase tracking-widest font-bold hover:bg-ink transition-colors disabled:opacity-50"
                  >
                    {submitting ? "Creating account…" : "Create Account & Post Job"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">Welcome back</h2>
                <p className="text-sm text-ink/70 mb-6">
                  We found an existing Shootbase account for this email. Continue with one click — your job details are saved.
                </p>
                <SocialAuthButtons onPick={handleOAuth} disabled={submitting} />
                <OrDivider />
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>Email</label>
                    <input value={form.contact_email} disabled className={`${inputCls} bg-ink/5`} />
                  </div>
                  <div>
                    <label className={labelCls}>Password *</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="Your password" />
                  </div>
                  {authError && <p className="text-xs text-destructive">{authError}</p>}
                  <button
                    type="button"
                    onClick={handleLogin}
                    disabled={submitting}
                    className="w-full bg-gold text-white px-6 py-3 text-xs uppercase tracking-widest font-bold hover:bg-ink transition-colors disabled:opacity-50"
                  >
                    {submitting ? "Signing in…" : "Sign In & Post Job"}
                  </button>
                  <div className="text-center">
                    <a href="/auth_/forgot" className="text-xs text-ink/60 hover:text-gold underline">Forgot password?</a>
                  </div>
                </div>
              </div>
            )}

          </div>
        ) : (
        <div className="p-4 sm:p-6 md:p-8">
          <DialogHeader className="mb-2">
            <DialogTitle className="font-display text-lg sm:text-2xl md:text-3xl text-balance leading-tight">
              Post a Job, get quotes from photographers &amp; videographers near you
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Tell us what you need. We'll match you with available professionals
            </DialogDescription>
          </DialogHeader>


          {/* Step indicator */}
          <div className="flex items-center gap-2 my-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex-1 flex items-center gap-2">
                <div className={`h-1.5 flex-1 rounded-full transition-colors ${n <= step ? "bg-gold" : "bg-ink/10"}`} />
              </div>
            ))}
            <span className="text-[10px] font-mono uppercase tracking-widest text-ink/60 ml-2">
              Step {step}/3
            </span>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            {step === 1 && (
              <>
                <div>
                  <label className={labelCls}>Category *</label>
                  <select required value={form.service_id} onChange={(e) => set("service_id", e.target.value)} className={inputCls}>
                    <option value="">Select Service</option>
                    <optgroup label="Photography">
                      {services.filter((s) => s.kind === "photography").map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Videography">
                      {services.filter((s) => s.kind === "videography").map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>City *</label>
                  <CitySelect value={form.city} onChange={(v) => set("city", v)} required />
                </div>
                {needsEventType && (
                  <div className="border border-gold/40 bg-gold/5 p-3 rounded-sm">
                    <label className={labelCls}>Event type *</label>
                    <EventTypeSelect value={form.event_type} onChange={(v) => set("event_type", v)} />
                  </div>
                )}
                <div>
                  <label className={labelCls}>How urgent is this? *</label>
                  <select required value={form.urgency} onChange={(e) => set("urgency", e.target.value)} className={inputCls}>
                    <option value="">Select urgency…</option>
                    {URGENCY_OPTIONS.map((u) => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Event date</label>
                    <input type="date" value={form.event_date} onChange={(e) => set("event_date", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Time</label>
                    <input type="time" value={form.event_time} onChange={(e) => set("event_time", e.target.value)} className={inputCls} />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.flexible_dates} onChange={(e) => set("flexible_dates", e.target.checked)} className="h-4 w-4 accent-gold" />
                  <span className="text-sm">My dates are flexible</span>
                </label>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <label className={labelCls}>Describe what you need help with *</label>
                  <textarea required minLength={10} rows={4} value={form.details} onChange={(e) => set("details", e.target.value)} className={inputCls} placeholder="Style, deliverables, anything important about the shoot…" />
                </div>
                <div>
                  <label className={labelCls}>Duration</label>
                  <div className="flex flex-wrap gap-2">
                    {DURATIONS.map((d) => (
                      <button type="button" key={d.id} onClick={() => set("duration", form.duration === d.id ? "" : d.id)}
                        className={`text-xs px-4 py-2 border rounded-sm transition-colors ${form.duration === d.id ? "border-gold bg-gold/10 text-ink" : "border-ink/15 hover:border-ink/40"}`}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                  {form.duration === "multi-day" && (
                    <div className="mt-3 border border-ink/10 bg-ink/[0.02] p-3 rounded-sm space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className={labelCls}>Number of days</label>
                          <input type="number" min={2} max={365} value={form.duration_days} onChange={(e) => set("duration_days", e.target.value)} className={inputCls} placeholder="e.g. 3" />
                        </div>
                        <div>
                          <label className={labelCls}>Start date</label>
                          <input type="date" value={form.duration_start_date} onChange={(e) => set("duration_start_date", e.target.value)} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>End date</label>
                          <input type="date" value={form.duration_end_date} onChange={(e) => set("duration_end_date", e.target.value)} className={inputCls} />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="checkbox" checked={form.duration_consecutive} onChange={(e) => set("duration_consecutive", e.target.checked)} className="h-4 w-4 accent-gold" />
                          Consecutive days
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="checkbox" checked={form.duration_flexible} onChange={(e) => set("duration_flexible", e.target.checked)} className="h-4 w-4 accent-gold" />
                          Flexible schedule
                        </label>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Budget *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {getBudgetBands().map((b) => (
                      <button type="button" key={b.id} onClick={() => set("budget_band", b.id)}
                        className={`text-xs px-3 py-2.5 border rounded-sm text-left transition-colors ${form.budget_band === b.id ? "border-gold bg-gold/10" : "border-ink/15 hover:border-ink/40"}`}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Name *</label>
                    <input required value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} className={inputCls} placeholder="Your name" />
                  </div>
                  <div>
                    <label className={labelCls}>Email *</label>
                    <input
                      required
                      type="email"
                      value={isLoggedIn ? (accountEmail || form.contact_email) : form.contact_email}
                      onChange={(e) => { if (!isLoggedIn) set("contact_email", e.target.value); }}
                      readOnly={isLoggedIn}
                      disabled={isLoggedIn}
                      className={`${inputCls} ${isLoggedIn ? "bg-ink/5 cursor-not-allowed" : ""}`}
                      placeholder="you@example.com"
                    />
                    {isLoggedIn && (
                      <p className="text-[11px] text-ink/55 mt-1">This is the email address where you'll receive ShootBase notifications.</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Phone *{phoneVerified && <span className="ml-2 text-emerald-700 normal-case tracking-normal">✅ Mobile verified</span>}</label>
                    <input
                      required
                      type="tel"
                      value={form.contact_phone}
                      onChange={(e) => { if (!phoneVerified) set("contact_phone", e.target.value); }}
                      readOnly={phoneVerified}
                      className={`${inputCls} ${phoneVerified ? "bg-emerald-50/50 cursor-not-allowed" : ""}`}
                      placeholder="07…"
                    />
                    {phoneVerified && (
                      <p className="text-[11px] text-ink/55 mt-1">To change this number, update it in Account Settings (you'll need to re-verify).</p>
                    )}
                  </div>
                </div>
                {!phoneVerified && (
                  <p className="text-[11px] text-ink/55 -mt-2">
                    Your mobile number must be verified before your job goes live. Professionals only see verified contact details after unlocking.
                  </p>
                )}


                <label className="flex items-start gap-2 text-xs text-ink/70 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.allow_extra_pros}
                    onChange={(e) => set("allow_extra_pros", e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-ink">⭐ Allow more than 5 professionals to contact me</span>
                    <span className="block text-[11px] text-ink/55">Premium option — keeps your job open to more pros after the standard 5-pro cap is reached.</span>
                  </span>
                </label>

                <div className="border-t border-ink/10 pt-5 space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-gold">Upload inspiration (optional)</p>
                  <div>
                    <label className={labelCls}>Images or short videos (max 5, 10 MB each)</label>
                    <input type="file" multiple accept="image/*,video/mp4,video/quicktime"
                      onChange={(e) => handleFiles(e.target.files)}
                      className="text-sm file:mr-3 file:border file:border-ink/20 file:bg-white file:px-3 file:py-1.5 file:text-xs file:uppercase file:tracking-widest file:hover:border-gold" />
                    {files.length > 0 && (
                      <ul className="mt-2 text-xs text-ink/60 space-y-1">
                        {files.map((f, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span className="truncate">{f.name}</span>
                            <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-ink/40 hover:text-destructive">remove</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Or paste reference links</label>
                    <input value={form.linksRaw} onChange={(e) => set("linksRaw", e.target.value)} className={inputCls} placeholder="https://instagram.com/…, https://youtube.com/…" />
                  </div>
                </div>
              </>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-ink/10">
              {step > 1 ? (
                <button type="button" onClick={() => setStep((s) => Math.max(1, s - 1))}
                  className="text-xs uppercase tracking-widest border border-ink/20 px-5 py-2.5 hover:border-gold transition-colors">
                  ← Back
                </button>
              ) : <div />}

              {step < 3 ? (
                <button type="button" onClick={goNext}
                  className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-bold hover:bg-gold transition-colors">
                  Next →
                </button>
              ) : (
                <button id="post-job-submit" type="submit" disabled={submitting}
                  className="bg-gold text-white px-6 py-3 text-xs uppercase tracking-widest font-bold hover:bg-ink transition-colors disabled:opacity-50">
                  {submitting ? "Posting…" : ctaLabel}
                </button>
              )}
            </div>
          </form>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SocialAuthButtons({ onPick, disabled }: { onPick: (p: "google" | "apple") => void; disabled?: boolean }) {
  return (
    <div className="space-y-2.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPick("google")}
        className="w-full flex items-center justify-center gap-3 border border-ink/20 bg-white px-4 py-3 text-sm font-medium hover:border-gold transition-colors disabled:opacity-50 rounded-sm"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        Continue with Google
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPick("apple")}
        className="w-full flex items-center justify-center gap-3 bg-black text-white px-4 py-3 text-sm font-medium hover:bg-ink transition-colors disabled:opacity-50 rounded-sm"
      >
        <svg className="w-5 h-5" viewBox="0 0 384 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true">
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM256.4 113.7c30.2-35.8 27.4-68.4 26.5-80.2-26.6 1.5-57.5 18.1-75.1 38.5-19.4 21.9-30.8 49-28.4 79.6 28.8 2.2 55.1-12.6 77-37.9z" />
        </svg>
        Continue with Apple
      </button>
    </div>
  );
}

function OrDivider() {
  return (
    <div className="flex items-center gap-3 my-5 text-[10px] uppercase tracking-widest text-ink/40">
      <span className="flex-1 h-px bg-ink/10" /> or <span className="flex-1 h-px bg-ink/10" />
    </div>
  );
}

