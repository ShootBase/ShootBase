import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { acceptStaffInvite } from "@/lib/admin/staff.functions";
import { clearAllRoleStorage } from "@/lib/role-storage";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/staff/accept")({
  head: () => ({ meta: [{ title: "Activate staff account — Shootbase" }, { name: "robots", content: "noindex" }] }),
  validateSearch: searchSchema,
  component: AcceptStaffInvite,
});

function AcceptStaffInvite() {
  const { token } = useSearch({ from: "/staff/accept" });
  const navigate = useNavigate();
  const accept = useServerFn(acceptStaffInvite);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Wait for Supabase to process the magic link in the URL hash
    let unsub: any;
    supabase.auth.getSession().then(({ data }) => {
      setReady(!!data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setReady(!!session);
      setLoading(false);
    });
    unsub = sub.subscription;
    return () => unsub?.unsubscribe();
  }, []);

  if (!token) {
    return <div className="min-h-screen flex items-center justify-center p-6 text-center">Missing invite token.</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Activate your Shootbase staff account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <div className="text-muted-foreground">Verifying invite…</div>}
          {!loading && !ready && (
            <div className="text-sm text-muted-foreground">
              Please open this page from the invitation email link — your session could not be established.
            </div>
          )}
          {done && (
            <div className="space-y-3 text-sm">
              <div className="text-green-600 font-medium">Welcome to Shootbase Staff Dashboard</div>
              <div className="text-muted-foreground">Your staff account is active. Redirecting you to the dashboard…</div>
            </div>
          )}
          {!loading && ready && !done && (
            <>
              <div>
                <Label>Set password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
              </div>
              <div>
                <Label>Confirm password</Label>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} />
              </div>
              <Button className="w-full" disabled={password.length < 8 || password !== confirm} onClick={async () => {
                try {
                  await accept({ data: { token: token!, password } });
                  toast.success("Welcome to Shootbase Staff Dashboard");
                  setDone(true);
                  // Clear any stale client/pro role hints so the staff dashboard
                  // takes precedence on the next route render.
                  try { clearAllRoleStorage(); } catch {}
                  setTimeout(() => navigate({ to: "/admin" }), 800);
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}>Activate account</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
