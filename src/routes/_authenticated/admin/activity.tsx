import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Activity, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { AdminPage } from "@/components/admin/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getPlatformActivity } from "@/lib/admin/activity.functions";

export const Route = createFileRoute("/_authenticated/admin/activity")({
  component: PlatformActivityPage,
});

const ACTION_TYPES = ["all", "login", "booking", "payment", "support", "message", "admin", "referral"];

function PlatformActivityPage() {
  const fn = useServerFn(getPlatformActivity);
  const [actionType, setActionType] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-platform-activity", actionType, q, page],
    queryFn: () => fn({ data: { action_type: actionType, q: q || undefined, page } }),
  });

  const rows = data?.rows ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <AdminPage title="Platform activity" description="Real-time stream of user actions across the platform.">
      <Card className="p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search description…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              className="pl-9 h-9"
            />
          </div>
          <Select value={actionType} onValueChange={(v) => { setActionType(v); setPage(1); }}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t === "all" ? "All actions" : t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">{data?.total ?? 0} events</div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
              )}
              {!isLoading && rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <Link to="/admin/users/$id" params={{ id: r.user_id }} className="text-primary hover:underline">
                      {r.user_name}
                    </Link>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{r.action_type}</Badge></TableCell>
                  <TableCell className="text-sm">{r.action_description}</TableCell>
                </TableRow>
              ))}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Activity className="h-8 w-8 opacity-40" />
                      <div className="text-sm">No activity recorded yet.</div>
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
    </AdminPage>
  );
}
