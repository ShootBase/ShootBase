import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { setAccountType, getMyProfile } from "@/lib/marketplace.functions";
import { ShootbaseLogo } from "@/components/site/Logo";
import { writeActiveRole, writePendingRole, clearAllRoleStorage } from "@/lib/role-storage";

type Role = "customer" | "professional";
type Mode = "login" | "signup";

const PRO_CATEGORIES = [
  "Photographer",
  "Videographer",
  "Drone Operator",
  "Content Creator",
  "Photo Booth Provider",
  "Event Production",
  "Other Creative Services",
];

function dashboardFor(role: Role): string {
  return role === "professional" ? "/pro/dashboard" : "/dashboard";
}

export function RoleAuthForm({
  role,
  mode,
  title,
  subtitle,
  altHref,
  altLabel,
}: {
  role: Role;
  mode: Mode;
  title: string;
  subtitle: string;
  altHref: string;
  altLabel: string;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState(PRO_CATEGORIES[0]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [mismatch, setMismatch] = useState<Role | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);

  const passwordMismatch = mode === "signup" && confirmPassword.length > 0 && password !== confirmPassword;

  const isPro = role === "professional";
  const target = dashboardFor(role);

  // If already signed in, enforce role-locked portal: redirect to their dashboard,
  // unless this is a login portal for a different role — then show the mismatch.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      try {
        const me = await getMyProfile();
        const existing = (me.profile?.account_type as Role | undefined) ?? null;
        if (existing && existing !== role && mode === "login") {
          await supabase.auth.signOut();
          clearAllRoleStorage();
          setMismatch(existing);
          return;
        }
        if (existing) {
          navigate({ to: dashboardFor(existing) });
          return;
        }
      } catch { /* noop */ }
      // No role yet — assign this page's role permanently.
      try { await setAccountType({ data: { role } }); } catch { /* noop */ }
      navigate({ to: target });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyRoleAndGo() {
    // Role-lock: if the user already has a different permanent role, refuse the
    // sign-in on this portal and direct them to the correct one.
    try {
      const me = await getMyProfile();
      const existing = (me.profile?.account_type as Role | undefined) ?? null;
      if (existing && existing !== role) {
        await supabase.auth.signOut();
        clearAllRoleStorage();
        setMismatch(existing);
        return;
      }
      if (existing) {
        try {
          const { data } = await supabase.auth.getUser();
          if (data.user) writeActiveRole(data.user.id, existing);
        } catch { /* noop */ }
        navigate({ to: dashboardFor(existing) });
        return;
      }
    } catch { /* noop */ }
    try { await setAccountType({ data: { role } }); } catch { /* noop */ }
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) writeActiveRole(data.user.id, role);
    } catch { /* noop */ }
    navigate({ to: target });
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTermsError(false);
    if (mode === "signup") {
      if (!agreedToTerms) { setTermsError(true); setError("You must agree to the Terms and Conditions to create an account."); return; }
      if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const meta: Record<string, string> = {};
        if (name) meta.full_name = name;
        if (isPro) {
          if (businessName) meta.business_name = businessName;
          meta.primary_category = category;
          meta.intended_role = "professional";
        } else {
          meta.intended_role = "customer";
        }
        // Country derived from registration domain (or preview override).
        const { detectCountryCode } = await import("@/lib/country-detect");
        const isNg = detectCountryCode() === "NG";
        if (isNg) {
          // Verify NG is live before allowing public registration.
          // Preview mode is for Super Admin testing only and blocks signup.
          const { data: ngRow } = await supabase
            .from("platform_countries").select("status").eq("code", "NG").maybeSingle();
          if (ngRow?.status !== "live") {
            setError("ShootBase Nigeria is not open for registration yet. We'll email you when we launch.");
            setLoading(false);
            return;
          }
        }
        // Block emails that have been permanently banned by an admin.
        const { data: banned } = await supabase.rpc("is_email_banned", { _email: email });
        if (banned) {
          setError("This email address is not permitted to register on ShootBase. If you believe this is a mistake, contact support@shootbase.co.uk.");
          setLoading(false);
          return;
        }
        meta.country = isNg ? "Nigeria" : "United Kingdom";
        console.log("[signup] submitting", { email, isPro, country: meta.country });

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/verified?role=${role}`,
            data: meta,
          },
        });
        if (error) {
          console.error("[signup] supabase error", { code: (error as { code?: string }).code, status: (error as { status?: number }).status, message: error.message });
          throw error;
        }
        console.log("[signup] success", { userId: data.user?.id, hasSession: !!data.session });
        if (data.user) {
          if (name) await supabase.from("profiles").upsert({ id: data.user.id, full_name: name } as never);
        }
        if (data.session) {
          // Email confirmation disabled in project — go straight in.
          await applyRoleAndGo();
        } else {
          setNeedsConfirm(true);
          setError(null);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await applyRoleAndGo();
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Authentication failed";
      const code = (err as { code?: string })?.code ?? "";
      let msg = raw;
      if (code === "weak_password" || /pwned|known to be weak|easy to guess/i.test(raw)) {
        msg = "This password has appeared in a known data breach. Please choose a different, stronger password (mix uppercase letters, numbers, and symbols).";
      }
      else if (/already registered|already exists|user already/i.test(raw)) msg = "An account with this email already exists. Try signing in instead.";
      else if (/invalid.*email|email.*invalid|valid email/i.test(raw)) msg = "Please enter a valid email address.";
      else if (/invalid login|invalid credentials/i.test(raw)) msg = "Email or password is incorrect.";
      else if (/email.*not.*confirm|confirm.*email|email.*confirm/i.test(raw)) msg = "Please verify your email before signing in. Check your inbox for the verification link.";
      else if (/signups? (are )?(not allowed|disabled)/i.test(raw)) msg = "Sign-ups are currently disabled. Please contact support.";
      else if (/password.*(short|at least|6)/i.test(raw)) msg = "Password is too short. Use at least 6 characters.";
      else if (/password.*weak/i.test(raw)) msg = "Password is too weak. Try a longer mix of letters, numbers, and symbols.";
      else if (/rate.?limit|too many/i.test(raw)) msg = "Too many attempts. Please wait a moment and try again.";
      else if (/network|fetch/i.test(raw)) msg = "Network error. Check your connection and try again.";
      console.error("[signup] mapped error:", msg, "| raw:", raw);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setError(null);
    setTermsError(false);
    if (mode === "signup" && !agreedToTerms) {
      setTermsError(true);
      setError("You must agree to the Terms and Conditions to create an account.");
      return;
    }
    // Clear any stale role from a previous account, then record only a
    // transient pending hint that the post-redirect refresh consumes once.
    clearAllRoleStorage();
    writePendingRole(role);
    // Round-trip through /auth so ensureAccountType assigns the correct role
    // and role-mismatch protection runs BEFORE landing on a protected dashboard.
    // (Previously redirected directly to the protected route, which meant new
    // OAuth users had no account_type and the role check was skipped.)
    const asQs = role === "professional" ? "pro" : "customer";
    const redirectUri = `${window.location.origin}/auth?as=${asQs}`;
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: redirectUri });
    if (result.error) {
      setError(`${provider === "google" ? "Google" : "Apple"} sign-in failed`);
      return;
    }
    if (result.redirected) return;
    await applyRoleAndGo();
  }

  if (mismatch) {
    const wrongIsPro = mismatch === "professional";
    const correctHref = wrongIsPro ? "/professionals/login" : "/client/login";
    const correctLabel = wrongIsPro ? "Professional Login" : "Client Login";
    return (
      <div className="max-w-md mx-auto px-6 py-12">
        <ShootbaseLogo className="h-60 w-auto mx-auto mb-8" />
        <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3 text-center">
          {wrongIsPro ? "Professional" : "Client"} account
        </p>
        <h1 className="font-display text-3xl mb-3 text-center">Wrong portal</h1>
        <p className="text-sm text-ink/70 text-center mb-8">
          This account is registered as a {wrongIsPro ? "Professional" : "Client"} account.
          Please use the {correctLabel} portal.
        </p>
        <Link
          to={correctHref}
          className="block w-full bg-ink text-paper text-center px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold"
        >
          Go To {correctLabel}
        </Link>
        <button
          onClick={() => setMismatch(null)}
          className="block mx-auto mt-6 text-xs text-ink/60 hover:text-gold"
        >
          Use a different account
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-12">
      <ShootbaseLogo className="h-60 w-auto mx-auto mb-8" />
      <h1 className="font-display text-[30px] md:text-[36px] font-semibold tracking-[0.12em] uppercase text-gold text-center mb-4">
        {isPro ? "PROFESSIONAL" : "CLIENT"}
      </h1>
      <p className="text-sm text-ink/60 mb-8 text-center">{subtitle}</p>


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
        <span className="flex-1 h-px bg-ink/10" /> or {mode === "login" ? "login" : "sign up"} with email <span className="flex-1 h-px bg-ink/10" />
      </div>

      <form onSubmit={handleEmail} className="space-y-3">
        {mode === "signup" && (
          <>
            <input
              type="text"
              required
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-ink/15 px-4 py-3 text-sm focus:outline-none focus:border-gold"
            />
            {isPro && (
              <>
                <input
                  type="text"
                  required
                  placeholder="Business name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full border border-ink/15 px-4 py-3 text-sm focus:outline-none focus:border-gold"
                />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-ink/15 px-4 py-3 text-sm bg-white focus:outline-none focus:border-gold"
                >
                  {PRO_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </>
            )}
          </>
        )}
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-ink/15 px-4 py-3 text-sm focus:outline-none focus:border-gold"
        />
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-ink/15 px-4 py-3 pr-12 text-sm focus:outline-none focus:border-gold"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/50 hover:text-ink"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {mode === "signup" && (
          <>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                required
                minLength={6}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full border px-4 py-3 pr-12 text-sm focus:outline-none ${passwordMismatch ? "border-destructive focus:border-destructive" : "border-ink/15 focus:border-gold"}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/50 hover:text-ink"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passwordMismatch && <p className="text-xs text-destructive">Passwords do not match.</p>}
          </>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {needsConfirm && (
          <div className="border border-gold/40 bg-gold/5 px-4 py-4 text-xs text-ink/80 space-y-3">
            <p className="text-sm font-medium text-ink">Account created successfully.</p>
            <p>Please check your email and click the verification link to activate your account.</p>
            <p className="text-ink/60">Didn't get the email? Check your spam folder or resend it below.</p>
            <button
              type="button"
              disabled={resending || !email}
              onClick={async () => {
                setResending(true);
                setResendNote(null);
                try {
                  const { error: resendErr } = await supabase.auth.resend({
                    type: "signup",
                    email,
                    options: { emailRedirectTo: `${window.location.origin}/auth/verified?role=${role}` },
                  });
                  if (resendErr) throw resendErr;
                  setResendNote("Verification email sent. Please check your inbox.");
                } catch (e) {
                  setResendNote(e instanceof Error ? e.message : "Could not resend email.");
                } finally {
                  setResending(false);
                }
              }}
              className="underline hover:text-gold disabled:opacity-50"
            >
              {resending ? "Sending…" : "Resend verification email"}
            </button>
            {resendNote && <p className="text-[11px] text-ink/60">{resendNote}</p>}
          </div>
        )}
        {mode === "signup" && (
          <label className={`flex items-start gap-3 text-sm ${termsError ? "text-destructive" : "text-ink/80"}`}>
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => { setAgreedToTerms(e.target.checked); if (e.target.checked) setTermsError(false); }}
              className="mt-[3px] h-4 w-4 shrink-0 accent-gold"
              aria-invalid={termsError}
              aria-describedby="terms-error"
            />
            <span>
              I agree to the{" "}
              <Link to="/legal/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-gold">
                Terms and Conditions
              </Link>
            </span>
          </label>
        )}
        {mode === "signup" && termsError && (
          <p id="terms-error" className="text-xs text-destructive">You must agree to the Terms and Conditions to create an account.</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold disabled:opacity-50"
        >
          {loading ? "…" : mode === "login" ? "Login with Email" : isPro ? "Join as a Professional" : "Create Client Account"}
        </button>
      </form>

      <div className="flex justify-between items-center mt-6 text-xs text-ink/60">
        <Link to={altHref} className="hover:text-gold">{altLabel}</Link>
        <Link to="/auth/forgot" className="hover:text-gold">Forgot password?</Link>
      </div>
    </div>
  );
}
