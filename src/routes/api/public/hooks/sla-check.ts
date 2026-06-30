import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint — scans tickets crossing into "due soon" or "overdue" and
// notifies the assigned staff member (and any active admins) once per event.
// Called by pg_cron every few minutes.
export const Route = createFileRoute("/api/public/hooks/sla-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        const callerSecret =
          request.headers.get("x-cron-secret") ??
          (request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
        if (!cronSecret || callerSecret.length === 0 || callerSecret !== cronSecret) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();
        const nowIso = now.toISOString();
        // 30 minutes from now → "due soon" threshold
        const soonIso = new Date(now.getTime() + 30 * 60_000).toISOString();

        const { data: tickets, error } = await supabaseAdmin
          .from("support_requests")
          .select(
            "id, category, message, assigned_to, status, first_response_due_at, resolution_due_at, first_responded_at, resolved_at, sla_due_soon_notified_at, sla_breach_notified_at",
          )
          .in("status", ["open", "in_progress"])
          .or(
            `first_response_due_at.lte.${soonIso},resolution_due_at.lte.${soonIso}`,
          )
          .limit(500);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        // Load active admins / super_admins for fallback notifications.
        const { data: admins } = await supabaseAdmin
          .from("staff_accounts")
          .select("user_id, role")
          .eq("status", "active")
          .in("role", ["admin", "super_admin"]);
        const adminIds = (admins ?? []).map((a) => a.user_id);

        let dueSoon = 0;
        let overdue = 0;

        for (const t of tickets ?? []) {
          const respDue = t.first_response_due_at ? new Date(t.first_response_due_at) : null;
          const resDue = t.resolution_due_at ? new Date(t.resolution_due_at) : null;
          const respPending = !t.first_responded_at;
          const resPending = !t.resolved_at;

          const isOverdue =
            (respPending && respDue && respDue <= now) ||
            (resPending && resDue && resDue <= now);
          const isDueSoon =
            !isOverdue &&
            ((respPending && respDue && respDue <= new Date(now.getTime() + 30 * 60_000)) ||
              (resPending && resDue && resDue <= new Date(now.getTime() + 30 * 60_000)));

          if (isOverdue && !t.sla_breach_notified_at) {
            const preview = (t.message ?? "").slice(0, 140);
            const recipients = new Set<string>([
              ...(t.assigned_to ? [t.assigned_to] : []),
              ...adminIds,
            ]);
            const rows = Array.from(recipients).map((uid) => ({
              user_id: uid,
              title: `⚠️ SLA breached: ${t.category ?? "Support ticket"}`,
              body: `Ticket #${t.id.slice(0, 8)} is overdue — ${preview}`,
              url: `/admin/tickets/${t.id}`,
            }));
            if (rows.length) await supabaseAdmin.from("notifications").insert(rows);
            await supabaseAdmin
              .from("support_requests")
              .update({ sla_breach_notified_at: nowIso })
              .eq("id", t.id);
            overdue++;
          } else if (isDueSoon && !t.sla_due_soon_notified_at) {
            const preview = (t.message ?? "").slice(0, 140);
            const recipients = new Set<string>(
              t.assigned_to ? [t.assigned_to] : adminIds,
            );
            const rows = Array.from(recipients).map((uid) => ({
              user_id: uid,
              title: `⏰ SLA due soon: ${t.category ?? "Support ticket"}`,
              body: `Ticket #${t.id.slice(0, 8)} — ${preview}`,
              url: `/admin/tickets/${t.id}`,
            }));
            if (rows.length) await supabaseAdmin.from("notifications").insert(rows);
            await supabaseAdmin
              .from("support_requests")
              .update({ sla_due_soon_notified_at: nowIso })
              .eq("id", t.id);
            dueSoon++;
          }
        }

        return new Response(
          JSON.stringify({ ok: true, scanned: tickets?.length ?? 0, dueSoon, overdue }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
