import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShootbaseLogo } from "@/components/site/Logo";

export function ComingSoonNigeria() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase
        .from("coming_soon_signups")
        .insert({ email: email.toLowerCase().trim(), country_code: "NG", source: "shootbase.ng" });
      if (err && !/duplicate|unique/i.test(err.message)) throw err;
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <header className="px-6 py-6 flex justify-center">
        <ShootbaseLogo className="h-20 w-auto" />
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-xl w-full text-center">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-gold mb-6">
            🇳🇬 Nigeria · Launching soon
          </p>
          <h1 className="font-display text-4xl md:text-5xl leading-tight mb-6">
            ShootBase Nigeria is coming soon
          </h1>
          <p className="text-base md:text-lg text-ink/70 mb-10 leading-relaxed">
            We're preparing Nigeria's creative marketplace for photographers, videographers and creators.
          </p>

          {submitted ? (
            <div className="border border-gold/40 bg-gold/5 px-6 py-6">
              <p className="text-sm font-medium text-ink mb-1">Thanks — you're on the list.</p>
              <p className="text-xs text-ink/70">We'll email you as soon as ShootBase Nigeria goes live.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3 max-w-md mx-auto">
              <label className="block text-xs uppercase tracking-widest text-ink/60 mb-2">
                Get notified when we launch
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 border border-ink/15 px-4 py-3 text-sm focus:outline-none focus:border-gold bg-white"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold disabled:opacity-60"
                >
                  {loading ? "Saving…" : "Notify me"}
                </button>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </form>
          )}
        </div>
      </main>
      <footer className="px-6 py-8 text-center text-xs text-ink/50">
        © {new Date().getFullYear()} ShootBase · Questions? <a href="mailto:support@shootbase.co.uk" className="underline hover:text-gold">support@shootbase.co.uk</a>
      </footer>
    </div>
  );
}
