import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Globe2, ShieldCheck, Eye, EyeOff, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStaff } from "@/components/admin/AdminShell";
import {
  listCountries,
  updateCountry,
  setCountryStatus,
  listComingSoonSignups,
} from "@/lib/admin/countries.functions";

export const Route = createFileRoute("/_authenticated/admin/countries")({
  component: CountriesPage,
});

type CountryStatus = "live" | "preview" | "disabled";

type Country = {
  code: string;
  name: string;
  status: CountryStatus;
  active: boolean;
  domain: string | null;
  currency: string | null;
  currency_symbol: string | null;
  payment_provider: string | null;
  phone_code: string | null;
  support_email: string | null;
  launch_status: string | null;
};

const STATUS_LABEL: Record<CountryStatus, string> = {
  live: "Live",
  preview: "Preview",
  disabled: "Disabled",
};

const STATUS_VARIANT: Record<CountryStatus, "default" | "secondary" | "outline"> = {
  live: "default",
  preview: "secondary",
  disabled: "outline",
};

function CountriesPage() {
  const staff = useStaff();
  const isSuper = staff?.role === "super_admin";

  const fetchList = useServerFn(listCountries);
  const fetchSignups = useServerFn(listComingSoonSignups);

  const { data: countries = [] } = useQuery({
    queryKey: ["admin", "countries"],
    queryFn: () => fetchList() as Promise<Country[]>,
  });
  const { data: signups = [] } = useQuery({
    queryKey: ["admin", "coming-soon-signups"],
    queryFn: () =>
      fetchSignups({ data: {} }) as Promise<
        Array<{ id: string; email: string; country_code: string; created_at: string }>
      >,
  });

  if (!isSuper) {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-20">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-card border shadow-sm">
          <ShieldCheck className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold">Super Admin only</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          Country management is restricted to Super Admins.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Globe2 className="h-6 w-6" /> Country management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Each country is <strong>Live</strong>, <strong>Preview</strong> (Super Admin testing
          only), or <strong>Disabled</strong>. Launch a country to make it public.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {countries.map((c) => (
          <CountryCard key={c.code} country={c} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming-soon email signups</CardTitle>
        </CardHeader>
        <CardContent>
          {signups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No signups yet.</p>
          ) : (
            <div className="divide-y border rounded-md">
              {signups.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-4 py-2 text-sm"
                >
                  <span className="font-mono">{s.email}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Badge variant="outline">{s.country_code}</Badge>
                    <span>{new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CountryCard({ country }: { country: Country }) {
  const qc = useQueryClient();
  const update = useServerFn(updateCountry);
  const setStatus = useServerFn(setCountryStatus);
  const [form, setForm] = useState(country);

  const updateMut = useMutation({
    mutationFn: (patch: Partial<Country> & { code: string }) =>
      update({ data: patch as never }) as Promise<Country>,
    onSuccess: (next) => {
      toast.success("Settings saved");
      setForm(next);
      void qc.invalidateQueries({ queryKey: ["admin", "countries"] });
    },
    onError: (e: Error) => toast.error(e.message || "Update failed"),
  });

  const statusMut = useMutation({
    mutationFn: (status: CountryStatus) =>
      setStatus({ data: { code: form.code, status } }) as Promise<Country>,
    onSuccess: (next, status) => {
      const verb =
        status === "live" ? "launched" : status === "preview" ? "in preview" : "disabled";
      toast.success(`${next.name} is now ${verb}`);
      setForm(next);
      void qc.invalidateQueries({ queryKey: ["admin", "countries"] });
    },
    onError: (e: Error) => toast.error(e.message || "Status change failed"),
  });

  const status = (form.status ?? "disabled") as CountryStatus;
  const flag = country.code === "GB" ? "🇬🇧" : country.code === "NG" ? "🇳🇬" : "🌐";

  function set<K extends keyof Country>(k: K, v: Country[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function launchConfirm() {
    const ok = window.confirm(
      `Launch ${form.name}? This makes the country PUBLIC. Anyone visiting ${form.domain ?? form.name} can register, sign in, and use the platform.`,
    );
    if (ok) statusMut.mutate("live");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            {flag} {form.name}
            <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            {form.code} · {form.domain}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={status === "preview" ? "secondary" : "outline"}
            onClick={() => statusMut.mutate("preview")}
            disabled={statusMut.isPending || status === "preview" || status === "live"}
          >
            <Eye className="h-4 w-4 mr-1.5" />
            Enable Preview
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => statusMut.mutate("disabled")}
            disabled={statusMut.isPending || status === "disabled"}
          >
            <EyeOff className="h-4 w-4 mr-1.5" />
            Disable Preview
          </Button>
          <Button
            size="sm"
            onClick={launchConfirm}
            disabled={statusMut.isPending || status === "live"}
          >
            <Rocket className="h-4 w-4 mr-1.5" />
            Launch Country
          </Button>
        </div>

        {status === "preview" && (
          <p className="rounded-md bg-muted/60 border px-3 py-2 text-xs text-muted-foreground">
            <strong>Preview mode:</strong> only Super Admins can access {form.domain ?? form.name}.
            Public visitors see the Coming Soon page; registration and login are blocked.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Domain" value={form.domain ?? ""} onChange={(v) => set("domain", v)} />
          <Field label="Currency" value={form.currency ?? ""} onChange={(v) => set("currency", v)} />
          <Field
            label="Currency symbol"
            value={form.currency_symbol ?? ""}
            onChange={(v) => set("currency_symbol", v)}
          />
          <Field
            label="Payment provider"
            value={form.payment_provider ?? ""}
            onChange={(v) => set("payment_provider", v)}
          />
          <Field label="Phone code" value={form.phone_code ?? ""} onChange={(v) => set("phone_code", v)} />
          <Field
            label="Support email"
            value={form.support_email ?? ""}
            onChange={(v) => set("support_email", v)}
          />
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={updateMut.isPending}
            onClick={() =>
              updateMut.mutate({
                code: form.code,
                domain: form.domain ?? undefined,
                currency: form.currency ?? undefined,
                currency_symbol: form.currency_symbol ?? undefined,
                payment_provider: form.payment_provider ?? undefined,
                phone_code: form.phone_code ?? undefined,
                support_email: form.support_email ?? undefined,
              })
            }
          >
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
