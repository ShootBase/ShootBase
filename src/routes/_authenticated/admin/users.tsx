import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, ChevronLeft, ChevronRight, Users as UsersIcon, AlertTriangle } from "lucide-react";
import { AdminPage, PermissionGate } from "@/components/admin/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listPlatformUsers,
  bulkSuspendUsers,
  bulkReactivateUsers,
  bulkDeleteUsers,
} from "@/lib/admin/users.functions";
import { UserTagBadges, ALL_TAGS, TAG_LABEL } from "@/components/admin/UserTags";

type TagFilter = "all" | "vip" | "high_spender" | "risky" | "inactive";
type PhoneFilter = "all" | "verified" | "unverified";
type UsersSearch = {
  type: "all" | "customer" | "professional" | "admin";
  status: "all" | "active" | "suspended";
  tag: TagFilter;
  phone: PhoneFilter;
  q?: string;
};

export const Route = createFileRoute("/_authenticated/admin/users")({
  validateSearch: (s: Record<string, unknown>): UsersSearch => ({
    type: (["all","customer","professional","admin"] as const).includes(s.type as any) ? (s.type as any) : "all",
    status: (["all","active","suspended"] as const).includes(s.status as any) ? (s.status as any) : "all",
    tag: (["all", ...ALL_TAGS] as const).includes(s.tag as any) ? (s.tag as TagFilter) : "all",
    phone: (["all","verified","unverified"] as const).includes(s.phone as any) ? (s.phone as PhoneFilter) : "all",
    q: typeof s.q === "string" && s.q ? s.q : undefined,
  }),
  component: UsersListPage,
});


type BulkKind = "suspend" | "reactivate" | "delete" | null;

