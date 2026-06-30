import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site/Footer";
import { ShootbaseLogo } from "@/components/site/Logo";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — Shootbase" },
      { name: "description", content: "Sign in to Shootbase as a client or professional." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginSelection,
});

function LoginSelection() {
  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-4xl w-full">
          <ShootbaseLogo className="h-60 w-auto mx-auto mb-8" />
          <div className="text-center mb-12">
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3">Login</p>
            <h1 className="font-display text-4xl md:text-5xl mb-3">Welcome back</h1>
            <p className="text-sm text-ink/60">Choose how you want to sign in.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="border border-ink/15 p-8 flex flex-col">
              <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-ink/50 mb-3">Client</p>
              <h2 className="font-display text-2xl mb-3">Login as Client</h2>
              <p className="text-sm text-ink/70 mb-8 flex-1">
                Post jobs, receive responses, and hire professionals.
              </p>
              <Link
                to="/client/login"
                className="w-full text-center bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold transition-colors"
              >
                Continue as Client
              </Link>
            </div>

            <div className="border border-ink/15 p-8 flex flex-col">
              <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3">Professional</p>
              <h2 className="font-display text-2xl mb-3">Login as Professional</h2>
              <p className="text-sm text-ink/70 mb-8 flex-1">
                Find clients, unlock projects, and grow your business.
              </p>
              <Link
                to="/professionals/login"
                className="w-full text-center bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold transition-colors"
              >
                Continue as Professional
              </Link>
            </div>
          </div>

          <p className="text-center text-xs text-ink/60 mt-10">
            New professional?{" "}
            <Link to="/professionals/signup" className="text-gold hover:underline">
              Join as a Professional
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
