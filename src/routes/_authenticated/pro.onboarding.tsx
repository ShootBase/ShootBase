import { ProShell } from "@/components/site/ProShell";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getMyProfile,
  listServices,
  upsertMyProfessional,
} from "@/lib/marketplace.functions";
import { supabase } from "@/integrations/supabase/client";
import { CitySelect } from "@/components/ui/city-select";
import { PortfolioManager } from "@/components/portfolio/PortfolioManager";
import { PortfolioVideoManager } from "@/components/pro/PortfolioVideoManager";
import {
  detectBioContactInfo,
  bioContactIssueLabel,
  BIO_CONTACT_BLOCK_MESSAGE,
} from "@/lib/bio-contact-filter";
import { getCountryConfig, detectCountryCode } from "@/lib/country-detect";

export const Route = createFileRoute("/_authenticated/pro/onboarding")({
  head: () => ({ meta: [{ title: "Build your professional profile" }, { name: "robots", content: "noindex" }] }),
  component: ProOnboarding,
});

type Service = { id: string; name: string; kind: "photography" | "videography" };
type Pro = { id: string; business_name: string; contact_name: string | null; about: string | null; city: string | null; postcode: string | null; years_experience: number | null; starting_price_pence: number | null; cover_image_url: string | null; logo_url: string | null; website: string | null; instagram: string | null; facebook: string | null; tiktok: string | null; linkedin: string | null; twitter: string | null; youtube: string | null; service_radius_miles: number | null; nationwide_service: boolean | null; remote_service: boolean | null; service_area_updated_at: string | null };

type ServiceAreaMode = "local" | "nationwide";

