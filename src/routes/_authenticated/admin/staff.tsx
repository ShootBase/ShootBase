import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminPage, PermissionGate, useStaff } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  listStaff,
  inviteStaff,
  updateStaffRole,
  suspendStaff,
  reactivateStaff,
  deleteStaff,
  sendStaffPasswordReset,
  updateStaffPermissions,
  getStaffPermissions,
  banStaff,
  resendStaffInvite,
  revokeStaffInvite,
} from "@/lib/admin/staff.functions";
import {
  STAFF_PERMISSIONS,
  STAFF_ROLES,
  ROLE_LABEL,
  type StaffPermission,
  type StaffRole,
} from "@/lib/admin/permissions";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  component: StaffPageRoute,
});

function StaffPageRoute() {
  const fetchStaff = useServerFn(listStaff);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-staff"], queryFn: () => fetchStaff() });
  const staffCtx = useStaff();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [permsFor, setPermsFor] = useState<string | null>(null);

  return (
    <AdminPage
      title="Staff Management"
      description="Invite employees, assign roles, manage permissions."
      actions={
        <PermissionGate perm="staff.manage">
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button>Invite staff</Button>
            </DialogTrigger>
            <InviteDialog onClose={() => setInviteOpen(false)} onInvited={() => qc.invalidateQueries({ queryKey: ["admin-staff"] })} />
          </Dialog>
        </PermissionGate>
      }
    >
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7}>Loading…</TableCell></TableRow>
              )}
              {!isLoading && (data?.staff ?? []).map((s: any) => (
                <TableRow key={s.user_id}>
                  <TableCell>{s.full_name ?? "—"}</TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell>
                    <RoleSelector
                      userId={s.user_id}
                      role={s.role}
                      disabled={!staffCtx || (staffCtx.role !== "super_admin" && s.role === "super_admin")}
                      onChanged={() => qc.invalidateQueries({ queryKey: ["admin-staff"] })}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.last_login_at ? new Date(s.last_login_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <StaffActions
                      userId={s.user_id}
                      status={s.status}
                      role={s.role}
                      onPerms={() => setPermsFor(s.user_id)}
                      onChange={() => qc.invalidateQueries({ queryKey: ["admin-staff"] })}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && (data?.staff ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No staff yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(data?.invites ?? []).length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h2 className="font-semibold mb-3">Pending invites</h2>
            <PendingInvitesList
              invites={data!.invites}
              onChange={() => qc.invalidateQueries({ queryKey: ["admin-staff"] })}
            />
          </CardContent>
        </Card>
      )}

      {permsFor && <PermsDialog userId={permsFor} onClose={() => setPermsFor(null)} />}
    </AdminPage>
  );
}

function PendingInvitesList({ invites, onChange }: { invites: any[]; onChange: () => void }) {
  const resend = useServerFn(resendStaffInvite);
  const revoke = useServerFn(revokeStaffInvite);
  const [busy, setBusy] = useState<string | null>(null);

  const statusBadge = (s: string) => {
    if (s === "sent") return <Badge variant="default">Sent</Badge>;
    if (s === "failed") return <Badge variant="destructive">Failed</Badge>;
    return <Badge variant="secondary">Pending</Badge>;
  };

  return (
    <ul className="text-sm divide-y">
      {invites.map((i: any) => (
        <li key={i.id} className="py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{i.email}</span>
              <span className="text-muted-foreground">·</span>
              <span>{ROLE_LABEL[i.role as StaffRole]}</span>
              {statusBadge(i.email_status ?? "pending")}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              expires {new Date(i.expires_at).toLocaleDateString()}
              {i.email_sent_at && ` · last sent ${new Date(i.email_sent_at).toLocaleString()}`}
              {i.email_attempts ? ` · ${i.email_attempts} attempt${i.email_attempts > 1 ? "s" : ""}` : ""}
            </div>
            {i.email_status === "failed" && i.email_last_error && (
              <div className="text-xs text-destructive mt-0.5 break-words">
                {i.email_last_error}
              </div>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={busy === i.id}
              onClick={async () => {
                setBusy(i.id);
                try {
                  await resend({ data: { invite_id: i.id } });
                  toast.success("Invitation email resent");
                  onChange();
                } catch (e: any) {
                  toast.error(e.message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              Resend
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busy === i.id}
              onClick={async () => {
                if (!confirm(`Revoke invite for ${i.email}?`)) return;
                setBusy(i.id);
                try {
                  await revoke({ data: { invite_id: i.id } });
                  toast.success("Invite revoked");
                  onChange();
                } catch (e: any) {
                  toast.error(e.message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              Revoke
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RoleSelector({ userId, role, disabled, onChanged }: { userId: string; role: StaffRole; disabled: boolean; onChanged: () => void }) {
  const fn = useServerFn(updateStaffRole);
  return (
    <Select
      value={role}
      disabled={disabled}
      onValueChange={async (v) => {
        try {
          await fn({ data: { user_id: userId, role: v as StaffRole } });
          toast.success("Role updated");
          onChanged();
        } catch (e: any) {
          toast.error(e.message);
        }
      }}
    >
      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {STAFF_ROLES.map((r) => (
          <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StaffActions({ userId, status, role, onPerms, onChange }: { userId: string; status: string; role: StaffRole; onPerms: () => void; onChange: () => void }) {
  const suspend = useServerFn(suspendStaff);
  const reactivate = useServerFn(reactivateStaff);
  const del = useServerFn(deleteStaff);
  const reset = useServerFn(sendStaffPasswordReset);
  const ban = useServerFn(banStaff);
  const ctx = useStaff();
  const canManage = ctx?.role === "super_admin" || ctx?.role === "country_admin";
  return (
    <div className="flex gap-1 justify-end flex-wrap">
      <Button size="sm" variant="ghost" onClick={onPerms}>Permissions</Button>
      <Button size="sm" variant="ghost" onClick={async () => {
        try { await reset({ data: { user_id: userId } }); toast.success("Password reset email sent"); } catch (e: any) { toast.error(e.message); }
      }}>Reset password</Button>
      {status === "active" ? (
        <Button size="sm" variant="ghost" onClick={async () => {
          try { await suspend({ data: { user_id: userId } }); toast.success("Suspended"); onChange(); } catch (e: any) { toast.error(e.message); }
        }}>Suspend</Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={async () => {
          try { await reactivate({ data: { user_id: userId } }); toast.success("Reactivated"); onChange(); } catch (e: any) { toast.error(e.message); }
        }}>Reactivate</Button>
      )}
      {canManage && (
        <DeleteSelfGuard userId={userId}>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
            if (!confirm("Delete this staff account?\n\nThe person can still create a new ShootBase account with the same email. Use 'Ban' to block re-registration.")) return;
            try { await del({ data: { user_id: userId } }); toast.success("Deleted"); onChange(); } catch (e: any) { toast.error(e?.message ?? "Failed to delete"); }
          }}>Delete</Button>
        </DeleteSelfGuard>
      )}
      {canManage && (
        <DeleteSelfGuard userId={userId}>
          <Button size="sm" variant="ghost" className="text-red-900" onClick={async () => {
            const reason = window.prompt("Reason for banning this staff member (min 3 chars):");
            if (!reason || reason.trim().length < 3) return;
            if (!confirm("Permanently ban this staff account?\n\nThe email will be blocked from creating any ShootBase account.")) return;
            try {
              await ban({ data: { user_id: userId, reason: reason.trim(), confirm: "BAN" as const } });
              toast.success("Banned — email blocked from re-registration");
              onChange();
            } catch (e: any) { toast.error(e?.message ?? "Failed to ban"); }
          }}>Ban</Button>
        </DeleteSelfGuard>
      )}
    </div>
  );
}


function DeleteSelfGuard({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);
  if (meId && meId === userId) return null;
  return <>{children}</>;
}


function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const fn = useServerFn(inviteStaff);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("support_agent");
  const [saving, setSaving] = useState(false);
  const ctx = useStaff();
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Invite staff member</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com" />
        </div>
        <div>
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAFF_ROLES.filter((r) => r !== "super_admin" || ctx?.role === "super_admin").map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!email || saving} onClick={async () => {
          setSaving(true);
          try {
            await fn({ data: { email, role, overrides: [] } });
            toast.success("Invite sent");
            onInvited();
            onClose();
          } catch (e: any) {
            toast.error(e.message);
          } finally {
            setSaving(false);
          }
        }}>Send invite</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PermsDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const get = useServerFn(getStaffPermissions);
  const save = useServerFn(updateStaffPermissions);
  const { data, isLoading } = useQuery({ queryKey: ["staff-perms", userId], queryFn: () => get({ data: { user_id: userId } }) });
  const [overrides, setOverrides] = useState<{ permission: StaffPermission; effect: "allow" | "deny" }[]>([]);
  const initial = data?.overrides as any[] | undefined;
  // sync initial once
  if (initial && overrides.length === 0 && initial.length > 0) {
    setOverrides(initial.map((o) => ({ permission: o.permission, effect: o.effect })));
  }

  const set = (p: StaffPermission, effect: "allow" | "deny" | null) => {
    setOverrides((prev) => {
      const filtered = prev.filter((o) => o.permission !== p);
      return effect ? [...filtered, { permission: p, effect }] : filtered;
    });
  };
  const eff = (p: StaffPermission) => overrides.find((o) => o.permission === p)?.effect ?? null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Custom permissions</DialogTitle></DialogHeader>
        {isLoading ? <div>Loading…</div> : (
          <div className="space-y-2">
            {STAFF_PERMISSIONS.map((p) => (
              <div key={p} className="flex items-center justify-between text-sm">
                <span className="font-mono">{p}</span>
                <Select value={eff(p) ?? "default"} onValueChange={(v) => set(p, v === "default" ? null : (v as any))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="allow">Allow</SelectItem>
                    <SelectItem value="deny">Deny</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={async () => {
            try {
              await save({ data: { user_id: userId, overrides } });
              toast.success("Permissions saved");
              onClose();
            } catch (e: any) {
              toast.error(e.message);
            }
          }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
