import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Play, Lock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { getActiveOnboardingVideo, type OnboardingVideo } from "@/lib/onboarding.functions";

const STORAGE_KEY = "shootbase.pro.gettingStarted.collapsed";

const STEPS = [
  { icon: "📋", title: "New projects are posted", body: "Clients submit photography, videography, content creation, and creative service requests through ShootBase." },
  { icon: "🎯", title: "We match opportunities to you", body: "Projects are shown based on your services, location, availability, and preferences." },
  { icon: "🔓", title: "Unlock projects you like", body: "Review the full project details before using coins to unlock client contact information." },
  { icon: "💬", title: "Start the conversation", body: "Contact clients through ShootBase messaging and showcase your expertise." },
  { icon: "🚀", title: "Win more work", body: "Build relationships, secure bookings, and grow your business with no commission on jobs won." },
];

const BENEFITS = [
  "Complete profiles appear more trustworthy",
  "Better profiles receive more enquiries",
  "Clients are more likely to contact verified professionals",
  "Strong portfolios improve conversion rates",
  "Fast responders win more jobs",
];

const TIPS = [
  "Upload at least 10 portfolio images.",
  "Respond within the first hour whenever possible.",
  "Keep your service areas up to date.",
  "Add detailed descriptions of your experience.",
];

export type ProfileSignals = {
  hasPhoto: boolean;
  hasAbout: boolean;
  hasServices: boolean;
  hasLocation: boolean;
  hasPortfolio: boolean;
  hasContact: boolean;
  hasPricing: boolean;
  hasAvailability: boolean;
};

const CHECKLIST_LABELS: Array<{ key: keyof ProfileSignals; label: string }> = [
  { key: "hasPhoto", label: "Profile photo uploaded" },
  { key: "hasAbout", label: "Business description completed" },
  { key: "hasServices", label: "Service categories selected" },
  { key: "hasLocation", label: "Service locations added" },
  { key: "hasPortfolio", label: "Portfolio uploaded" },
  { key: "hasContact", label: "Contact information completed" },
  { key: "hasPricing", label: "Pricing information added" },
  { key: "hasAvailability", label: "Availability configured" },
];

function embedUrl(v: OnboardingVideo): string {
  if (v.kind === "youtube") {
    // Accept full youtube URL or ID
    const m = v.url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{6,})/);
    const id = m?.[1] ?? v.url;
    return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
  }
  if (v.kind === "vimeo") {
    const m = v.url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    const id = m?.[1] ?? v.url;
    return `https://player.vimeo.com/video/${id}?autoplay=1`;
  }
  return v.url;
}

