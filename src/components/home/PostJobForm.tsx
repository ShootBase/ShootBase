import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { postLead, attachInspiration } from "@/lib/leads.functions";
import { getBudgetBands, DURATIONS } from "@/lib/format";
import { CitySelect } from "@/components/ui/city-select";
import { EventTypeSelect } from "@/components/ui/event-type-select";
import { isEventCategory } from "@/lib/event-types";
import { URGENCY_OPTIONS } from "@/lib/urgency";

type Service = { id: string; name: string; kind: "photography" | "videography"; slug: string };

type Props = { services: Service[] };

const STORAGE_KEY = "postJob:draft";

type Draft = {
  service_id: string;
  city: string;
  details: string;
  event_date: string;
  event_time: string;
  flexible_dates: boolean;
  duration: string;
  budget_band: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  inspiration_links: string[];
  linksRaw: string;
  event_type: string;
  urgency: string;
  remote_ok: boolean;
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
  budget_band: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  inspiration_links: [],
  linksRaw: "",
  event_type: "",
  urgency: "",
  remote_ok: false,
  allow_extra_pros: false,
};

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const MIME_ALLOW = /^(image\/|video\/(mp4|quicktime))/;

export function PostJobForm({ services }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = useState<Draft>(empty);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [autoSubmit, setAutoSubmit] = useState(false);

  const svc = services.find((s) => s.id === form.service_id);
  const needsEventType = isEventCategory(svc?.name);
  const ctaLabel = useMemo(() => "Post Job", []);

  // Prefill from the signed-in user's profile so verified clients are never
  // asked to re-enter their phone and the email is locked to their account.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) { if (!cancelled) { setIsLoggedIn(false); setAccountEmail(""); setPhoneVerified(false); } return; }
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, phone, verified_phone, phone_verified_at" as never)
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const p = (prof ?? {}) as { full_name?: string | null; phone?: string | null; verified_phone?: boolean | null; phone_verified_at?: string | null };
      setIsLoggedIn(true);
      setAccountEmail(user.email ?? "");
      setPhoneVerified(!!(p.verified_phone && p.phone && p.phone_verified_at));
      setForm((f) => ({
        ...f,
        contact_email: user.email ?? f.contact_email,
        contact_name: f.contact_name || p.full_name || "",
        contact_phone: f.contact_phone || p.phone || "",
      }));
    })();
    return () => { cancelled = true; };
  }, []);

  // Resume after login: rehydrate draft and mark for auto-submit if signed in.
  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Draft;
      setForm({ ...empty, ...saved });
      sessionStorage.removeItem(STORAGE_KEY);
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) setAutoSubmit(true);
      });
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Fire the auto-submit once the form has rendered with the rehydrated draft.
  useEffect(() => {
    if (!autoSubmit) return;
    setAutoSubmit(false);
    formRef.current?.requestSubmit();
  }, [autoSubmit]);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function parseLinks(raw: string): string[] {
    return raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!svc) { toast.error("Pick a category"); return; }
    if (!form.city.trim()) { toast.error("Add your city"); return; }
    if (form.details.trim().length < 10) { toast.error("Describe your project (10+ chars)"); return; }
    if (!form.contact_name.trim() || !form.contact_email.trim()) { toast.error("Name and email are required"); return; }
    if (!/^[+\d][\d\s\-()]{6,}$/.test(form.contact_phone.trim())) { toast.error("Please enter a valid phone number."); return; }
    if (needsEventType && !form.event_type) { toast.error("Choose your event type"); return; }
    if (!form.urgency) { toast.error("Pick how urgent your job is"); return; }

    // Check auth
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...form, inspiration_links: parseLinks(form.linksRaw) }));
      toast.info("Create a free account in the job request flow to send your request");
      return;
    }

    setSubmitting(true);
    try {
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
          duration: (form.duration || "") as "" | "1-2h" | "half-day" | "full-day" | "multi-day",
          budget_band: form.budget_band,
          details: form.details,
          contact_name: form.contact_name,
          contact_phone: form.contact_phone,
          inspiration_links: links,
          event_type: needsEventType ? form.event_type : "",
          urgency: form.urgency,
          client_display_name: form.contact_name,
          remote_ok: form.remote_ok,
          allow_extra_pros: form.allow_extra_pros,
        },
      });

      if (job && "verification_required" in job) {
        toast.error("Please verify your email and mobile number before posting a job.");
        return;
      }

      // upload files
      if (files.length && job?.id) {
        const uploaded: { storage_path: string; mime_type?: string; size_bytes?: number }[] = [];
        for (const f of files) {
          const path = `${userRes.user.id}/${job.id}/${crypto.randomUUID()}-${f.name}`;
          const { error } = await supabase.storage.from("job-inspiration").upload(path, f, { contentType: f.type, upsert: false });
          if (error) { toast.error(`Upload failed: ${f.name}`); continue; }
          uploaded.push({ storage_path: path, mime_type: f.type, size_bytes: f.size });
        }
        if (uploaded.length) {
          try { await attachInspiration({ data: { job_id: job.id, files: uploaded } }); } catch { /* non-blocking */ }
        }
      }

      toast.success("Job posted! We're matching you with pros now.");
      setSuccess(true);
      setForm(empty);
      setFiles([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post job");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="border border-emerald-200 bg-white p-8 text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-3xl">✅</div>
        <h3 className="font-display text-2xl font-bold mb-3">Job Posted</h3>
        <p className="text-sm text-ink/70 max-w-md mx-auto mb-6">
          Your job has been published and is now visible in your Dashboard and the Projects Marketplace. Qualified professionals can now view and apply for your job.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={() => navigate({ to: "/dashboard", hash: "my-jobs" })} className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-bold hover:bg-gold">View My Jobs</button>
          <button onClick={() => navigate({ to: "/dashboard" })} className="border border-ink/20 px-6 py-3 text-xs uppercase tracking-widest hover:border-gold hover:text-gold">Go to Dashboard</button>
        </div>
      </div>
    );
  }

  const inputCls = "w-full border border-ink/15 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-gold";
  const labelCls = "text-[10px] uppercase tracking-widest text-ink/60 mb-1.5 block";

  return (
    <form ref={formRef} onSubmit={onSubmit} className="bg-white border border-ink/10 shadow-sm p-6 md:p-8 space-y-6 text-left">
      {/* 1+2 Category & City */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Category *</label>
          <select required value={form.service_id} onChange={(e) => set("service_id", e.target.value)} className={inputCls}>
            <option value="">Select a service…</option>
            <optgroup label="Photography">
              {services.filter((s) => s.kind === "photography").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
            <optgroup label="Videography">
              {services.filter((s) => s.kind === "videography").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          </select>
        </div>
        <div>
          <label className={labelCls}>City *</label>
          <CitySelect value={form.city} onChange={(v) => set("city", v)} />
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs text-ink/75 cursor-pointer select-none -mt-2">
        <input
          type="checkbox"
          checked={form.remote_ok}
          onChange={(e) => set("remote_ok", e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-gold"
        />
        <span>
          <span className="font-medium text-ink">This job can be done remotely</span>
          <span className="block text-[11px] text-ink/55">Match with remote-only professionals anywhere in the UK.</span>
        </span>
      </label>

      {needsEventType && (
        <div className="border border-gold/40 bg-gold/5 p-4 rounded-sm">
          <label className={labelCls}>Event type *</label>
          <EventTypeSelect value={form.event_type} onChange={(v) => set("event_type", v)} />
        </div>
      )}

      {/* Urgency */}
      <div>
        <label className={labelCls}>How urgent is this? *</label>
        <select required value={form.urgency} onChange={(e) => set("urgency", e.target.value)} className={inputCls}>
          <option value="">Select urgency…</option>
          {URGENCY_OPTIONS.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </select>
      </div>

      {/* 3 Details */}
      <div>
        <label className={labelCls}>Describe what you need help with *</label>
        <textarea required minLength={10} rows={4} value={form.details} onChange={(e) => set("details", e.target.value)} className={inputCls} placeholder="Style, deliverables, anything important about the shoot…" />
      </div>

      {/* 4 Date + flexible */}
      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Event date</label>
          <input type="date" value={form.event_date} onChange={(e) => set("event_date", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Time</label>
          <input type="time" value={form.event_time} onChange={(e) => set("event_time", e.target.value)} className={inputCls} />
        </div>
        <label className="flex items-end gap-2 pb-2.5 cursor-pointer">
          <input type="checkbox" checked={form.flexible_dates} onChange={(e) => set("flexible_dates", e.target.checked)} className="h-4 w-4 accent-gold" />
          <span className="text-sm">My dates are flexible</span>
        </label>
      </div>

      {/* 5 Duration */}
      <div>
        <label className={labelCls}>Duration</label>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button type="button" key={d.id} onClick={() => set("duration", form.duration === d.id ? "" : d.id)}
              className={`text-xs px-4 py-2 border transition-colors ${form.duration === d.id ? "border-gold bg-gold/10 text-ink" : "border-ink/15 hover:border-ink/40"}`}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* 6 Budget */}
      <div>
        <label className={labelCls}>Budget *</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {getBudgetBands().map((b) => (
            <button type="button" key={b.id} onClick={() => set("budget_band", b.id)}
              className={`text-xs px-3 py-2.5 border text-left transition-colors ${form.budget_band === b.id ? "border-gold bg-gold/10" : "border-ink/15 hover:border-ink/40"}`}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* 7 Contact */}
      <div className="border-t border-ink/10 pt-6 space-y-4">
        <p className="text-[10px] uppercase tracking-widest text-gold">Your contact details</p>
        <div className="grid md:grid-cols-2 gap-4">
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
            {isLoggedIn && <p className="text-[11px] text-ink/55 mt-1">This is the email address where you'll receive ShootBase notifications.</p>}
          </div>
          <div>
            <label className={labelCls}>Phone *{phoneVerified && <span className="ml-2 text-emerald-700 normal-case tracking-normal">✅ Verified</span>}</label>
            <input
              required
              type="tel"
              value={form.contact_phone}
              onChange={(e) => { if (!phoneVerified) set("contact_phone", e.target.value); }}
              readOnly={phoneVerified}
              className={`${inputCls} ${phoneVerified ? "bg-emerald-50/50 cursor-not-allowed" : ""}`}
              placeholder="07…"
            />
          </div>
        </div>
        <p className="mt-3 text-[11px] text-ink/55">
          Your mobile number must be verified before your job goes live. Professionals only see verified contact details after unlocking.
        </p>
        <label className="flex items-start gap-2 text-xs text-ink/75 cursor-pointer select-none mt-3">
          <input
            type="checkbox"
            checked={form.allow_extra_pros}
            onChange={(e) => set("allow_extra_pros", e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-gold"
          />
          <span>
            <span className="font-medium text-ink">⭐ Allow more than 5 professionals to contact me</span>
            <span className="block text-[11px] text-ink/55">Premium option — keeps your job open to more pros after the standard 5-pro cap is reached.</span>
          </span>
        </label>
      </div>

      {/* 8 Inspiration */}
      <div className="border-t border-ink/10 pt-6 space-y-3">
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
          <label className={labelCls}>Or paste reference links (Instagram, TikTok, YouTube — comma-separated)</label>
          <input value={form.linksRaw} onChange={(e) => set("linksRaw", e.target.value)} className={inputCls} placeholder="https://instagram.com/…, https://youtube.com/…" />
        </div>
      </div>

      <div className="pt-2">
        <button id="post-job-submit" type="submit" disabled={submitting}
          className="w-full bg-gold text-white px-6 py-4 text-sm uppercase tracking-widest font-bold hover:bg-ink transition-colors disabled:opacity-50">
          {submitting ? "Posting…" : ctaLabel}
        </button>
        <p className="text-xs text-ink/60 text-center mt-3">We'll match you with available professionals</p>
      </div>
    </form>
  );
}