function UsersListPage() {
  const qc = useQueryClient();
  const fn = useServerFn(listPlatformUsers);
  const bulkSuspend = useServerFn(bulkSuspendUsers);
  const bulkReactivate = useServerFn(bulkReactivateUsers);
  const bulkDelete = useServerFn(bulkDeleteUsers);

  const initial = Route.useSearch();
  const [q, setQ] = useState(initial.q ?? "");
  const [type, setType] = useState<UsersSearch["type"]>(initial.type);
  const [status, setStatus] = useState<UsersSearch["status"]>(initial.status);
  const [tag, setTag] = useState<TagFilter>(initial.tag);
  const [phoneFilter, setPhoneFilter] = useState<PhoneFilter>(initial.phone);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkKind, setBulkKind] = useState<BulkKind>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkConfirm, setBulkConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", q, type, status, tag, phoneFilter, page],
    queryFn: () => fn({ data: { q: q || undefined, type, status, tag, phone: phoneFilter, page } }),
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const rows = data?.rows ?? [];


  const allSelected = rows.length > 0 && rows.every((r: any) => selected.has(r.id));
  const someSelected = selected.size > 0;

  const selectedRows = useMemo(
    () => rows.filter((r: any) => selected.has(r.id)),
    [rows, selected],
  );

  const toggleAll = (v: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) v ? next.add(r.id) : next.delete(r.id);
      return next;
    });
  };
  const toggleOne = (id: string, v: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      v ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const openBulk = (kind: Exclude<BulkKind, null>) => {
    setBulkReason("");
    setBulkConfirm("");
    setBulkKind(kind);
  };
  const closeBulk = () => { if (!busy) { setBulkKind(null); } };

  const runBulk = async () => {
    if (!bulkKind || selected.size === 0) return;
    setBusy(true);
    try {
      const ids = Array.from(selected);
      let res: { ok: number; failed: number };
      if (bulkKind === "suspend") {
        res = await bulkSuspend({ data: { user_ids: ids, reason: bulkReason || undefined } });
      } else if (bulkKind === "reactivate") {
        res = await bulkReactivate({ data: { user_ids: ids } });
      } else {
        if (bulkConfirm !== "DELETE" || bulkReason.trim().length < 3) {
          toast.error('Type "DELETE" and provide a reason');
          setBusy(false);
          return;
        }
        res = await bulkDelete({ data: { user_ids: ids, reason: bulkReason, confirm: "DELETE" } });
      }
      toast.success(`${res.ok} updated${res.failed ? ` · ${res.failed} failed` : ""}`);
      setSelected(new Set());
      setBulkKind(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const bulkLabel: Record<Exclude<BulkKind, null>, string> = {
    suspend: "Ban / suspend",
    reactivate: "Reactivate",
    delete: "Delete",
  };

  return (
    <AdminPage title="Users" description="Platform-wide user directory.">
      <Card className="p-3 border-border/60 shadow-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, email or phone…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              className="pl-9 h-9"
            />
          </div>
          <Select value={type} onValueChange={(v) => { setType(v as any); setPage(1); }}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tag} onValueChange={(v) => { setTag(v as TagFilter); setPage(1); }}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {ALL_TAGS.map((t) => <SelectItem key={t} value={t}>{TAG_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={phoneFilter} onValueChange={(v) => { setPhoneFilter(v as PhoneFilter); setPage(1); }}>
            <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Phone" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any phone status</SelectItem>
              <SelectItem value="verified">Phone verified</SelectItem>
              <SelectItem value="unverified">Phone unverified</SelectItem>
            </SelectContent>
          </Select>
          <div className="sm:ml-auto text-xs text-muted-foreground self-center">
            {data?.total ?? 0} total
          </div>
        </div>
      </Card>


      {someSelected && (
        <Card className="p-3 border-primary/40 bg-primary/5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium">
              {selected.size} selected
            </div>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            <div className="ml-auto flex flex-wrap gap-2">
              <PermissionGate perm="users.suspend">
                <Button size="sm" variant="outline" onClick={() => openBulk("reactivate")}>Reactivate</Button>
                <Button size="sm" variant="destructive" onClick={() => openBulk("suspend")}>Ban / suspend</Button>
              </PermissionGate>
              <PermissionGate perm="users.delete">
                <Button size="sm" variant="destructive" onClick={() => openBulk("delete")}>Delete</Button>
              </PermissionGate>
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => toggleAll(!!v)}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Coins</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 13 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}

              {!isLoading && rows.map((u: any) => (
                <TableRow key={u.id} className="hover:bg-muted/40 transition-colors">
                  <TableCell>
                    <Checkbox
                      checked={selected.has(u.id)}
                      onCheckedChange={(v) => toggleOne(u.id, !!v)}
                      aria-label={`Select ${u.full_name ?? u.email ?? u.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className={u.phone ? "text-sm" : "text-sm text-muted-foreground italic"}>
                        {u.phone ?? "Not provided"}
                      </span>
                      {u.phone && (
                        u.verified_phone
                          ? <Badge className="bg-gold/15 text-[#8a6b1f] border border-gold/40 text-[10px] w-fit">✓ Phone verified</Badge>
                          : <Badge variant="outline" className="text-[10px] w-fit">Unverified</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-[10px]">
                      {u.provider ?? "email"}
                    </Badge>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{u.account_type ?? "—"}</Badge></TableCell>
                  <TableCell>
                    {u.tags?.length
                      ? <UserTagBadges tags={u.tags} compact />
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell>
                    {u.suspended
                      ? <Badge variant="destructive">Banned</Badge>
                      : <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400">Active</Badge>}
                  </TableCell>

                  <TableCell className="tabular-nums">{u.coin_balance ?? "—"}</TableCell>
                  <TableCell>
                    {u.risk ? (
                      <Badge className={`capitalize ${
                        u.risk.level === "critical" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" :
                        u.risk.level === "high" ? "bg-orange-500/15 text-orange-600 dark:text-orange-400" :
                        u.risk.level === "medium" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" :
                        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      }`}>{u.risk.level} · {u.risk.score}</Badge>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/admin/users/$id" params={{ id: u.id }}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <UsersIcon className="h-8 w-8 opacity-40" />
                      <div className="text-sm">No users found.</div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <div className="text-xs text-muted-foreground">Page {page} of {totalPages}</div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Bulk confirmation dialog */}
      <AlertDialog open={bulkKind !== null} onOpenChange={(o) => !o && closeBulk()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {bulkKind && `${bulkLabel[bulkKind]} ${selected.size} user${selected.size === 1 ? "" : "s"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {bulkKind === "suspend" && (
                  <p>These users will immediately lose access — they cannot log in, book, message, or use coins until reactivated.</p>
                )}
                {bulkKind === "reactivate" && (
                  <p>These accounts will be restored to active status and regain full access.</p>
                )}
                {bulkKind === "delete" && (
                  <p className="text-destructive font-medium">
                    This is irreversible. All auth records will be permanently removed.
                  </p>
                )}
                <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/40 p-2 text-xs">
                  {selectedRows.slice(0, 10).map((u: any) => (
                    <div key={u.id}>{u.full_name ?? u.email ?? u.id}</div>
                  ))}
                  {selectedRows.length > 10 && (
                    <div className="text-muted-foreground">…and {selectedRows.length - 10} more</div>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {bulkKind !== "reactivate" && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">
                  Reason {bulkKind === "delete" && <span className="text-destructive">(required)</span>}
                </Label>
                <Textarea
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder="Logged for audit trail"
                  rows={2}
                />
              </div>
              {bulkKind === "delete" && (
                <div>
                  <Label className="text-xs">Type <span className="font-mono font-bold">DELETE</span> to confirm</Label>
                  <Input
                    value={bulkConfirm}
                    onChange={(e) => setBulkConfirm(e.target.value)}
                    placeholder="DELETE"
                  />
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                busy ||
                (bulkKind === "delete" && (bulkConfirm !== "DELETE" || bulkReason.trim().length < 3))
              }
              onClick={(e) => { e.preventDefault(); runBulk(); }}
              className={bulkKind === "reactivate" ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
            >
              {busy ? "Working…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPage>
  );
}
