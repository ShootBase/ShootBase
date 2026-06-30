import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown, ShieldCheck, Zap, MessageSquare, MapPin, Rocket,
  TrendingUp, Sparkles, ArrowRight, Menu as MenuIcon,
} from "lucide-react";
import { detectCountryCode, PREVIEW_COUNTRY_KEY, type CountryCode } from "@/lib/country-detect";

type Item = { icon: React.ComponentType<{ className?: string }>; title: string; desc: string };

function useCountry(): CountryCode {
  const [code, setCode] = useState<CountryCode>(() => (typeof window === "undefined" ? "GB" : detectCountryCode()));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setCode(detectCountryCode());
    const onStorage = (e: StorageEvent) => { if (e.key === PREVIEW_COUNTRY_KEY) sync(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
    };
  }, []);
  return code;
}

function clientItems(country: CountryCode): Item[] {
  const coverage = country === "NG"
    ? { title: "Nigeria-wide Coverage", desc: "Find trusted creative professionals across Nigeria." }
    : { title: "UK-wide Coverage", desc: "Find trusted creative professionals across the UK." };
  return [
    { icon: ShieldCheck, title: "Verified Creative Professionals", desc: "Hire verified photographers, videographers and creative professionals with confidence." },
    { icon: Zap, title: "Fast Project Matching", desc: "Post your project and receive responses from suitable professionals quickly." },
    { icon: MessageSquare, title: "Secure Messaging", desc: "Communicate directly with professionals through ShootBase." },
    { icon: MapPin, ...coverage },
  ];
}

const PRO_ITEMS: Item[] = [
  { icon: Rocket, title: "Grow Your Creative Business", desc: "Get matched with new creative projects and grow your business." },
  { icon: MessageSquare, title: "Secure Messaging", desc: "Communicate with clients safely through ShootBase." },
  { icon: Sparkles, title: "Built for Creatives", desc: "A marketplace designed specifically for photographers, videographers and content creators." },
  { icon: TrendingUp, title: "Project Opportunities", desc: "Discover new projects that match your services and location." },
];

function Column({ heading, items, onClick }: { heading: string; items: Item[]; onClick?: () => void }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[#C79A5A] mb-4">{heading}</div>
      <ul className="space-y-1">
        {items.map(({ icon: Icon, title, desc }) => (
          <li key={title}>
            <div onClick={onClick} className="flex gap-3 p-3 rounded-xl hover:bg-[#FAF8F4] transition-colors cursor-default">
              <span className="shrink-0 w-9 h-9 rounded-lg bg-[#FAF8F4] border border-[#EAE5DD] flex items-center justify-center">
                <Icon className="w-4 h-4 text-[#C79A5A]" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#161616]">{title}</div>
                <div className="text-xs text-[#666666] mt-0.5 leading-relaxed">{desc}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Desktop mega menu trigger + panel. Hover/focus to open. */
export function WhyShootbaseMenu() {
  const country = useCountry();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const coverageLabel = country === "NG" ? "Nigeria-wide Coverage" : "UK-wide Coverage";

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 hover:text-[#C79A5A] transition-colors"
      >
        Why ShootBase
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute left-1/2 top-full -translate-x-1/2 pt-3 z-50"
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
        >
          <div className="w-[760px] bg-white border border-[#EAE5DD] shadow-[0_30px_80px_-30px_rgba(22,22,22,0.25)] rounded-2xl overflow-hidden">
            <div className="grid grid-cols-2 gap-6 p-6">
              <Column heading="For Clients" items={clientItems(country)} onClick={() => setOpen(false)} />
              <Column heading="For Professionals" items={PRO_ITEMS} onClick={() => setOpen(false)} />
            </div>
            <div className="border-t border-[#EAE5DD] bg-[#FAF8F4] px-6 py-4 flex items-center justify-between gap-4">
              <div className="text-xs text-[#666666]">
                <span className="font-semibold text-[#161616]">Coverage:</span> {coverageLabel}
              </div>
              <Link
                to="/why-shootbase"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#161616] hover:text-[#C79A5A] transition-colors"
              >
                Learn more about ShootBase
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mobile/tablet: navigates directly to the dedicated /why-shootbase page.
 *  The desktop mega menu is intentionally NOT rendered here — small screens
 *  get a full page instead of a dropdown. */
export function WhyShootbaseMobileMenu({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/why-shootbase"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#161616]/15 text-xs font-medium ${className}`}
    >
      <MenuIcon className="w-3.5 h-3.5" />
      Why ShootBase
    </Link>
  );
}
