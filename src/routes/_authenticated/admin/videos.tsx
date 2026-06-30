import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  adminListPortfolioVideos,
  adminRemovePortfolioVideo,
  adminDismissVideoReport,
} from "@/lib/admin/portfolio-videos.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/videos")({
  head: () => ({
    meta: [{ title: "Video moderation — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminVideosPage,
});

type Row = {
  id: string;
  country: string;
  business_name: string;
  professional_id: string;
  title: string | null;
  status: string;
  is_active: boolean;
  duration_seconds: number | null;
  size_bytes: number | null;
  playback_url: string;
  thumbnail_url: string | null;
  created_at: string;
  reports: Array<{
    id: string;
    reason: string;
    notes: string | null;
    status: string;
    created_at: string;
  }>;
};

function fmtDur(s: number | null) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}
function fmtMB(b: number | null) {
  if (!b) return "—";
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function AdminVideosPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<"reported" | "all">("reported");
  const [country, setCountry] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setRows(null);
    try {
      const r = await adminListPortfolioVideos();
      setRows(r.videos as Row[]);
      setCountry(r.country);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function remove(id: string) {
    if (!confirm("Permanently remove this video?")) return;
    setBusyId(id);
    try {
      await adminRemovePortfolioVideo({ data: { id } });
      toast.success("Video removed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(reportId: string) {
    try {
      await adminDismissVideoReport({ data: { report_id: reportId } });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const filtered = (rows ?? []).filter((r) =>
    filter === "reported" ? r.reports.some((x) => x.status === "open") : true,
  );

  return (
    <AdminShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio video moderation</h1>
            <p className="text-sm text-muted-foreground">Scope: {country}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={filter === "reported" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("reported")}
            >
              Reported
            </Button>
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All
            </Button>
          </div>
        </div>

        {rows === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to review.</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((v) => (
              <li key={v.id} className="border rounded-lg overflow-hidden bg-card">
                <div className="aspect-video bg-muted relative">
                  {v.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.thumbnail_url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : null}
                  <a
                    href={v.playback_url}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-sm"
                  >
                    Open video ▶
                  </a>
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{v.title ?? "Untitled"}</span>
                    <Badge variant="outline">{v.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {v.business_name} · {fmtDur(v.duration_seconds)} · {fmtMB(v.size_bytes)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Uploaded {new Date(v.created_at).toLocaleString()}
                  </p>

                  {v.reports.length > 0 && (
                    <div className="border-t pt-2 space-y-1">
                      <p className="text-xs font-semibold">Reports ({v.reports.length})</p>
                      {v.reports.map((r) => (
                        <div
                          key={r.id}
                          className="text-[11px] flex items-start justify-between gap-2"
                        >
                          <div>
                            <Badge variant="secondary" className="mr-1">
                              {r.reason}
                            </Badge>
                            {r.notes && <span className="text-muted-foreground">{r.notes}</span>}
                          </div>
                          {r.status === "open" && (
                            <button
                              onClick={() => void dismiss(r.id)}
                              className="text-muted-foreground hover:text-foreground underline"
                            >
                              dismiss
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyId === v.id}
                      onClick={() => void remove(v.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