function VideoCard({ video }: { video: OnboardingVideo }) {
  const [playing, setPlaying] = useState(false);
  const isFile = video.kind === "mp4" || video.kind === "url";

  return (
    <div className="border border-ink/10 bg-white overflow-hidden">
      <div className="p-5 border-b border-ink/5">
        <p className="font-display text-xl leading-tight">{video.title}</p>
        <p className="text-sm text-ink/65 mt-1">{video.subtitle}</p>
      </div>
      <div className="relative bg-ink aspect-video">
        {!playing ? (
          <button
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 w-full h-full flex items-center justify-center"
            aria-label="Play video"
          >
            {video.thumbnail_url ? (
              <img src={video.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-ink to-ink/70" />
            )}
            <span className="relative flex items-center justify-center w-16 h-16 rounded-full bg-gold text-ink shadow-lg group-hover:scale-105 transition-transform">
              <Play className="h-7 w-7 ml-1" fill="currentColor" />
            </span>
            {video.duration_label && (
              <span className="absolute bottom-3 right-3 bg-black/70 text-white text-[11px] px-2 py-0.5 font-mono">
                {video.duration_label}
              </span>
            )}
          </button>
        ) : isFile ? (
          <video src={video.url} controls autoPlay className="w-full h-full bg-black" />
        ) : (
          <iframe
            src={embedUrl(video)}
            title={video.title}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}

export function GettingStartedPanel({ signals }: { signals: ProfileSignals }) {
  const [expanded, setExpanded] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [video, setVideo] = useState<OnboardingVideo | null>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored === "1") setExpanded(false);
    setHydrated(true);
    void getActiveOnboardingVideo().then(setVideo).catch(() => setVideo(null));
  }, []);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, next ? "0" : "1");
      return next;
    });
  }

  const { percent, completed, total } = useMemo(() => {
    const items = CHECKLIST_LABELS.map((c) => !!signals[c.key]);
    const done = items.filter(Boolean).length;
    return { percent: Math.round((done / items.length) * 100), completed: done, total: items.length };
  }, [signals]);

  if (!hydrated) return null;

  if (!expanded) {
    return (
      <button
        onClick={toggle}
        className="w-full mb-6 flex items-center justify-between bg-white border border-ink/10 px-5 py-4 hover:border-gold transition-colors text-left"
      >
        <span className="text-sm">
          <span className="font-display text-base mr-2">Welcome to ShootBase</span>
          <span className="text-ink/60">— Learn how the platform works · Profile {percent}% complete</span>
        </span>
        <ChevronRight className="h-4 w-4 text-ink/60" />
      </button>
    );
  }

  return (
    <div className="mb-8 bg-white border border-ink/10 animate-fade-in">
      <div className="flex items-start justify-between p-6 border-b border-ink/5">
        <div>
          <h2 className="font-display text-2xl">Welcome to ShootBase</h2>
          <p className="text-sm text-ink/60 mt-1">Discover opportunities, connect with clients, and grow your creative business.</p>
        </div>
        <button onClick={toggle} aria-label="Collapse" className="p-2 hover:bg-ink/5 rounded-sm">
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="grid lg:grid-cols-5 gap-6 p-6">
        {/* LEFT: steps */}
        <div className="lg:col-span-3 space-y-4">
          {STEPS.map((s, i) => (
            <div key={i} className="flex gap-4 p-4 border border-ink/5 hover:border-ink/15 transition-colors">
              <div className="shrink-0 w-10 h-10 rounded-full bg-gold/10 text-gold font-display text-lg flex items-center justify-center">
                {i + 1}
              </div>
              <div className="min-w-0">
                <p className="font-display text-base mb-1">
                  <span className="mr-2">{s.icon}</span>{s.title}
                </p>
                <p className="text-sm text-ink/65 leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* RIGHT: video + checklist */}
        <div className="lg:col-span-2 space-y-6">
          {video ? (
            <VideoCard video={video} />
          ) : (
            <div className="border border-dashed border-ink/15 p-6 text-center text-sm text-ink/55">
              Training video coming soon.
            </div>
          )}

          {/* Profile strength */}
          <div className="border border-ink/10 bg-white p-5">
            <div className="flex items-end justify-between mb-2">
              <p className="font-display text-lg">Profile Strength</p>
              <p className="font-mono text-sm text-gold">{percent}% Complete</p>
            </div>
            <Progress value={percent} className="h-2 mb-4" />
            <ul className="space-y-1.5 mb-5">
              {CHECKLIST_LABELS.map(({ key, label }) => {
                const done = !!signals[key];
                return (
                  <li key={key} className={`flex items-center gap-2 text-sm ${done ? "text-ink/85" : "text-ink/50"}`}>
                    <span className={done ? "text-gold" : "text-ink/30"}>{done ? "✓" : "○"}</span>
                    <span>{label}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-ink/40 mb-4">{completed} of {total} complete</p>
            <Link to="/pro/settings" className="block text-center bg-ink text-paper px-5 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold mb-2">
              Complete My Profile
            </Link>
            <Link to="/pro/leads" className="block text-center border border-ink/15 px-5 py-3 text-xs uppercase tracking-widest font-medium hover:border-gold hover:text-gold">
              Browse Available Projects
            </Link>
          </div>

          {/* Why it matters */}
          <div className="border border-ink/10 bg-paper p-5">
            <p className="font-display text-base mb-3">Why Profile Completion Matters</p>
            <ul className="space-y-2 text-sm text-ink/70">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-2"><span className="text-gold mt-0.5">•</span><span>{b}</span></li>
              ))}
            </ul>
          </div>

          {/* Tips */}
          <div className="bg-ink text-paper p-5">
            <p className="font-display text-base mb-3">Tips From Successful Professionals</p>
            <ul className="space-y-2 text-sm text-paper/85">
              {TIPS.map((t) => (
                <li key={t} className="flex items-start gap-2"><span className="text-gold mt-0.5">"</span><span className="italic">{t}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// Re-export for callers wanting a tiny lock badge elsewhere
export { Lock };
