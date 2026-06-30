import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProThread = {
  qr_id: string;
  job_id: string | null;
  title: string;
  city: string;
  event_date: string | null;
  event_time: string | null;
  budget_band: string | null;
  details: string | null;
  customer_id: string;
  customer_name: string | null;
  client_display_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  last_message_at: string | null;
  last_message_body: string | null;
  last_message_sender: string | null;
  last_message_source: string | null;
  unread_count: number;
  status: string;
  archived_by_pro: boolean;
  hired: boolean;
  closed: boolean;
  client_status: string;
};

export type MessageAttachment = {
  id: string;
  message_id: string;
  storage_path: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
};

export type ThreadMessage = {
  id: string;
  quote_request_id: string;
  sender_id: string;
  body: string;
  source: string;
  read_at: string | null;
  delivered_at: string;
  created_at: string;
  attachments?: MessageAttachment[];
};

export const listProThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc("my_pro_threads");
    if (error) throw new Error(error.message);
    return (data ?? []) as ProThread[];
  });

export type CustomerThread = {
  qr_id: string;
  job_id: string | null;
  job_title: string | null;
  professional_id: string;
  professional_name: string | null;
  professional_slug: string | null;
  status: string;
  last_message_at: string | null;
  last_message_body: string | null;
  unread_count: number;
  hired: boolean;
  client_status: string;
};

export const listCustomerThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: qrs, error } = await supabase
      .from("quote_requests")
      .select(
        "id, job_id, status, client_status, last_message_at, created_at, hired, professional:professionals(id, business_name, slug), job:jobs(title)" as any,
      )
      .eq("customer_id", userId)
      .eq("deleted_by_customer", false)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    const rows = (qrs ?? []) as any[];
    const ids = rows.map((r) => r.id);
    const unread: Record<string, number> = {};
    const lastBody: Record<string, string> = {};
    if (ids.length) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, quote_request_id, sender_id, body, read_at, created_at" as any)
        .in("quote_request_id", ids)
        .order("created_at", { ascending: false });
      for (const m of ((msgs ?? []) as any[])) {
        if (!lastBody[m.quote_request_id]) lastBody[m.quote_request_id] = m.body;
        if (m.sender_id !== userId && !m.read_at) unread[m.quote_request_id] = (unread[m.quote_request_id] ?? 0) + 1;
      }
    }
    return rows.map<CustomerThread>((r) => ({
      qr_id: r.id,
      job_id: r.job_id,
      job_title: r.job?.title ?? null,
      professional_id: r.professional?.id ?? "",
      professional_name: r.professional?.business_name ?? null,
      professional_slug: r.professional?.slug ?? null,
      status: r.status,
      last_message_at: r.last_message_at ?? r.created_at,
      last_message_body: lastBody[r.id] ?? null,
      unread_count: unread[r.id] ?? 0,
      hired: !!r.hired,
      client_status: r.client_status ?? "new",
    }));
  });

export const listThreadMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ qr_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select("id, quote_request_id, sender_id, body, source, read_at, delivered_at, created_at" as any)
      .eq("quote_request_id", data.qr_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const msgs = (rows ?? []) as unknown as ThreadMessage[];
    const ids = msgs.map((m) => m.id);
    if (ids.length) {
      const { data: atts } = await context.supabase
        .from("message_attachments" as any)
        .select("id, message_id, storage_path, filename, mime_type, size_bytes")
        .in("message_id", ids);
      const byMsg: Record<string, MessageAttachment[]> = {};
      for (const a of ((atts ?? []) as any[])) {
        (byMsg[a.message_id] ||= []).push(a as MessageAttachment);
      }
      for (const m of msgs) m.attachments = byMsg[m.id] ?? [];
    }
    return msgs;
  });

