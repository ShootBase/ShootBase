import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Crown, Coins, Gift, Sparkles } from "lucide-react";
import { AdminPage } from "@/components/admin/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { listVipUsers, recomputeAllUserTags } from "@/lib/admin/tags.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/vip")({
  component: VipPage,
});

function VipPage() {
  const qc = useQueryClient();
  const fn = useServerFn(listVipUsers);
  const recomputeAll = useServerFn(recomputeAllUserTags);
  const { data, isLoading } = useQuery({ queryKey: ["admin-vip"], queryFn: () => fn() });

  return (
    <AdminPage
      title="VIP Users"
      description="Top spenders and high-engagement users automatically tagged for rewards."
      actions={
        <Button size="sm" variant="outline" onClick={async () => {
          try {
            const res = await recomputeAll();
            toast.success(`Recomputed tags for ${res.processed} users`);
            qc.invalidateQueries({ queryKey: ["admin-vip"] });
            qc.invalidateQueries({ queryKey: ["admin-users"] });
          } catch (e: any) { toast.error(e.message); }
        }}>
          <Sparkles className="h-4 w-4 mr-1" /> Recompute all tags
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi icon={<Crown className="h-4 w-4 text-amber-500" />} label="Total VIPs" value={data?.vip_count ?? "—"} />
        <Kpi icon={<Coins className="h-4 w-4 text-emerald-500" />} label="Rewards distributed" value={data?.rewards_total_coins ?? 0} suffix="coins" />
        <Kpi icon={<Gift className="h-4 w-4 text-fuchsia-500" />} label="Recent grants" value={data?.recent_rewards?.length ?? 0} />
      </div>

      <Card>
        <CardHeader><CardTitle>Top VIP spenders (last 90 days)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Business</TableHead>
                <TableHead className="text-right">Coins purchased</TableHead>
                <TableHead>Source</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && (data?.users ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No VIPs yet.</TableCell></TableRow>
              )}
              {(data?.users ?? []).map((u: any) => (
                <TableRow key={u.user_id}>
                  <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email ?? "—"}</TableCell>
                  <TableCell>{u.business_name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{u.coins_purchased_90d}</TableCell>
                  <TableCell><Badge variant={u.source === "manual" ? "secondary" : "outline"} className="capitalize">{u.source}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/admin/users/$id" params={{ id: u.user_id }}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent rewards</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Coins</TableHead>
                <TableHead>Promo</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.recent_rewards ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No rewards granted yet.</TableCell></TableRow>
              )}
              {(data?.recent_rewards ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.granted_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <Link to="/admin/users/$id" params={{ id: r.user_id }} className="text-primary hover:underline">
                      {r.user_id.slice(0, 8)}…
                    </Link>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{r.reward_type.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{r.coins ?? 0}</TableCell>
                  <TableCell className="font-mono text-xs">{r.promo_code ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.note ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminPage>
  );
}

function Kpi({ icon, label, value, suffix }: { icon: React.ReactNode; label: string; value: any; suffix?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="mt-2 text-2xl font-bold tabular-nums">
          {value}
          {suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
