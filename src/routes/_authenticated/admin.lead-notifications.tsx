import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listLeadNotificationDebug, listMessageEmailDebug } from "@/lib/admin-notifications.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/lead-notifications")({
  head: () => ({
    meta: [
      { title: "Project notifications — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLeadNotifications,
});

type Row = {
  notification_id: string;
  job_id: string;
  pro_id: string;
  pro_business_name: string | null;
  pro_email: string | null;
  job_title: string | null;
  job_city: string | null;
  service_name: string | null;
  pref_mode: string;
  pref_inapp: boolean;
  notification_status: string;
  notification_type: string;
  created_at: string;
  sent_at: string | null;
  email_message_id: string | null;
  delivery_status: string | null;
  delivery_error: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  queued: "bg-sky-100 text-sky-900",
  sent: "bg-emerald-100 text-emerald-900",
  digest_sent: "bg-emerald-100 text-emerald-900",
  deferred: "bg-indigo-100 text-indigo-900",
  failed: "bg-rose-100 text-rose-900",
  skipped_pref: "bg-zinc-200 text-zinc-700",
  skipped_suppressed: "bg-zinc-200 text-zinc-700",
};

type MsgRow = {
  notification_id: string;
  message_id: string;
  quote_request_id: string;
  recipient_user_id: string;
  recipient_role: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  message_body: string | null;
  sender_id: string | null;
  job_title: string | null;
  delivery_status: string | null;
  delivery_error: string | null;
};

function AdminLeadNotifications() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [msgRows, setMsgRows] = useState<MsgRow[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [tab, setTab] = useState<"leads" | "messages">("leads");

  const load = async () => {
    try {
      const [r, m] = await Promise.all([
        listLeadNotificationDebug() as unknown as Promise<Row[]>,
        listMessageEmailDebug() as unknown as Promise<MsgRow[]>,
      ]);
      setRows(r);
      setMsgRows(m);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = filter === "all" ? rows : rows.filter((r) => r.notification_status === filter);
  const statusCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.notification_status] = (acc[r.notification_status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="bg-paper">
      <main className="max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Project Notifications — Debug</h1>
            <p className="text-sm text-muted-foreground">
              Last 200 project-match notifications across all Pros.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void load()}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-zinc-50"
            >
              Refresh
            </button>
            <Link
              to="/admin/settings"
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-zinc-50"
            >
              Settings
            </Link>
          </div>
        </div>

        <div className="flex gap-2 mb-4 border-b">
          <button
            onClick={() => setTab("leads")}
            className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab === "leads" ? "border-zinc-900 font-medium" : "border-transparent text-zinc-500"}`}
          >
            Project notifications ({rows.length})
          </button>
          <button
            onClick={() => setTab("messages")}
            className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab === "messages" ? "border-zinc-900 font-medium" : "border-transparent text-zinc-500"}`}
          >
            Message emails ({msgRows.length})
          </button>
        </div>

        {tab === "leads" && (
        <div className="flex gap-2 flex-wrap mb-4">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded-full text-xs ${filter === "all" ? "bg-zinc-900 text-white" : "bg-zinc-100"}`}
          >
            All ({rows.length})
          </button>
          {Object.entries(statusCounts).map(([s, n]) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-full text-xs ${filter === s ? "bg-zinc-900 text-white" : "bg-zinc-100"}`}
            >
              {s} ({n})
            </button>
          ))}
        </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : tab === "leads" ? (
          <div className="overflow-x-auto border rounded-lg bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-600">
                <tr>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Project</th>
                  <th className="px-3 py-2 text-left">Pro</th>
                  <th className="px-3 py-2 text-left">Pref</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Sent</th>
                  <th className="px-3 py-2 text-left">Delivery</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.notification_id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-zinc-600">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.job_title ?? "—"}</div>
                      <div className="text-xs text-zinc-500">
                        {r.service_name ?? "—"} · {r.job_city ?? "—"}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">{r.job_id.slice(0, 8)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.pro_business_name ?? "—"}</div>
                      <div className="text-xs text-zinc-500">{r.pro_email ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-zinc-100">
                        {r.pref_mode}
                      </span>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        in-app: {r.pref_inapp ? "on" : "off"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.notification_type}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          STATUS_COLORS[r.notification_status] ?? "bg-zinc-100"
                        }`}
                      >
                        {r.notification_status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{r.delivery_status ?? "—"}</div>
                      {r.delivery_error && (
                        <div className="text-rose-600 text-[10px] mt-0.5">{r.delivery_error}</div>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-zinc-500">
                      No notifications match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-lg bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-600">
                <tr>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Job / Message</th>
                  <th className="px-3 py-2 text-left">Recipient</th>
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Sent</th>
                  <th className="px-3 py-2 text-left">Delivery</th>
                </tr>
              </thead>
              <tbody>
                {msgRows.map((m) => (
                  <tr key={m.notification_id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-zinc-600">
                      {new Date(m.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{m.job_title ?? "(no job)"}</div>
                      <div className="text-xs text-zinc-500 line-clamp-2">{m.message_body ?? "—"}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">{m.message_id.slice(0, 8)}</div>
                    </td>
                    <td className="px-3 py-2 text-xs font-mono">{m.recipient_user_id.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-xs">{m.recipient_role}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          STATUS_COLORS[m.status] ?? "bg-zinc-100"
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {m.sent_at ? new Date(m.sent_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{m.delivery_status ?? "—"}</div>
                      {m.delivery_error && (
                        <div className="text-rose-600 text-[10px] mt-0.5">{m.delivery_error}</div>
                      )}
                    </td>
                  </tr>
                ))}
                {msgRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                      No message emails yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
