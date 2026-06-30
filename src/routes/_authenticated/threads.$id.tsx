import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getThread, sendMessage, updateQuoteStatus } from "@/lib/marketplace.functions";
import { deleteThreadForMe, markThreadRead } from "@/lib/messages.functions";
import { canReviewPro } from "@/lib/reviews.functions";
import { SiteHeader } from "@/components/site/Header";
import { DashboardFooter } from "@/components/site/DashboardFooter";
import { ClientMobileNav } from "@/components/site/ClientMobileNav";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Check, CheckCheck } from "lucide-react";
import { SocialLinks } from "@/components/pro/SocialLinks";
import { LeaveReviewDialog } from "@/components/reviews/LeaveReviewDialog";

export const Route = createFileRoute("/_authenticated/threads/$id")({
  head: () => ({ meta: [{ title: "Conversation — Shootbase" }, { name: "robots", content: "noindex" }] }),
  component: Thread,
});

type QR = {
  id: string;
  status: string;
  client_status?: string | null;
  closed?: boolean | null;
  customer_id: string;
  professional_id: string;
  job_id: string | null;
  quoted_price_pence: number | null;
  professional: { id: string; business_name: string; slug: string; website?: string | null; instagram?: string | null; facebook?: string | null; tiktok?: string | null; linkedin?: string | null; twitter?: string | null; youtube?: string | null } | null;
} | null;
type Msg = { id: string; sender_id: string; body: string; created_at: string; read_at: string | null };

