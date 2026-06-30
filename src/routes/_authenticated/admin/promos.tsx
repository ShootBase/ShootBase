import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Gift, Plus } from "lucide-react";
import { AdminPage, PermissionGate } from "@/components/admin/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  listPromoCodes, createPromoCode, togglePromoCode, deletePromoCode,
} from "@/lib/admin/promos.functions";

export const Route = createFileRoute("/_authenticated/admin/promos")({
  component: PromosPage,
});

function PromosPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPromoCodes);
  const createFn = useServerFn(createPromoCode);
  const toggleFn = useServerFn(togglePromoCode);
  const delFn = useServerFn(deletePromoCode);

  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-promos", status, q],
    queryFn: () => listFn({ data: { status, q: q || undefined } }),
  });
  const rows = data?.rows ?? [];

  const inv = () => qc.invalidateQueries({ queryKey: ["admin-promos"] });

  return (
    <AdminPage
      title="Promo codes"
      description="Create and manage discount and credit promo codes."
      actions={
        <PermissionGate perm="settings.manage">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New promo</Button>
            </DialogTrigger>
            <NewPromoDialog
              onClose={() => setOpen(false)}
              onSubmit={async (payload) => {
                try {
                  await createFn({ data: payload });
                  toast.success("Promo created");
                  setOpen(false);
                  inv();
                } catch (e: any) { toast.error(e.message); }
              }}
            />
          </Dialog>
        </PermissionGate>
      }
    >
      <Card className="p-3 border-border/60 shadow-sm">
        <div className="flex flex-wrap gap-2 items-center">
          <Input placeholder="Search code…" className="h-9 max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">{rows.length} codes</div>
        </div>
      </Card>

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Uses</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground text-sm">Loading…</TableCell></TableRow>
              )}
              {!isLoading && rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono font-medium">{r.code}</TableCell>
                  <TableCell><Badge variant="outline">{r.discount_type}</Badge></TableCell>
                  <TableCell>{r.discount_type === "percent" ? `${r.discount_value}%` : r.discount_value}</TableCell>
                  <TableCell className="text-sm">{r.applies_to_user_id ? "Single user" : r.applies_to_role ? r.applies_to_role : "Everyone"}</TableCell>
                  <TableCell className="tabular-nums">{r.uses}{r.max_uses ? `/${r.max_uses}` : ""}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.valid_from ? new Date(r.valid_from).toLocaleDateString() : "—"} → {r.valid_until ? new Date(r.valid_until).toLocaleDateString() : "∞"}
                  </TableCell>
                  <TableCell>{r.active ? <Badge className="bg-emerald-500/10 text-emerald-600">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <PermissionGate perm="settings.manage">
                      <Button size="sm" variant="ghost" onClick={async () => {
                        try { await toggleFn({ data: { id: r.id, active: !r.active } }); inv(); } catch (e: any) { toast.error(e.message); }
                      }}>{r.active ? "Disable" : "Enable"}</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                        if (!confirm("Delete this promo code?")) return;
                        try { await delFn({ data: { id: r.id } }); inv(); } catch (e: any) { toast.error(e.message); }
                      }}>Delete</Button>
                    </PermissionGate>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Gift className="h-8 w-8 opacity-40" />
                      <div className="text-sm">No promo codes yet.</div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminPage>
  );
}

function NewPromoDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (p: any) => void | Promise<void> }) {
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"percent" | "fixed" | "credits">("percent");
  const [value, setValue] = useState(10);
  const [role, setRole] = useState<"all" | "customer" | "professional">("all");
  const [maxUses, setMaxUses] = useState<string>("");
  const [validUntil, setValidUntil] = useState<string>("");

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New promo code</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LAUNCH50" /></div>
        <div><Label>Description (internal)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percent off</SelectItem>
                <SelectItem value="fixed">Fixed amount</SelectItem>
                <SelectItem value="credits">Bonus credits</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Value</Label><Input type="number" value={value} onChange={(e) => setValue(parseInt(e.target.value) || 0)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Audience</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="customer">Customers</SelectItem>
                <SelectItem value="professional">Professionals</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Max uses (optional)</Label><Input type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} /></div>
        </div>
        <div><Label>Valid until (optional)</Label><Input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={!code || !value}
          onClick={() => onSubmit({
            code,
            description: description || undefined,
            discount_type: type,
            discount_value: value,
            applies_to_role: role === "all" ? null : role,
            max_uses: maxUses ? parseInt(maxUses) : null,
            valid_until: validUntil ? new Date(validUntil).toISOString() : null,
          })}
        >Create</Button>
      </DialogFooter>
    </DialogContent>
  );
}
