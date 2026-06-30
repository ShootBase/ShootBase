import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// Mailgun inbound email webhook.
//
// When a customer replies by email to a Shootbase support reply, Mailgun
// forwards the message to this endpoint as multipart/form-data. We:
//   1. Verify the Mailgun signature (if a signing key is configured)
//   2. Extract the ticket reference from the Subject ([#xxxxxxxx])
//   3. Match by short-id + sender email
//   4. Insert the plain-text body as a customer reply (admin_notes row with
//      author_user_id = null, is_public = true) so it appears in the
//      conversation thread.
//   5. Re-open the ticket and bump updated_at.
//
// To activate, configure a Mailgun Route on the shootbase.co.uk
// inbound domain that matches recipient support@shootbase.co.uk
// and forwards inbound mail to:
//   https://www.shootbase.co.uk/api/public/support/inbound
// then set the MAILGUN_WEBHOOK_SIGNING_KEY secret.

function verifyMailgun(token: string, timestamp: string, signature: string, key: string): boolean {
  try {
    const expected = createHmac("sha256", key).update(timestamp + token).digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function stripQuotedReply(text: string): string {
  if (!text) return "";
  // Common reply boundaries: "On <date> ... wrote:", lines starting with ">"
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+ wrote:\s*$/i.test(line)) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line)) break;
    if (/^From:\s.+/i.test(line) && out.length > 0) break;
    out.push(line);
  }
  // Drop trailing quoted ">" block
  while (out.length && /^[>\s]*$/.test(out[out.length - 1])) out.pop();
  return out.join("\n").trim();
}

function extractShortId(...sources: Array<string | null | undefined>): string | null {
  // Accept "[#abc12345]", "[TICKET #abc12345]", "[Ticket# abc12345]" — case/space tolerant
  const re = /\[\s*(?:TICKET\s*)?#\s*([a-f0-9]{6,12})\s*\]/i;
  for (const s of sources) {
    if (!s) continue;
    const m = s.match(re);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

function normaliseEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Mailgun "sender" is the bare email; "From" may be "Name <a@b.com>"
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

export const Route = createFileRoute("/api/public/support/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const token = String(form.get("token") ?? "");
        const timestamp = String(form.get("timestamp") ?? "");
        const signature = String(form.get("signature") ?? "");
        if (signingKey) {
          if (!token || !timestamp || !signature) {
            return new Response("Missing signature", { status: 401 });
          }
          // Reject signatures older than 5 minutes (replay protection)
          const ts = parseInt(timestamp, 10);
          if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
            return new Response("Stale signature", { status: 401 });
          }
          if (!verifyMailgun(token, timestamp, signature, signingKey)) {
            return new Response("Invalid signature", { status: 401 });
          }
        }

        const subject = String(form.get("subject") ?? form.get("Subject") ?? "");
        const sender =
          normaliseEmail(String(form.get("sender") ?? "")) ??
          normaliseEmail(String(form.get("from") ?? form.get("From") ?? ""));
        const bodyPlain = String(form.get("stripped-text") ?? form.get("body-plain") ?? "");
        const cleanBody = stripQuotedReply(bodyPlain).slice(0, 10000);

        if (!sender || !cleanBody) {
          // Accept silently so Mailgun doesn't retry.
          return Response.json({ ok: true, skipped: "no_body_or_sender" });
        }

        const inReplyTo = String(form.get("In-Reply-To") ?? form.get("in-reply-to") ?? "");
        const references = String(form.get("References") ?? form.get("references") ?? "");
        const shortId = extractShortId(subject, inReplyTo, references, bodyPlain);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Try to find ticket by short id + sender; fall back to most recent
        // ticket from this sender.
        let ticketId: string | null = null;
        if (shortId) {
          const { data: byId } = await supabaseAdmin
            .from("support_requests")
            .select("id, email")
            .ilike("id", `${shortId}%`)
            .limit(5);
          const match = (byId ?? []).find(
            (t) => (t.email ?? "").toLowerCase() === sender,
          );
          if (match) ticketId = match.id;
          // If sender doesn't match but short-id is unique, still thread.
          if (!ticketId && (byId ?? []).length === 1) ticketId = byId![0].id;
        }
        if (!ticketId) {
          const { data: recent } = await supabaseAdmin
            .from("support_requests")
            .select("id")
            .ilike("email", sender)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (recent) ticketId = recent.id;
        }

        if (!ticketId) {
          // No matching ticket — accept but skip.
          return Response.json({ ok: true, skipped: "no_match" });
        }

        // Insert as customer reply (author_user_id null marks it as inbound).
        const { error: insErr } = await supabaseAdmin.from("admin_notes").insert({
          support_request_id: ticketId,
          author_user_id: null,
          body: cleanBody,
          is_public: true,
        });
        if (insErr) {
          return new Response(JSON.stringify({ error: insErr.message }), { status: 500 });
        }

        // Re-open the ticket so it surfaces in the inbox.
        const { data: ticketRow } = await supabaseAdmin
          .from("support_requests")
          .update({
            status: "open",
            admin_viewed_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", ticketId)
          .select("id, category, assigned_to")
          .maybeSingle();

        // Notify the assigned admin (if any) so they see a new reply.
        if (ticketRow?.assigned_to) {
          const preview = cleanBody.slice(0, 160);
          await supabaseAdmin.from("notifications").insert({
            user_id: ticketRow.assigned_to,
            title: `Customer replied: ${ticketRow.category ?? "Support request"}`,
            body: `#${ticketId.slice(0, 8).toUpperCase()} — ${preview}`,
            url: `/admin/tickets/${ticketId}`,
          });
        }

        return Response.json({ ok: true, ticket_id: ticketId });
      },
    },
  },
});