export const sendThreadMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        qr_id: z.string().uuid(),
        body: z.string().trim().max(5000).optional().default(""),
        source: z.enum(["web", "mobile", "email", "system"]).default("web"),
        attachments: z
          .array(
            z.object({
              storage_path: z.string().min(1).max(500),
              filename: z.string().min(1).max(255),
              mime_type: z.string().max(150).optional().nullable(),
              size_bytes: z.number().int().nonnegative().optional().nullable(),
            }),
          )
          .max(10)
          .optional()
          .default([]),
      })
      .refine((v) => v.body.trim().length > 0 || (v.attachments?.length ?? 0) > 0, {
        message: "Message body or at least one attachment is required",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Enforce the initial-contact lock: a professional may only send 1 message
    // until the client replies. The conversation unlocks once the client posts a message.
    const { data: qr, error: qrErr } = await context.supabase
      .from("quote_requests")
      .select("id, customer_id, professional_id")
      .eq("id", data.qr_id)
      .single();
    if (qrErr || !qr) throw new Error("Conversation not found");

    const senderIsClient = (qr as any).customer_id === context.userId;
    if (!senderIsClient) {
      // Enforce phone verification before a Pro can contact a client.
      const { requireProPhoneVerified } = await import("@/lib/pro-verification.functions");
      await requireProPhoneVerified(context.supabase as never, context.userId);

      // Sender is the professional — check if client has replied yet
      const { data: msgs } = await context.supabase
        .from("messages")
        .select("sender_id")
        .eq("quote_request_id", data.qr_id);
      const list = (msgs ?? []) as Array<{ sender_id: string }>;
      const proAlreadySent = list.some((m) => m.sender_id === context.userId);
      const clientReplied = list.some((m) => m.sender_id === (qr as any).customer_id);
      if (proAlreadySent && !clientReplied) {
        throw new Error("AWAITING_CLIENT_REPLY");
      }
    }

    const bodyText = data.body.trim().length
      ? data.body.trim()
      : data.attachments.length === 1
        ? `📎 ${data.attachments[0].filename}`
        : `📎 ${data.attachments.length} attachments`;
    const { error, data: inserted } = await context.supabase
      .from("messages")
      .insert({
        quote_request_id: data.qr_id,
        sender_id: context.userId,
        body: bodyText,
        source: data.source,
      } as any)
      .select("id, quote_request_id, sender_id, body, source, read_at, delivered_at, created_at" as any)
      .single();
    if (error) throw new Error(error.message);

    const message = inserted as unknown as ThreadMessage;
    let attachments: MessageAttachment[] = [];
    if (data.attachments.length) {
      const rows = data.attachments.map((a) => ({
        message_id: message.id,
        quote_request_id: data.qr_id,
        uploaded_by: context.userId,
        storage_path: a.storage_path,
        filename: a.filename,
        mime_type: a.mime_type ?? null,
        size_bytes: a.size_bytes ?? null,
      }));
      const { data: ins, error: aErr } = await context.supabase
        .from("message_attachments" as any)
        .insert(rows as any)
        .select("id, message_id, storage_path, filename, mime_type, size_bytes");
      if (aErr) throw new Error(aErr.message);
      attachments = (ins ?? []) as unknown as MessageAttachment[];
    }
    message.attachments = attachments;

    // Fire-and-forget: notify the other party by email. Never block the message insert.
    try {
      const { enqueueNewMessageEmail } = await import('@/lib/new-message-email.server');
      await enqueueNewMessageEmail({
        qrId: data.qr_id,
        messageId: message.id,
        senderUserId: context.userId,
        body: bodyText,
      });
    } catch (e) {
      console.error('[sendThreadMessage] email notify failed', e);
    }

    return message;
  });

export const signMessageAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ attachment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: att, error } = await context.supabase
      .from("message_attachments" as any)
      .select("storage_path, filename")
      .eq("id", data.attachment_id)
      .single();
    if (error || !att) throw new Error("Attachment not found");
    const a = att as unknown as { storage_path: string; filename: string };
    const { data: signed, error: sErr } = await context.supabase
      .storage
      .from("message-attachments")
      .createSignedUrl(a.storage_path, 300, { download: a.filename });
    if (sErr || !signed) throw new Error(sErr?.message ?? "Could not sign URL");
    return { url: signed.signedUrl, filename: a.filename };
  });

export const markThreadRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ qr_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("mark_thread_read", { _qr_id: data.qr_id });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateThreadFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        qr_id: z.string().uuid(),
        archived_by_pro: z.boolean().optional(),
        hired: z.boolean().optional(),
        closed: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.archived_by_pro !== undefined) patch.archived_by_pro = data.archived_by_pro;
    if (data.hired !== undefined) patch.hired = data.hired;
    if (data.closed !== undefined) patch.closed = data.closed;
    if (data.hired) patch.status = "accepted";
    if (data.closed) {
      patch.status = "cancelled";
      patch.client_status = "closed";
    }
    const { error } = await context.supabase
      .from("quote_requests")
      .update(patch as any)
      .eq("id", data.qr_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteThreadForMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ qr_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("delete_thread_for_me", { _qr_id: data.qr_id });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

