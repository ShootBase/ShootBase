import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPage, PermissionGate } from "@/components/admin/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getUserDetail,
  suspendUser,
  reactivateUser,
  deleteUser,
  verifyUser,
  adjustUserCoins,
  getUserCoinHistory,
  getUserTickets,
  getUserReferralAndPromos,
  createReferralCodeForUser,
  contactUser,
  banUser,
} from "@/lib/admin/users.functions";
import { adminSetPhoneVerified } from "@/lib/phone-verification.functions";
import { getUserTimeline } from "@/lib/admin/activity.functions";
import { getUserRiskScore } from "@/lib/admin/risk.functions";
import { listUserTags, setUserTag, removeUserTag, recomputeUserTags, grantVipReward } from "@/lib/admin/tags.functions";
import { UserTagBadge, ALL_TAGS, TAG_LABEL } from "@/components/admin/UserTags";

import { TrendingUp, TrendingDown, Minus, ShieldAlert, AlertTriangle, Mail } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";


export const Route = createFileRoute("/_authenticated/admin/users/$id")({
  component: UserDetailPage,
});

function UserDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const get = useServerFn(getUserDetail);
  const suspend = useServerFn(suspendUser);
  const reactivate = useServerFn(reactivateUser);
  const del = useServerFn(deleteUser);
  const verify = useServerFn(verifyUser);
  const setPhoneVerified = useServerFn(adminSetPhoneVerified);
  const adjust = useServerFn(adjustUserCoins);
  const timelineFn = useServerFn(getUserTimeline);
  const coinHistoryFn = useServerFn(getUserCoinHistory);
  const ticketsFn = useServerFn(getUserTickets);
  const refFn = useServerFn(getUserReferralAndPromos);
  const createRef = useServerFn(createReferralCodeForUser);
  const riskFn = useServerFn(getUserRiskScore);
  const contactFn = useServerFn(contactUser);
  const tagsFn = useServerFn(listUserTags);
  const setTagFn = useServerFn(setUserTag);
  const removeTagFn = useServerFn(removeUserTag);
  const recomputeTagsFn = useServerFn(recomputeUserTags);
  const grantRewardFn = useServerFn(grantVipReward);

  const [timelineType, setTimelineType] = useState("all");
  const [timelineQ, setTimelineQ] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["admin-user", id], queryFn: () => get({ data: { user_id: id } }) });
  const timelineQuery = useQuery({
    queryKey: ["admin-user-timeline", id, timelineType, timelineQ],
    queryFn: () => timelineFn({ data: { user_id: id, type: timelineType, q: timelineQ || undefined } }),
  });
  const coinsQ = useQuery({ queryKey: ["admin-user-coins", id], queryFn: () => coinHistoryFn({ data: { user_id: id } }) });
  const ticketsQ = useQuery({ queryKey: ["admin-user-tickets", id], queryFn: () => ticketsFn({ data: { user_id: id } }) });
  const refQ = useQuery({ queryKey: ["admin-user-ref", id], queryFn: () => refFn({ data: { user_id: id } }) });
  const riskQ = useQuery({ queryKey: ["admin-user-risk", id], queryFn: () => riskFn({ data: { user_id: id, force: false } }) });
  const tagsQ = useQuery({ queryKey: ["admin-user-tags", id], queryFn: () => tagsFn({ data: { user_id: id } }) });


  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [refrwd, setRefrwd] = useState(50);
  const [reerwd, setReerwd] = useState(25);

  // Action dialogs
  const [banOpen, setBanOpen] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [delReason, setDelReason] = useState("");
  const [delConfirm, setDelConfirm] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSubject, setContactSubject] = useState("");
  const [contactBody, setContactBody] = useState("");
  const [permBanOpen, setPermBanOpen] = useState(false);
  const [permBanReason, setPermBanReason] = useState("");
  const [permBanConfirm, setPermBanConfirm] = useState("");
  const banFn = useServerFn(banUser);
  const [busy, setBusy] = useState(false);


  if (isLoading || !data) return <div className="p-6">Loading…</div>;
  const p = data.profile ?? ({} as any);
  const displayName = p.full_name ?? data.email ?? "User";
  const accountType =
    (data as any).staff?.role ??
    (data.professional ? "professional" : p.account_type ?? "customer");
  const registeredAt = (data as any).created_at ?? p.created_at ?? null;

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["admin-user", id] });
    qc.invalidateQueries({ queryKey: ["admin-user-coins", id] });
  };

  return (
    <AdminPage
      title={displayName}
      description={`Account: ${accountType} · ${registeredAt ? `Registered ${new Date(registeredAt).toLocaleDateString()}` : "Registration date unknown"}`}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { setContactSubject(""); setContactBody(""); setContactOpen(true); }}>
            <Mail className="h-4 w-4 mr-1" /> Contact user
          </Button>
          <Link to="/admin/users" className="text-sm text-primary">← Back</Link>
        </div>
      }
    >

      {data.suspended && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm">
            This account is suspended. The user cannot sign in, book, or message.
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="coins">Coins</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="referrals">Referrals & Promos</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div><span className="text-muted-foreground">Name:</span> {p.full_name ?? "—"}</div>
              <div><span className="text-muted-foreground">Email:</span> {data.email ?? "—"}</div>
              <div><span className="text-muted-foreground">Phone:</span> {(data as any).phone ?? p.phone ?? "—"}</div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Sign-in provider:</span>
                <Badge variant="outline" className="capitalize">{(data as any).provider ?? "email"}</Badge>
                {(data as any).providers?.length > 1 && (
                  <span className="text-xs text-muted-foreground">
                    (linked: {(data as any).providers.join(", ")})
                  </span>
                )}
              </div>
              <div><span className="text-muted-foreground">Account type:</span> {accountType}</div>
              {data.roles?.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-muted-foreground">Roles:</span>
                  {data.roles.map((r: string) => (
                    <Badge key={r} variant="secondary" className="capitalize">{r}</Badge>
                  ))}
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                {data.suspended ? <Badge variant="destructive">Suspended</Badge> : <Badge>Active</Badge>}
              </div>
              <div><span className="text-muted-foreground">Verified:</span> {p.verified ? "Yes" : "No"}</div>
              <div><span className="text-muted-foreground">Phone verified:</span> {p.verified_phone ? "Yes" : "No"}</div>
              <div>
                <span className="text-muted-foreground">Last sign-in:</span>{" "}
                {(data as any).last_sign_in_at ? new Date((data as any).last_sign_in_at).toLocaleString() : "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Registered:</span>{" "}
                {registeredAt ? new Date(registeredAt).toLocaleString() : "—"}
              </div>
              <div className="text-xs text-muted-foreground pt-1">User ID: <span className="font-mono">{id}</span></div>
              {data.professional && (
                <div className="pt-2 border-t mt-2">
                  <div className="font-medium">Professional</div>
                  <div>{data.professional.business_name} · status {data.professional.status} · {data.professional.is_verified ? "verified" : "unverified"}</div>
                  <div><span className="text-muted-foreground">Coin balance:</span> {data.coin_balance ?? 0}</div>
                </div>
              )}
              {!data.profile && (
                <div className="pt-2 border-t mt-2 text-xs text-amber-600 dark:text-amber-400">
                  No profile row yet — this user signed in but hasn't completed their profile.
                </div>
              )}
            </CardContent>
          </Card>

          <TagsPanel
            userId={id}
            rows={tagsQ.data?.rows ?? []}
            loading={tagsQ.isLoading}
            onRecompute={async () => {
              try {
                await recomputeTagsFn({ data: { user_id: id } });
                toast.success("Tags recomputed");
                qc.invalidateQueries({ queryKey: ["admin-user-tags", id] });
                qc.invalidateQueries({ queryKey: ["admin-users"] });
              } catch (e: any) { toast.error(e.message); }
            }}
            onAdd={async (tag, reason) => {
              try {
                await setTagFn({ data: { user_id: id, tag, reason } });
                toast.success("Tag added");
                qc.invalidateQueries({ queryKey: ["admin-user-tags", id] });
                qc.invalidateQueries({ queryKey: ["admin-users"] });
              } catch (e: any) { toast.error(e.message); }
            }}
            onRemove={async (tag) => {
              try {
                await removeTagFn({ data: { user_id: id, tag } });
                toast.success("Tag removed");
                qc.invalidateQueries({ queryKey: ["admin-user-tags", id] });
                qc.invalidateQueries({ queryKey: ["admin-users"] });
              } catch (e: any) { toast.error(e.message); }
            }}
            onGrantReward={async (coins, note) => {
              try {
                await grantRewardFn({ data: { user_id: id, reward_type: "coin_bonus", coins, note } });
                toast.success("Reward granted");
                qc.invalidateQueries({ queryKey: ["admin-user-coins", id] });
              } catch (e: any) { toast.error(e.message); }
            }}
            isVip={(tagsQ.data?.rows ?? []).some((r: any) => r.tag === "vip")}
            isRisky={(tagsQ.data?.rows ?? []).some((r: any) => r.tag === "risky")}
          />

          <RiskPanel
            row={riskQ.data?.row}
            loading={riskQ.isLoading}
            onRecompute={async () => {
              try {
                await riskFn({ data: { user_id: id, force: true } });
                toast.success("Risk score updated");
                qc.invalidateQueries({ queryKey: ["admin-user-risk", id] });
              } catch (e: any) { toast.error(e.message); }
            }}
          />




          <PermissionGate perm="users.suspend">
            <Card>
              <CardHeader><CardTitle>Account actions</CardTitle></CardHeader>
              <CardContent className="flex gap-2 flex-wrap">
                {data.suspended ? (
                  <Button
                    onClick={async () => {
                      try { await reactivate({ data: { user_id: id } }); toast.success("Reactivated"); inv(); }
                      catch (e: any) { toast.error(e.message); }
                    }}
                  >
                    Reactivate
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => { setBanReason(""); setBanOpen(true); }}>
                    Suspend
                  </Button>
                )}
                <PermissionGate perm="verification.manage">
                  <Button variant="secondary" onClick={async () => { try { await verify({ data: { user_id: id, verified: !p.verified } }); toast.success("Verification updated"); inv(); } catch (e: any) { toast.error(e.message); } }}>
                    {p.verified ? "Remove email verification" : "Mark email verified"}
                  </Button>
                  <Button variant="secondary" onClick={async () => {
                    try {
                      await setPhoneVerified({ data: { user_id: id, verified: !p.verified_phone, reason: "Manual override from admin" } });
                      toast.success(p.verified_phone ? "Phone verification removed" : "Phone marked verified");
                      inv();
                    } catch (e: any) { toast.error(e.message); }
                  }}>
                    {p.verified_phone ? "Remove phone verification" : "Mark phone verified"}
                  </Button>
                </PermissionGate>
                <PermissionGate perm="users.delete">
                  <Button variant="destructive" onClick={() => { setDelReason(""); setDelConfirm(""); setDelOpen(true); }}>
                    Delete account
                  </Button>
                  <Button
                    variant="destructive"
                    className="bg-red-900 hover:bg-red-950"
                    onClick={() => { setPermBanReason(""); setPermBanConfirm(""); setPermBanOpen(true); }}
                  >
                    Permanent ban
                  </Button>
                </PermissionGate>

              </CardContent>
            </Card>
          </PermissionGate>
        </TabsContent>


        {/* ACTIVITY — Stripe-style timeline */}
        <TabsContent value="activity" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-3 flex flex-wrap gap-2 items-center">
              <Input
                placeholder="Search timeline…"
                value={timelineQ}
                onChange={(e) => setTimelineQ(e.target.value)}
                className="h-9 max-w-xs"
              />
              <Select value={timelineType} onValueChange={(v) => setTimelineType(v)}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="booking">Bookings</SelectItem>
                  <SelectItem value="payment">Payments</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="admin">Admin actions</SelectItem>
                </SelectContent>
              </Select>
              <div className="ml-auto text-xs text-muted-foreground">
                {timelineQuery.data?.events.length ?? 0} events
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              {timelineQuery.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
              {!timelineQuery.isLoading && (timelineQuery.data?.events ?? []).length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">No activity to show.</div>
              )}
              <ol className="relative border-l border-border ml-3 space-y-5">
                {(timelineQuery.data?.events ?? []).map((e: any) => (
                  <li key={e.id} className="ml-6">
                    <span
                      className={`absolute -left-[7px] mt-1 h-3.5 w-3.5 rounded-full ring-4 ring-background ${typeColor(e.type)}`}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="capitalize">{e.type}</Badge>
                      <time className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</time>
                    </div>
                    <p className="text-sm mt-1">{e.description}</p>
                    {e.metadata && Object.keys(e.metadata).length > 0 && (
                      <pre className="mt-1 text-[10px] text-muted-foreground bg-muted/40 rounded p-2 overflow-x-auto">
                        {JSON.stringify(e.metadata, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>


        {/* COINS */}
        <TabsContent value="coins" className="space-y-4 mt-4">
          {data.professional && (
            <PermissionGate perm="coins.adjust">
              <Card>
                <CardHeader><CardTitle>Adjust coin balance</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2 items-end flex-wrap">
                    <div>
                      <Label>Delta</Label>
                      <Input type="number" value={delta} onChange={(e) => setDelta(parseInt(e.target.value) || 0)} className="w-32" />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <Label>Reason</Label>
                      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Manual top-up / refund" />
                    </div>
                    <Button disabled={!delta || !reason} onClick={async () => {
                      try {
                        await adjust({ data: { user_id: id, delta, reason } });
                        toast.success("Balance updated");
                        setDelta(0); setReason("");
                        inv();
                      } catch (e: any) { toast.error(e.message); }
                    }}>Apply</Button>
                  </div>
                  <div className="text-xs text-muted-foreground">Current balance: {data.coin_balance ?? 0}</div>
                </CardContent>
              </Card>
            </PermissionGate>
          )}
          <Card>
            <CardHeader><CardTitle>Transaction history</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(coinsQ.data?.rows ?? []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{r.transaction_type}</Badge></TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${r.amount >= 0 ? "text-emerald-600" : "text-destructive"}`}>{r.amount > 0 ? "+" : ""}{r.amount}</TableCell>
                      <TableCell className="text-sm">{r.description ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {(coinsQ.data?.rows ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">No transactions.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TICKETS */}
        <TabsContent value="tickets" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle>Support tickets</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead>Priority</TableHead><TableHead>Created</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {(ticketsQ.data?.rows ?? []).map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.subject ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{t.status}</Badge></TableCell>
                      <TableCell><Badge variant="secondary">{t.priority ?? "—"}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="ghost" asChild><Link to="/admin/tickets/$id" params={{ id: t.id }}>Open</Link></Button></TableCell>
                    </TableRow>
                  ))}
                  {(ticketsQ.data?.rows ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">No tickets.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* REFERRALS & PROMOS */}
        <TabsContent value="referrals" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle>Referral codes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(refQ.data?.referral_codes ?? []).length === 0 && (
                <div className="text-sm text-muted-foreground">No referral codes yet.</div>
              )}
              {(refQ.data?.referral_codes ?? []).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between border rounded p-2 text-sm">
                  <div>
                    <div className="font-mono font-medium">{c.code}</div>
                    <div className="text-xs text-muted-foreground">
                      Referrer +{c.reward_for_referrer} · Referee +{c.reward_for_referee} · Uses {c.uses}{c.max_uses ? `/${c.max_uses}` : ""}
                    </div>
                  </div>
                  <Badge variant={c.active ? "secondary" : "outline"}>{c.active ? "Active" : "Inactive"}</Badge>
                </div>
              ))}
              <PermissionGate perm="settings.manage">
                <div className="flex gap-2 items-end flex-wrap pt-2 border-t">
                  <div><Label>Referrer reward</Label><Input type="number" value={refrwd} onChange={(e) => setRefrwd(parseInt(e.target.value) || 0)} className="w-28" /></div>
                  <div><Label>Referee reward</Label><Input type="number" value={reerwd} onChange={(e) => setReerwd(parseInt(e.target.value) || 0)} className="w-28" /></div>
                  <Button onClick={async () => {
                    try {
                      await createRef({ data: { user_id: id, reward_for_referrer: refrwd, reward_for_referee: reerwd } });
                      toast.success("Code created");
                      qc.invalidateQueries({ queryKey: ["admin-user-ref", id] });
                    } catch (e: any) { toast.error(e.message); }
                  }}>Generate code</Button>
                </div>
              </PermissionGate>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Promo redemptions</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Type</TableHead><TableHead>Value</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(refQ.data?.redemptions ?? []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{r.promo_code?.code ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{r.promo_code?.discount_type ?? "—"}</Badge></TableCell>
                      <TableCell>{r.promo_code?.discount_value ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.redeemed_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {(refQ.data?.redemptions ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">No redemptions.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Ban / suspend */}
      <AlertDialog open={banOpen} onOpenChange={(o) => !busy && setBanOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Ban this user?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Access is revoked immediately — login, bookings, messaging and coin use are blocked until the account is reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Label className="text-xs">Reason (optional, logged for audit)</Label>
            <Textarea value={banReason} onChange={(e) => setBanReason(e.target.value)} rows={2} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await suspend({ data: { user_id: id, reason: banReason || undefined } });
                  toast.success("User banned");
                  setBanOpen(false);
                  inv();
                } catch (err: any) { toast.error(err.message); }
                finally { setBusy(false); }
              }}
            >
              {busy ? "Working…" : "Confirm ban"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete (typed confirmation) */}
      <AlertDialog open={delOpen} onOpenChange={(o) => !busy && setDelOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Permanently delete this user?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The auth identity, sessions and access to all data are removed. Audit log entries are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Reason <span className="text-destructive">(required)</span></Label>
              <Textarea value={delReason} onChange={(e) => setDelReason(e.target.value)} rows={2} />
            </div>
            <div>
              <Label className="text-xs">Type <span className="font-mono font-bold">DELETE</span> to confirm</Label>
              <Input value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} placeholder="DELETE" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy || delConfirm !== "DELETE" || delReason.trim().length < 3}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await del({ data: { user_id: id, reason: delReason, confirm: "DELETE" as const } });
                  toast.success("User deleted");
                  setDelOpen(false);
                  window.location.href = "/admin/users";
                } catch (err: any) { toast.error(err.message); }
                finally { setBusy(false); }
              }}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent ban */}
      <AlertDialog open={permBanOpen} onOpenChange={(o) => !busy && setPermBanOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Permanently ban this user?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The account is deleted AND the email address is blocked from ever
              creating a new ShootBase account. Use this for fraud or repeat
              policy violations only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Reason <span className="text-destructive">(required)</span></Label>
              <Textarea value={permBanReason} onChange={(e) => setPermBanReason(e.target.value)} rows={2} />
            </div>
            <div>
              <Label className="text-xs">Type <span className="font-mono font-bold">BAN</span> to confirm</Label>
              <Input value={permBanConfirm} onChange={(e) => setPermBanConfirm(e.target.value)} placeholder="BAN" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900 text-white hover:bg-red-950"
              disabled={busy || permBanConfirm !== "BAN" || permBanReason.trim().length < 3}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await banFn({ data: { user_id: id, reason: permBanReason, confirm: "BAN" as const } });
                  toast.success("User banned — email blocked from re-registration");
                  setPermBanOpen(false);
                  window.location.href = "/admin/users";
                } catch (err: any) { toast.error(err.message); }
                finally { setBusy(false); }
              }}
            >
              {busy ? "Banning…" : "Ban permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      {/* Contact user */}
      <Dialog open={contactOpen} onOpenChange={(o) => !busy && setContactOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Contact user</DialogTitle>
            <DialogDescription>
              Opens a support thread on this user's account. They'll be notified via their usual support channel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Subject</Label>
              <Input value={contactSubject} onChange={(e) => setContactSubject(e.target.value)} placeholder="Quick question about your account" />
            </div>
            <div>
              <Label className="text-xs">Message</Label>
              <Textarea value={contactBody} onChange={(e) => setContactBody(e.target.value)} rows={5} placeholder="Hi…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              disabled={busy || contactSubject.trim().length < 2 || contactBody.trim().length < 2}
              onClick={async () => {
                setBusy(true);
                try {
                  await contactFn({ data: { user_id: id, subject: contactSubject, message: contactBody } });
                  toast.success("Message sent — ticket opened");
                  setContactOpen(false);
                  qc.invalidateQueries({ queryKey: ["admin-user-tickets", id] });
                } catch (err: any) { toast.error(err.message); }
                finally { setBusy(false); }
              }}
            >
              {busy ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}


function typeColor(type: string): string {
  switch (type) {
    case "login": return "bg-sky-500";
    case "booking": return "bg-violet-500";
    case "payment": return "bg-emerald-500";
    case "support": return "bg-amber-500";
    case "admin": return "bg-rose-500";
    case "message": return "bg-cyan-500";
    case "referral": return "bg-fuchsia-500";
    default: return "bg-muted-foreground";
  }
}

function levelClass(level: string): string {
  switch (level) {
    case "critical": return "bg-rose-500/15 text-rose-600 dark:text-rose-400";
    case "high": return "bg-orange-500/15 text-orange-600 dark:text-orange-400";
    case "medium": return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    default: return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  }
}

function RiskPanel({ row, loading, onRecompute }: { row: any; loading: boolean; onRecompute: () => void }) {
  if (loading) return (
    <Card><CardContent className="py-4 text-sm text-muted-foreground">Calculating risk score…</CardContent></Card>
  );
  if (!row) return null;
  const TrendIcon = row.trend === "rising" ? TrendingUp : row.trend === "decreasing" ? TrendingDown : Minus;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Risk score</CardTitle>
        <Button size="sm" variant="outline" onClick={onRecompute}>Recompute</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <div className="text-5xl font-bold tabular-nums">{row.score}</div>
          <div className="space-y-1">
            <Badge className={`capitalize ${levelClass(row.level)}`}>{row.level} risk</Badge>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendIcon className="h-3 w-3" /> {row.trend}
              {row.previous_score != null && <span>· was {row.previous_score}</span>}
            </div>
          </div>
        </div>
        {Array.isArray(row.reasons) && row.reasons.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Reasons</div>
            <ul className="list-disc pl-4 text-sm space-y-1">
              {row.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">
          Last computed {new Date(row.computed_at).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}

type TagRow = { tag: string; source: string; reason?: string | null; granted_at?: string };

function TagsPanel({
  userId, rows, loading, onRecompute, onAdd, onRemove, onGrantReward, isVip, isRisky,
}: {
  userId: string;
  rows: TagRow[];
  loading: boolean;
  onRecompute: () => void;
  onAdd: (tag: string, reason: string) => Promise<void>;
  onRemove: (tag: string) => Promise<void>;
  onGrantReward: (coins: number, note: string) => Promise<void>;
  isVip: boolean;
  isRisky: boolean;
}) {
  const [addTag, setAddTag] = useState<string>("vip");
  const [addReason, setAddReason] = useState("");
  const [rewardCoins, setRewardCoins] = useState(50);
  const [rewardNote, setRewardNote] = useState("");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Segmentation tags</CardTitle>
        <Button size="sm" variant="outline" onClick={onRecompute}>Recompute</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {loading && <span className="text-sm text-muted-foreground">Loading…</span>}
          {!loading && rows.length === 0 && (
            <span className="text-sm text-muted-foreground">No tags assigned.</span>
          )}
          {rows.map((r) => (
            <div key={r.tag} className="flex items-center gap-1">
              <UserTagBadge tag={r.tag} source={r.source} />
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive text-xs"
                onClick={() => onRemove(r.tag)}
                title="Remove tag"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <PermissionGate perm="users.edit">
          <div className="flex flex-wrap items-end gap-2 pt-3 border-t">
            <div>
              <Label className="text-xs">Add tag</Label>
              <Select value={addTag} onValueChange={setAddTag}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_TAGS.map((t) => <SelectItem key={t} value={t}>{TAG_LABEL[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Reason (optional)</Label>
              <Input value={addReason} onChange={(e) => setAddReason(e.target.value)} className="h-9" />
            </div>
            <Button size="sm" onClick={async () => { await onAdd(addTag, addReason); setAddReason(""); }}>
              Apply tag
            </Button>
          </div>
        </PermissionGate>

        {isVip && !isRisky && (
          <PermissionGate perm="coins.adjust">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <div className="text-sm font-medium flex items-center gap-2">
                🎁 Grant VIP coin bonus
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label className="text-xs">Coins</Label>
                  <Input
                    type="number" value={rewardCoins}
                    onChange={(e) => setRewardCoins(parseInt(e.target.value) || 0)}
                    className="h-9 w-28"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-xs">Note</Label>
                  <Input value={rewardNote} onChange={(e) => setRewardNote(e.target.value)} placeholder="Loyalty bonus" className="h-9" />
                </div>
                <Button
                  size="sm"
                  disabled={!rewardCoins}
                  onClick={async () => { await onGrantReward(rewardCoins, rewardNote); setRewardNote(""); }}
                >
                  Grant
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground">User: {userId.slice(0, 8)}…</div>
            </div>
          </PermissionGate>
        )}

        {isRisky && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300">
            VIP rewards are blocked while this user is tagged as risky.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

