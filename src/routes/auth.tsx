import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { clearAllRoleStorage, readActiveRole, writeActiveRole, writePendingRole } from "@/lib/role-storage";
import { enforceCountryAccess } from "@/lib/enforce-country";
import { detectCountryCode } from "@/lib/country-detect";

import { SiteFooter } from "@/components/site/Footer";
import { ShootbaseLogo } from "@/components/site/Logo";

// Only allow same-origin relative paths for the post-login redirect (prevents open-redirect via ?redirect=https://evil.com)
const safeRedirect = (r: string | undefined) =>
  r && r.startsWith("/") && !r.startsWith("//") && !r.startsWith("/\\") ? r : undefined;

const searchSchema = z.object({
  as: z.enum(["customer", "pro"]).optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Sign in — Shootbase" },
      { name: "description", content: "Sign in or create your Shootbase account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

async function ensureAccountType(userId: string, as: "customer" | "pro" | undefined) {
  if (!as) return;
  const accountType = as === "pro" ? "professional" : "customer";
  const roleValue = accountType; // user_roles.role uses same enum values
  // Read existing profile to enforce strict role separation.
  const { data: prof } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", userId)
    .maybeSingle();
  if (!prof) {
    await supabase.from("profiles").upsert({ id: userId, account_type: accountType } as any);
    await supabase
      .from("user_roles")
      .upsert({ user_id: userId, role: roleValue } as any, { onConflict: "user_id,role" });
    return;
  }
  if (!prof.account_type) {
    await supabase.from("profiles").update({ account_type: accountType } as any).eq("id", userId);
    await supabase
      .from("user_roles")
      .upsert({ user_id: userId, role: roleValue } as any, { onConflict: "user_id,role" });
    return;
  }
  // Account already has a permanent type — DO NOT silently grant a second role.
  // The mismatch is handled downstream by resolveDashboardForUser, which routes
  // the user back to their existing role's dashboard.
  if (prof.account_type !== accountType) {
    console.warn("[auth] role-mismatch ignored: account_type=", prof.account_type, "intent=", accountType);
  }
}

async function resolveDashboardForUser(userId: string, as: "customer" | "pro" | undefined): Promise<string> {
  // Any active staff role (super_admin, admin, support_agent, moderator,
  // finance_manager) ALWAYS lands on /admin (the staff dashboard), regardless
  // of entry-point intent, OAuth provider, or existing pro/client roles.
  // Invited staff role is authoritative — it overrides everything else.
  try {
    const { data: staff } = await supabase
      .from("staff_accounts")
      .select("role, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (staff && staff.status === "active") {
      return "/admin";
    }
  } catch (e) {
    console.warn("[auth] staff lookup failed", e);
  }
  // Intent from the entry-point button is authoritative for non-staff users.
  if (as === "pro") { writeActiveRole(userId, "professional"); return "/pro/dashboard"; }
  if (as === "customer") { writeActiveRole(userId, "customer"); return "/dashboard"; }
  // No intent (e.g. direct visit to /auth) — fall back to stored / role list.
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const hasPro = (roles ?? []).some((r) => r.role === "professional");
  const hasCustomer = (roles ?? []).some((r) => r.role === "customer");
  const stored = readActiveRole(userId);
  if (stored === "customer" && hasCustomer) return "/dashboard";
  if (stored === "professional" && hasPro) return "/pro/dashboard";
  if (hasPro && !hasCustomer) return "/pro/dashboard";
  return "/dashboard";
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("shootbase.sessionExpired") === "1") {
        setExpired(true);
        sessionStorage.removeItem("shootbase.sessionExpired");
      }
    } catch {}
  }, []);

  async function goToDashboard(userId: string) {
    // Hard block cross-country access. NG account on GB platform (or vice
    // versa) is sent to the mismatch screen rather than a dashboard that
    // would show empty/foreign data.
    const cc = await enforceCountryAccess(userId);
    if (!cc.ok) {
      await supabase.auth.signOut();
      navigate({
        to: "/country-mismatch",
        search: { account: cc.profileCountry, platform: cc.platformCountry },
      });
      return;
    }
    const target = safeRedirect(search.redirect) ?? (await resolveDashboardForUser(userId, search.as));
    navigate({ to: target });
  }

  /**
   * Hard-fail any session whose email has been added to the banned list
   * (covers OAuth sign-ups where we can't intercept before account creation).
   * Returns true if the user was banned and signed out.
   */
  async function rejectIfBanned(userEmail: string | null | undefined): Promise<boolean> {
    if (!userEmail) return false;
    try {
      const { data: banned } = await supabase.rpc("is_email_banned", { _email: userEmail });
      if (banned) {
        await supabase.auth.signOut();
        setError("This account has been permanently banned from ShootBase. Contact support@shootbase.co.uk if you believe this is a mistake.");
        return true;
      }
    } catch {/* ignore — fail open on RPC errors */}
    return false;
  }


  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        if (await rejectIfBanned(data.session.user.email)) return;
        // Returning session: still honor the entry-point intent so re-clicking
        // a different button switches dashboards without needing to log out.
        await ensureAccountType(data.session.user.id, search.as);
        await goToDashboard(data.session.user.id);

      } else {
        // No active session: wipe stale role hints; remember the intent for
        // the moment the new sign-in completes.
        clearAllRoleStorage();
        if (search.as === "pro") writePendingRole("professional");
        else if (search.as === "customer") writePendingRole("customer");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const roleParam = search.as === "pro" ? "professional" : "customer";
        const { data: banned } = await supabase.rpc("is_email_banned", { _email: email });
        if (banned) {
          throw new Error("This email address is not permitted to register on ShootBase. Contact support@shootbase.co.uk if you believe this is a mistake.");
        }
        const country = detectCountryCode() === "NG" ? "Nigeria" : "United Kingdom";
        const meta: Record<string, string> = { country };
        if (name) meta.full_name = name;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/verified?role=${roleParam}`,
            data: meta,
          },
        });

        if (error) throw error;
        // When email confirmation is required there is NO session yet — RLS
        // blocks any writes from the anon role. The handle_new_user trigger
        // already created the profile from user metadata (full_name, country).
        // Account type is applied after the user clicks the verification link
        // and signs in (handled by the session bootstrap in this same route).
        if (data.session && data.user) {
          // Auto-confirm is OFF in production; this branch only fires if the
          // project re-enables auto-confirm for testing.
          await ensureAccountType(data.user.id, search.as);
          await goToDashboard(data.user.id);
        } else {
          setSignupSuccess(true);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) {
          await ensureAccountType(data.user.id, search.as);
          await goToDashboard(data.user.id);
        }
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Auth failed";
      let msg = raw;
      if (/already registered|already exists|user already/i.test(raw)) msg = "An account with this email already exists. Try signing in instead.";
      else if (/invalid.*email|valid email/i.test(raw)) msg = "Please enter a valid email address.";
      else if (/invalid login|invalid credentials/i.test(raw)) msg = "Email or password is incorrect.";
      else if (/email.*not.*confirm|confirm.*email/i.test(raw)) msg = "Please verify your email before signing in. Check your inbox for the verification link.";
      else if (/password.*(short|at least|6)/i.test(raw)) msg = "Password is too short. Use at least 6 characters.";
      else if (/rate.?limit|too many/i.test(raw)) msg = "Too many attempts. Please wait a moment and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setError(null);
    // Remember the intent so the post-OAuth re-entry to /auth can read it even
    // if the search param is dropped by the provider.
    if (search.as === "pro") writePendingRole("professional");
    else if (search.as === "customer") writePendingRole("customer");
    // Round-trip back through /auth with the intent so resolveDashboardForUser
    // routes to the dashboard matching the button the user clicked.
    const asQs = search.as ? `?as=${search.as}` : "";
    const redirectUri = `${window.location.origin}/auth${asQs}`;
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: redirectUri });
    if (result.error) {
      setError(`${provider === "google" ? "Google" : "Apple"} sign-in failed`);
      return;
    }
    if (result.redirected) return;
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      if (await rejectIfBanned(data.user.email)) return;
      await ensureAccountType(data.user.id, search.as);
      await goToDashboard(data.user.id);
    }
  }


  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <div className="max-w-md mx-auto px-6 py-12 w-full">
        <ShootbaseLogo className="h-60 w-auto mx-auto mb-8" />

        {expired && (
          <div className="mb-6 border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink">
            Your session has expired due to inactivity. Please sign in again.
          </div>
        )}

        {signupSuccess && (
          <div className="mb-6 border border-gold/40 bg-gold/10 px-4 py-4 text-sm text-ink space-y-3">
            <p className="font-medium">Account created successfully.</p>
            <p className="text-ink/80">Please check your email and click the verification link to activate your account.</p>
            <button
              type="button"
              disabled={resending || !email}
              onClick={async () => {
                setResending(true);
                setResendNote(null);
                try {
                  const roleParam = search.as === "pro" ? "professional" : "customer";
                  const { error: rErr } = await supabase.auth.resend({
                    type: "signup",
                    email,
                    options: { emailRedirectTo: `${window.location.origin}/auth/verified?role=${roleParam}` },
                  });
                  if (rErr) throw rErr;
                  setResendNote("Verification email sent. Please check your inbox.");
                } catch (e) {
                  setResendNote(e instanceof Error ? e.message : "Could not resend.");
                } finally {
                  setResending(false);
                }
              }}
              className="text-xs underline hover:text-gold disabled:opacity-50"
            >
              {resending ? "Sending…" : "Resend verification email"}
            </button>
            {resendNote && <p className="text-xs text-ink/60">{resendNote}</p>}
          </div>
        )}







        <button
          onClick={() => handleOAuth("google")}
          className="w-full border border-ink/20 px-6 py-3 text-sm font-medium hover:border-gold mb-3 flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <button
          onClick={() => handleOAuth("apple")}
          className="w-full border border-ink/20 px-6 py-3 text-sm font-medium hover:border-gold mb-3 flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 384 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM256.4 113.7c30.2-35.8 27.4-68.4 26.5-80.2-26.6 1.5-57.5 18.1-75.1 38.5-19.4 21.9-30.8 49-28.4 79.6 28.8 2.2 55.1-12.6 77-37.9z"/>
          </svg>
          Continue with Apple
        </button>

        <div className="flex items-center gap-3 my-6 text-[10px] uppercase tracking-widest text-ink/40">
          <span className="flex-1 h-px bg-ink/10" /> or email <span className="flex-1 h-px bg-ink/10" />
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-ink/15 px-4 py-3 text-sm focus:outline-none focus:border-gold"
            />
          )}
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-ink/15 px-4 py-3 text-sm focus:outline-none focus:border-gold"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-ink/15 px-4 py-3 text-sm focus:outline-none focus:border-gold"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold disabled:opacity-50"
          >
            {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="flex justify-between items-center mt-6 text-xs text-ink/60">
          <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="hover:text-gold">
            {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
          <Link to="/auth/forgot" className="hover:text-gold">
            Forgot password?
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
