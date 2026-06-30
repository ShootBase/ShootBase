import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { SiteFooter } from "@/components/site/Footer";
import { ShootbaseLogo } from "@/components/site/Logo";
import { readPendingRole, clearPendingRole, writeActiveRole } from "@/lib/role-storage";

const searchSchema = z.object({
  role: z.enum(["customer", "professional"]).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export const Route = createFileRoute("/auth/verified")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Email Verified — Shootbase" },
      { name: "description", content: "Your Shootbase account has been verified." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifiedPage,
});

function VerifiedPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "success" | "error">("checking");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    // Supabase appends ?error=... when verification fails (expired/invalid)
    if (search.error) {
      const desc = (search.error_description || "").toLowerCase();
      if (desc.includes("expired")) {
        setMessage("Your verification link has expired. Please request a new one from the sign-in page.");
      } else if (desc.includes("invalid") || desc.includes("otp")) {
        setMessage("This verification link is invalid or has already been used.");
      } else {
        setMessage(search.error_description || "Verification failed. Please try again or request a new link.");
      }
      setState("error");
      return;
    }

    // After email confirmation, Supabase typically returns the user to this URL with a session.
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await applyRoleAfterVerify(data.session.user.id);
        setState("success");
        return;
      }
      // The email link may still be processing; give it one more tick.
      setTimeout(async () => {
        const { data: d2 } = await supabase.auth.getSession();
        if (!d2.session) {
          setMessage("We couldn't confirm your verification. Please try signing in.");
          setState("error");
          return;
        }
        await applyRoleAfterVerify(d2.session.user.id);
        setState("success");
      }, 600);
    })();
  }, [search.error, search.error_description]);

  async function applyRoleAfterVerify(userId: string) {
    // The signup happened before a session existed; account_type/user_roles
    // were deferred. Apply the pending intent (role saved in localStorage
    // before signUp, or passed via ?role= on the verification link) now that
    // the session is live so the user lands in the correct dashboard.
    const intent = (search.role as "customer" | "professional" | undefined) ?? readPendingRole();
    if (!intent) return;
    try {
      const { data: prof } = await supabase.from("profiles").select("account_type").eq("id", userId).maybeSingle();
      if (!prof) {
        await supabase.from("profiles").upsert({ id: userId, account_type: intent } as any);
      } else if (!prof.account_type) {
        await supabase.from("profiles").update({ account_type: intent } as any).eq("id", userId);
      }
      await supabase.from("user_roles").upsert({ user_id: userId, role: intent } as any, { onConflict: "user_id,role" });
      writeActiveRole(userId, intent);
    } catch (e) {
      console.warn("[verified] role apply failed", e);
    } finally {
      clearPendingRole();
    }
  }

  const target = search.role === "professional" ? "/pro/dashboard" : "/dashboard";

  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full text-center">
          <ShootbaseLogo className="h-60 w-auto mx-auto mb-8" />
          {state === "checking" && (
            <>
              <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3">Verifying</p>
              <h1 className="font-display text-3xl mb-3">One moment…</h1>
              <p className="text-sm text-ink/60">Confirming your email.</p>
            </>
          )}
          {state === "success" && (
            <>
              <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3">Verified</p>
              <h1 className="font-display text-4xl mb-4">Welcome to Shootbase</h1>
              <p className="text-sm text-ink/70 mb-8">
                Your email has been verified successfully. Welcome to Shootbase.
              </p>
              <button
                onClick={() => navigate({ to: target })}
                className="inline-block bg-ink text-paper px-8 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold"
              >
                Go to your dashboard
              </button>
            </>
          )}
          {state === "error" && (
            <>
              <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-destructive mb-3">Verification problem</p>
              <h1 className="font-display text-3xl mb-4">We couldn't verify your email</h1>
              <p className="text-sm text-ink/70 mb-8">{message}</p>
              <Link
                to="/login"
                className="inline-block bg-ink text-paper px-8 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold"
              >
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