function ProOnboarding() {
  const [services, setServices] = useState<Service[]>([]);
  const [pro, setPro] = useState<Pro | null>(null);
  const [proId, setProId] = useState<string | null>(null);
  const [selectedSvc, setSelectedSvc] = useState<Set<string>>(new Set());
  // portfolio state lives inside <PortfolioManager />

  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [areaMode, setAreaMode] = useState<ServiceAreaMode>("local");
  const [radius, setRadius] = useState<number>(25);
  // Radius is always stored as miles in DB (used by miles_between SQL).
  // In NG mode we display kilometres; convert at the boundary.
  const isNG = detectCountryCode() === "NG";
  const distUnit = isNG ? "km" : "miles";
  const displayRadius = isNG ? Math.round(radius * 1.609344) : radius;
  const onChangeDisplayRadius = (v: number) => setRadius(isNG ? Math.round(v / 1.609344) : v);
  const [bio, setBio] = useState("");
  const bioIssue = detectBioContactInfo(bio);
  

  async function reload() {
    const me = await getMyProfile();
    if (me.professional) {
      setProId(me.professional.id);
      const { data: full } = await supabase
        .from("professionals")
        .select("id, business_name, about, city, years_experience, starting_price_pence, cover_image_url, logo_url, website, instagram, facebook, tiktok, linkedin, twitter, youtube, service_radius_miles, nationwide_service, remote_service, service_area_updated_at, professional_services(service_id), portfolio_items(*)")
        .eq("id", me.professional.id)
        .maybeSingle();
      // contact_name + postcode are not publicly readable; fetch via SECURITY DEFINER RPC.
      const { data: ownerRows } = await supabase.rpc("get_my_professional");
      const owner = (ownerRows?.[0] ?? null) as { contact_name: string | null; postcode: string | null } | null;
      if (full) {
        const f = { ...(full as object), contact_name: owner?.contact_name ?? null, postcode: owner?.postcode ?? null } as unknown as Pro;
        setPro(f);
        setSelectedSvc(new Set((full as { professional_services: { service_id: string }[] }).professional_services.map((s) => s.service_id)));
        setCity(f.city ?? "");
        setRadius(f.service_radius_miles ?? 25);
        setBio(f.about ?? "");
        if (f.nationwide_service) setAreaMode("nationwide");
        else setAreaMode("local");
        
      }
    }
  }

  useEffect(() => {
    void listServices().then((s) => setServices(s as Service[]));
    void reload();
  }, []);

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    if (bioIssue) {
      setErr(BIO_CONTACT_BLOCK_MESSAGE);
      return;
    }
    const f = new FormData(e.currentTarget);
    const cityValue = (city || String(f.get("city") ?? "")).trim();
    if (!cityValue) {
      setErr("Please select your city.");
      return;
    }
    try {
      const result = await upsertMyProfessional({
        data: {
          business_name: String(f.get("business_name") ?? ""),
          contact_name: String(f.get("contact_name") ?? ""),
          about: String(f.get("about") ?? ""),
          city: cityValue,
          postcode: String(f.get("postcode") ?? ""),
          years_experience: Number(f.get("years_experience") ?? 0),
          starting_price_pence: Number(f.get("starting_price_pounds") ?? 0) * 100,
          website: String(f.get("website") ?? ""),
          instagram: String(f.get("instagram") ?? ""),
          facebook: String(f.get("facebook") ?? ""),
          tiktok: String(f.get("tiktok") ?? ""),
          youtube: String(f.get("youtube") ?? ""),
          service_ids: Array.from(selectedSvc),
          service_radius_miles: areaMode === "local" ? radius : undefined,
          nationwide_service: areaMode === "nationwide",
          remote_service: false,
        },
      });
      setProId(result.id);
      setSavedAt(new Date());
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    }
  }

  function toggleSvc(id: string) {
    const s = new Set(selectedSvc);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelectedSvc(s);
  }

  // Portfolio uploads handled inside <PortfolioManager />.

  return (
    <ProShell>
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="font-display text-4xl mb-2">Your professional profile</h1>
        <p className="text-sm text-ink/60 mb-10">Build your public page. You can edit any of this later.</p>

        <form onSubmit={saveProfile} className="space-y-6 border border-ink/10 p-6 mb-12">
          <h2 className="font-display text-2xl">Business information</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Business name" name="business_name" required defaultValue={pro?.business_name} />
            <div id="contact"><Field label="Contact name" name="contact_name" required defaultValue={pro?.contact_name ?? ""} /></div>
            <label className="block" id="location">
              <span className="block text-[10px] uppercase tracking-widest mb-2">City</span>
              <CitySelect value={city} onChange={setCity} name="city" required />
            </label>
            <Field label="Postcode" name="postcode" defaultValue={pro?.postcode ?? ""} />
            <Field label="Years of professional experience" name="years_experience" type="number" required defaultValue={String(pro?.years_experience ?? "")} />
            <div id="pricing"><Field label={`Starting price (${getCountryConfig().currencySymbol})`} name="starting_price_pounds" type="number" defaultValue={pro?.starting_price_pence ? String(pro.starting_price_pence / 100) : ""} /></div>
            <Field label="Website" name="website" defaultValue={pro?.website ?? ""} placeholder="https://yourstudio.com" />
            <Field label="Instagram link" name="instagram" defaultValue={pro?.instagram ?? ""} placeholder="https://instagram.com/yourhandle" />
            <Field label="Facebook link" name="facebook" defaultValue={pro?.facebook ?? ""} placeholder="https://facebook.com/yourpage" />
            <Field label="TikTok link" name="tiktok" defaultValue={pro?.tiktok ?? ""} placeholder="https://tiktok.com/@yourhandle" />
            <Field label="YouTube link" name="youtube" defaultValue={pro?.youtube ?? ""} placeholder="https://youtube.com/@yourhandle" />
          </div>
          <label className="block" id="about">
            <span className="block text-[10px] uppercase tracking-widest mb-2">About</span>
            <textarea
              name="about"
              rows={5}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              aria-invalid={bioIssue ? true : undefined}
              className={`w-full border px-3 py-2 text-sm focus:outline-none ${bioIssue ? "border-destructive focus:border-destructive bg-destructive/5" : "border-ink/15 focus:border-gold"}`}
              placeholder="Tell clients about your style, experience and what makes you unique. Please do not share phone numbers, emails or social handles — clients reach you through Shootbase."
            />
            {bioIssue ? (
              <div className="mt-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <p className="font-medium">{BIO_CONTACT_BLOCK_MESSAGE}</p>
                <p className="mt-1 text-destructive/80">
                  We detected {bioContactIssueLabel(bioIssue)} in your bio. Please remove it to save.
                </p>
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-ink/50">
                Tip: don&apos;t include phone numbers, emails, social handles or external links — clients message you inside Shootbase.
              </p>
            )}
          </label>


          <div id="services">
            <p className="block text-[10px] uppercase tracking-widest mb-2">Services offered</p>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => toggleSvc(s.id)}
                  className={`text-xs uppercase tracking-widest px-3 py-2 border ${selectedSvc.has(s.id) ? "bg-ink text-paper border-ink" : "border-ink/15 hover:border-gold"}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-ink/10 pt-6 space-y-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <p className="block text-[10px] uppercase tracking-widest">Service area</p>
              {pro?.service_area_updated_at && (
                <p className="text-[10px] text-ink/50">
                  Last updated {new Date(pro.service_area_updated_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <p className="text-xs text-ink/60">
              We only notify you about projects inside this area. Choose what fits your business.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {([
                { id: "local", label: "Local radius", hint: `Within X ${distUnit} of your base` },
                { id: "nationwide", label: isNG ? "Nigeria-wide" : "Nationwide", hint: isNG ? "Anywhere in Nigeria" : "Anywhere in the UK" },
              ] as { id: ServiceAreaMode; label: string; hint: string }[]).map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setAreaMode(opt.id)}
                  className={`text-left border p-3 transition-colors ${areaMode === opt.id ? "border-gold bg-gold/5" : "border-ink/15 hover:border-ink/40"}`}
                >
                  <p className="text-xs uppercase tracking-widest font-medium">{opt.label}</p>
                  <p className="text-[11px] text-ink/55 mt-1">{opt.hint}</p>
                </button>
              ))}
            </div>
            {areaMode === "local" && (
              <div className="grid sm:grid-cols-[180px_1fr] gap-4 items-end">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-widest mb-2">Travel radius</span>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={isNG ? 800 : 500}
                      value={displayRadius}
                      onChange={(e) => onChangeDisplayRadius(Math.max(1, Math.min(isNG ? 800 : 500, Number(e.target.value) || 0)))}
                      className="w-full border border-ink/15 px-3 py-2 text-sm focus:outline-none focus:border-gold pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] uppercase tracking-widest text-ink/50">{distUnit}</span>
                  </div>
                </label>
                <div className="flex flex-wrap gap-2">
                  {(isNG ? [15, 40, 80, 160] : [10, 25, 50, 100]).map((r) => (
                    <button
                      type="button"
                      key={r}
                      onClick={() => onChangeDisplayRadius(r)}
                      className={`text-xs px-3 py-2 border transition-colors ${radius === r ? "border-gold bg-gold/10" : "border-ink/15 hover:border-ink/40"}`}
                    >
                      {r} {distUnit}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[11px] text-ink/50">
              We use your postcode (or city if postcode is empty) to centre your radius. Update either above if your base location changes.
            </p>
          </div>

          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex items-center gap-4">
            <button
              disabled={Boolean(bioIssue)}
              className="bg-ink text-paper px-8 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-ink"
            >
              Save profile
            </button>
            {savedAt && <span className="text-xs text-ink/60">Saved {savedAt.toLocaleTimeString()}</span>}
            {proId && pro && (
              <Link to="/pro/dashboard" className="text-xs uppercase tracking-widest text-gold hover:underline">
                Go to Pro dashboard →
              </Link>
            )}
          </div>
        </form>

        {proId && (
          <section id="portfolio" className="mb-12 border border-ink/10 p-6">
            <PortfolioManager />
            <PortfolioVideoManager />
          </section>
        )}
      </div>
      </ProShell>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest mb-2">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full border border-ink/15 px-3 py-2 text-sm focus:outline-none focus:border-gold"
      />
    </label>
  );
}

