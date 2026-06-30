import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Search, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { AdminPage } from "@/components/admin/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listAuditLogs } from "@/lib/admin/audit.functions";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: AuditPage,
});

function AuditPage() {
  const fn = useServerFn(listAuditLogs);
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit", action, page],
    queryFn: () => fn({ data: { action: action || undefined, page } }),
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const rows = data?.rows ?? [];

  return (
    <AdminPage title="Audit logs" description="Append-only record of all admin actions.">
      <Card className="p-3 border-border/60 shadow-sm">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by action (e.g. user.suspend)…"
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            className="pl-9 h-9"
          />
        </div>
      </Card>
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Metadata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
              {!isLoading && rows.map((r: any) => (
                <TableRow key={r.id} className="hover:bg-muted/40 transition-colors">
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-medium">{r.actor_name}</TableCell>
                  <TableCell><span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">{r.action}</span></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.entity_type ?? "—"} / {r.entity_id ?? "—"}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground max-w-md truncate">
                    {Object.keys(r.metadata ?? {}).length ? JSON.stringify(r.metadata) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="h-8 w-8 opacity-40" />
                      <div className="text-sm">No logs.</div>
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
