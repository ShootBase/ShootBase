import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Eraser, Lock, ShieldAlert } from "lucide-react";
import { AdminPage } from "@/components/admin/AdminShell";
import { getMyStaffContext } from "@/lib/admin/context.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  previewLaunchCleanup,
  runLaunchCleanup,
} from "@/lib/admin/launch-cleanup.functions";

export const Route = createFileRoute("/_authenticated/admin/launch-cleanup")({
  component: LaunchCleanupPage,
});

type Mode = "soft" | "full";

const SOFT_DESC = [
  "All coin / revenue transactions",
  "All subscriptions, invoices and project unlocks",
  "Project match, view, dismissal & favourite history",
  "User activity log and email-notification log",
  "Promo redemptions",
  "Pro coin balances reset to the welcome bonus",
];
const SOFT_KEEPS = [
  "All user accounts (clients, pros, staff)",
  "Roles, staff, permissions, platform settings",
  "Support tickets, jobs, reviews, professionals",
];

const FULL_EXTRA = [
  "All jobs, quote requests, messages, attachments",
  "All reviews, replies, reports, favourites, notifications",
  "All professional profiles, portfolio items, services",
  "All support tickets and internal notes",
  "All promo codes, referral codes, user tags, VIP rewards",
  "Every non-super_admin user account (auth + profile)",
];

function LaunchCleanupPage() {
  const navigate = useNavigate();
  const ctxFn = useServerFn(getMyStaffContext);
  const { data: ctx, isLoading: ctxLoading } = useQuery({
    queryKey: ["my-staff-context"],
    queryFn: () => ctxFn(),
  });
  useEffect(() => {
    if (!ctxLoading && ctx && ctx.role !== "super_admin") {
      toast.error("Super admin only");
      navigate({ to: "/admin" });
    }
  }, [ctx, ctxLoading, navigate]);

  const [mode, setMode] = useState<Mode>("soft");
  const [ack, setAck] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [openConfirm, setOpenConfirm] = useState(false);

  const preview = useServerFn(previewLaunchCleanup);
  const run = useServerFn(runLaunchCleanup);

  const { data: counts, isFetching, refetch } = useQuery({
    queryKey: ["launch-cleanup-preview", mode],
    queryFn: () => preview({ data: { mode } }),
    enabled: !ctxLoading && ctx?.role === "super_admin",
  });

  const mutation = useMutation({
    mutationFn: () => run({ data: { mode, confirmation, password } }),
    onSuccess: (res: any) => {
      toast.success(`Cleanup complete · ${mode === "full" ? "Full" : "Soft"} reset`);
      setOpenConfirm(false);
      setConfirmation("");
      setPassword("");
      setAck(false);
      refetch();
      console.log("launch_cleanup result", res);
    },
    onError: (e: any) => toast.error(e?.message ?? "Cleanup failed"),
  });

  const needsPhrase = mode === "full" ? "RESET SHOOTBASE" : "CONFIRM";
  const canRun =
    ack && confirmation === needsPhrase && password.length > 0 && !mutation.isPending;

  if (ctxLoading || !ctx) {
    return (
      <AdminPage title="Launch cleanup">
        <Skeleton className="h-40 w-full" />
      </AdminPage>
    );
  }
  if (ctx.role !== "super_admin") return null;

  return (
    <AdminPage
      title="Launch cleanup"
      description="Wipe test data so Shootbase starts production with a clean slate."
    >
      {/* Warning banner */}
      <Card className="border-red-500/40 bg-red-500/[0.04]">
        <CardContent className="p-4 flex gap-3 items-start">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-red-700 dark:text-red-300">
              This action affects PRODUCTION data
            </div>
            <p className="text-muted-foreground mt-1">
              Deleted rows cannot be recovered. Use Soft Reset to clear analytics
              and test transactions while preserving accounts. Use Full Reset only
              before a fresh launch — it removes every non-super_admin user.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Mode picker */}
      <div className="grid gap-4 md:grid-cols-2">
        <ModeCard
          active={mode === "soft"}
          tone="amber"
          icon={<Eraser className="h-5 w-5" />}
          title="Soft reset"
          subtitle="Recommended for launch"
          onClick={() => setMode("soft")}
          removes={SOFT_DESC}
          keeps={SOFT_KEEPS}
        />
        <ModeCard
          active={mode === "full"}
          tone="red"
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Full reset"
          subtitle="Danger zone — factory reset"
          onClick={() => setMode("full")}
          removes={[...SOFT_DESC, ...FULL_EXTRA]}
          keeps={["Active super_admin accounts", "Platform settings", "Services catalogue"]}
        />
      </div>

      {/* Preview */}
      <Card>
        <CardHeader className="border-b py-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold">
            Preview · {mode === "full" ? "Full reset" : "Soft reset"}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Counting…" : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          {isFetching && !counts ? (
            <div className="grid sm:grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : counts ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(counts)
                .filter(([k]) => k !== "mode")
                .sort((a, b) => Number(b[1]) - Number(a[1]))
                .map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
                  >
                    <span className="text-xs text-muted-foreground truncate">
                      {k.replace(/_/g, " ")}
                    </span>
                    <Badge variant={Number(v) > 0 ? "destructive" : "outline"}>
                      {String(v)}
                    </Badge>
                  </div>
                ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Confirmation form */}
      <Card>
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Lock className="h-4 w-4" /> Confirm and execute
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={ack} onCheckedChange={(v) => setAck(Boolean(v))} />
            <span>
              I understand this will permanently delete the data listed above and
              cannot be undone.
            </span>
          </label>

          <div className="grid gap-1.5">
            <Label htmlFor="phrase">
              Type{" "}
              <span className="font-mono font-semibold text-foreground">
                {needsPhrase}
              </span>{" "}
              to confirm
            </Label>
            <Input
              id="phrase"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={needsPhrase}
              autoComplete="off"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pw">Re-enter your super_admin password</Label>
            <Input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className="flex justify-end">
            <Button
              variant={mode === "full" ? "destructive" : "default"}
              disabled={!canRun}
              onClick={() => setOpenConfirm(true)}
            >
              {mode === "full" ? "Run FULL reset" : "Run soft reset"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={openConfirm} onOpenChange={setOpenConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Final confirmation — {mode === "full" ? "Full reset" : "Soft reset"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to permanently delete the data shown in the preview.
              This action is logged in the audit trail and cannot be undone.
              {mode === "full" && (
                <span className="block mt-2 font-semibold text-red-600">
                  Full reset will remove every non-super_admin account.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
              className={mode === "full" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
            >
              {mutation.isPending ? "Running…" : "Yes, run reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPage>
  );
}

function ModeCard({
  active,
  tone,
  icon,
  title,
  subtitle,
  onClick,
  removes,
  keeps,
}: {
  active: boolean;
  tone: "amber" | "red";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  removes: string[];
  keeps: string[];
}) {
  const ring =
    active && tone === "red"
      ? "ring-2 ring-red-500"
      : active && tone === "amber"
      ? "ring-2 ring-amber-500"
      : "";
  const accent =
    tone === "red" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border bg-card p-4 hover:bg-muted/40 transition ${ring}`}
    >
      <div className="flex items-center gap-2">
        <span className={accent}>{icon}</span>
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <div className="mt-3 text-xs">
        <div className="font-medium text-foreground mb-1">Removes</div>
        <ul className="space-y-0.5 text-muted-foreground list-disc pl-4">
          {removes.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <div className="font-medium text-foreground mt-3 mb-1">Keeps</div>
        <ul className="space-y-0.5 text-muted-foreground list-disc pl-4">
          {keeps.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    </button>
  );
}