function StatusBadge({ status }: { status: string }) {
  const meta: Record<string, { label: string; cls: string }> = {
    new: { label: "New", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    contacted: { label: "Contacted", cls: "bg-sky-50 text-sky-700 border-sky-200" },
    closed: { label: "Closed", cls: "bg-zinc-100 text-zinc-600 border-zinc-300" },
  };
  const m = meta[status] ?? meta.new;
  return <span className={`inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-widest border ${m.cls}`}>{m.label}</span>;
}

function Thread() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [qr, setQr] = useState<QR>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    const r = await getThread({ data: { id } });
    setQr(r.qr as QR);
    setMessages(r.messages as Msg[]);
    try { await markThreadRead({ data: { qr_id: id } }); } catch {/* */}
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    void load();
    // Debounce realtime refetches: many events in quick succession trigger only one reload.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 200);
    };
    const channel = supabase
      .channel(`thread-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `quote_request_id=eq.${id}` }, scheduleReload)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quote_requests", filter: `id=eq.${id}` }, scheduleReload)
      .subscribe();
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const [sending, setSending] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    const draft = body;
    try {
      await sendMessage({ data: { quote_request_id: id, body: draft } });
      setBody("");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not send message.";
      if (/AWAITING_CLIENT_REPLY/i.test(msg)) {
        toast.error("Please wait for the client to reply before sending another message.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSending(false);
    }
  }

  async function setStatus(status: "accepted" | "declined" | "completed" | "cancelled") {
    await updateQuoteStatus({ data: { id, status } });
    await load();
  }

  async function handleDelete() {
    await deleteThreadForMe({ data: { qr_id: id } });
    // Route each role back to their own dashboard — previously sent everyone
    // (including Pros) to the Client dashboard, which then bounced them.
    navigate({ to: isPro ? "/pro/dashboard" : "/dashboard" });
  }

  const isCustomer = qr?.customer_id === userId;
  const isPro = !!qr && !isCustomer;
  // Pro unlocking the project creates the quote_requests row, so socials are visible to the client immediately on unlock.
  const showProContacts = isCustomer && !!qr?.professional;
  const clientStatus = (qr?.client_status as string) ?? "new";
  const [eligible, setEligible] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  useEffect(() => {
    if (!isCustomer || !qr?.job_id || !qr?.professional_id) { setEligible(false); return; }
    canReviewPro({ data: { pro_id: qr.professional_id, job_id: qr.job_id } })
      .then((r) => setEligible(r.eligible))
      .catch(() => setEligible(false));
  }, [isCustomer, qr?.job_id, qr?.professional_id, qr?.id]);

  return (
    <div className="dashboard-readable bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <div className="max-w-3xl w-full mx-auto px-6 py-8 flex-1 flex flex-col">
        <header className="border border-ink/10 p-4 mb-4">
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-2xl truncate">{qr?.professional?.business_name ?? "Conversation"}</p>
                {showProContacts && qr?.professional && (
                  <SocialLinks
                    website={qr.professional.website}
                    instagram={qr.professional.instagram}
                    facebook={qr.professional.facebook}
                    tiktok={qr.professional.tiktok}
                    linkedin={qr.professional.linkedin}
                    twitter={qr.professional.twitter}
                    youtube={qr.professional.youtube}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <StatusBadge status={clientStatus} />
                <span className="font-mono text-[10px] uppercase text-ink/40">{qr?.status}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete chat"
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest border border-ink/20 px-2 py-1 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600"
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
              <StatusControls qr={qr} isPro={isPro} isCustomer={isCustomer} onSet={setStatus} />
            </div>
          </div>
        </header>

        <div className="flex-1 border border-ink/10 p-4 overflow-y-auto space-y-3 min-h-[400px] bg-white">
          {messages.map((m) => {
            const mine = m.sender_id === userId;
            const read = !!m.read_at;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-4 py-2 text-sm ${mine ? "bg-ink text-paper" : "bg-secondary"}`}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  {mine && (
                    <div className="mt-1 flex items-center gap-1 justify-end text-[10px] text-paper/70">
                      {read ? (
                        <>
                          <CheckCheck className="h-3 w-3 text-sky-300" />
                          <span>Read</span>
                        </>
                      ) : (
                        <>
                          <Check className="h-3 w-3" />
                          <span>Sent</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="flex gap-2 mt-3">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a message…"
            disabled={sending}
            className="flex-1 border border-ink/15 px-4 py-3 text-sm focus:outline-none focus:border-gold disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="bg-ink text-paper px-6 text-xs uppercase tracking-widest hover:bg-gold disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </form>

        {eligible && qr?.professional && qr?.job_id && (
          <div className="border border-gold/30 bg-gold/5 p-4 mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-lg">Leave a review</p>
              <p className="text-xs text-ink/60">Share your experience working with {qr.professional.business_name}.</p>
            </div>
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="text-xs uppercase tracking-widest bg-ink text-paper px-5 py-2.5 hover:bg-gold"
            >
              Write review
            </button>
          </div>
        )}
        {qr?.professional && qr?.job_id && (
          <LeaveReviewDialog
            open={reviewOpen}
            onOpenChange={setReviewOpen}
            proId={qr.professional_id}
            jobId={qr.job_id}
            proName={qr.professional.business_name}
            onSubmitted={() => { setEligible(false); void load(); }}
          />
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center p-4">
          <div className="bg-white max-w-sm w-full p-6 border border-ink/10">
            <p className="font-display text-xl mb-2">Delete this chat?</p>
            <p className="text-sm text-ink/70 mb-4">It will be removed from your inbox. The other person can still see the conversation on their side.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(false)} className="text-xs uppercase tracking-widest px-4 py-2 border border-ink/20">Cancel</button>
              <button onClick={() => void handleDelete()} className="text-xs uppercase tracking-widest px-4 py-2 bg-rose-600 text-white hover:bg-rose-700">Delete</button>
            </div>
          </div>
        </div>
      )}
      <DashboardFooter />
      <ClientMobileNav />
    </div>
  );
}

function StatusControls({
  qr,
  isPro,
  isCustomer,
  onSet,
}: {
  qr: QR;
  isPro: boolean;
  isCustomer: boolean;
  onSet: (s: "accepted" | "declined" | "completed" | "cancelled") => void;
}) {
  if (!qr) return null;

  if (isPro && qr.status === "accepted") {
    return (
      <button onClick={() => onSet("completed")} className="text-[10px] uppercase tracking-widest bg-gold text-white px-3 py-2">
        Mark completed
      </button>
    );
  }

  if (isCustomer && qr.status === "pending") {
    return (
      <div className="flex gap-2">
        <button onClick={() => onSet("accepted")} className="text-[10px] uppercase tracking-widest bg-ink text-paper px-3 py-2">
          Mark hired
        </button>
      </div>
    );
  }
  return null;
}

