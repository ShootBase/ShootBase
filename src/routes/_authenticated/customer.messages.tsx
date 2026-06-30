import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Send, ArrowLeft, MapPin, Trash2, Paperclip, X, Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/site/Header";
import { DashboardFooter } from "@/components/site/DashboardFooter";
import { ClientMobileNav } from "@/components/site/ClientMobileNav";
import { supabase } from "@/integrations/supabase/client";
import { AttachmentList } from "@/components/messages/AttachmentList";
import { uploadMessageAttachments, MAX_ATTACHMENTS } from "@/lib/message-uploads";
import {
  listCustomerThreads,
  listThreadMessages,
  sendThreadMessage,
  markThreadRead,
  deleteThreadForMe,
  type CustomerThread,
  type ThreadMessage,
} from "@/lib/messages.functions";

export const Route = createFileRoute("/_authenticated/customer/messages")({
  validateSearch: (s: Record<string, unknown>) => ({ c: typeof s.c === "string" ? s.c : undefined }),
  head: () => ({
    meta: [
      { title: "Messages — Shootbase" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CustomerMessagesPage,
});

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
function timeAgo(ts?: string | number | null) {
  if (!ts) return "";
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return new Date(t).toLocaleDateString();
}

function CustomerMessagesPage() {
  const search = useSearch({ from: Route.id });
  const [threads, setThreads] = useState<CustomerThread[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (initial: boolean) => {
    try {
      const list = await listCustomerThreads();
      setThreads(list);
      if (initial && list.length && !selectedId) setSelectedId(list[0].qr_id);
    } catch { /* ignore */ }
    finally { if (initial) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
    void refresh(true);
    const channel = supabase
      .channel("customer-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => void refresh(false))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quote_requests" }, () => void refresh(false))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  useEffect(() => {
    if (search.c) { setSelectedId(search.c); setMobileView("chat"); }
  }, [search.c]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    let cancelled = false;
    const load = async () => {
      const ms = await listThreadMessages({ data: { qr_id: selectedId } });
      if (!cancelled) setMessages(ms);
      try { await markThreadRead({ data: { qr_id: selectedId } }); } catch { /* */ }
      void refresh(false);
    };
    void load();
    const ch = supabase
      .channel(`c-thread-${selectedId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `quote_request_id=eq.${selectedId}` },
        () => void load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [selectedId, refresh]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) =>
      [t.professional_name, t.job_title, t.last_message_body].some((v) => (v || "").toLowerCase().includes(q)),
    );
  }, [threads, query]);

  const selected = threads.find((t) => t.qr_id === selectedId) ?? null;

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setPendingFiles((prev) => {
      const next = [...prev];
      for (const f of Array.from(list)) {
        if (next.length >= MAX_ATTACHMENTS) break;
        next.push(f);
      }
      return next;
    });
  }

  async function send() {
    if (!selected || sending) return;
    if (!composer.trim() && pendingFiles.length === 0) return;
    setSending(true);
    const body = composer.trim();
    const files = pendingFiles;
    setComposer("");
    setPendingFiles([]);
    try {
      const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
      const uploaded = files.length ? await uploadMessageAttachments(selected.qr_id, files) : [];
      const msg = await sendThreadMessage({
        data: {
          qr_id: selected.qr_id,
          body,
          source: isMobile ? "mobile" : "web",
          attachments: uploaded,
        },
      });
      setMessages((prev) => [...prev, msg]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to send");
      setComposer(body);
      setPendingFiles(files);
    } finally { setSending(false); }
  }

  async function handleDelete() {
    if (!selected) return;
    if (!window.confirm("Delete this chat from your inbox?")) return;
    try {
      await deleteThreadForMe({ data: { qr_id: selected.qr_id } });
      setThreads((prev) => prev.filter((t) => t.qr_id !== selected.qr_id));
      setSelectedId(null);
      setMobileView("list");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <div className="dashboard-readable bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="h-[calc(100vh-73px)] bg-zinc-50 flex flex-col">
          {loading ? (
            <div className="flex-1 grid place-items-center text-sm text-ink/60">Loading conversations…</div>
          ) : threads.length === 0 ? (
            <div className="flex-1 grid place-items-center text-center px-6">
              <div>
                <p className="font-display text-2xl mb-2">No messages yet</p>
                <p className="text-sm text-ink/60">When a professional contacts you about a job, the conversation will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr]">
              {/* Inbox */}
              <aside className={`${mobileView === "list" ? "flex" : "hidden"} md:flex flex-col bg-white border-r border-zinc-200 min-h-0`}>
                <div className="p-4 border-b border-zinc-200 space-y-3">
                  <h1 className="font-display text-xl">Messages</h1>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search conversations"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-100 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-gold/40"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="p-6 text-xs text-ink/50 text-center">No conversations match.</p>
                  ) : (
                    filtered.map((t) => {
                      const active = t.qr_id === selectedId;
                      const fromMe = meId !== null && false; // last_message_sender not exposed for client list
                      return (
                        <button
                          key={t.qr_id}
                          onClick={() => { setSelectedId(t.qr_id); setMobileView("chat"); }}
                          className={`w-full text-left p-3 border-b border-zinc-100 flex gap-3 hover:bg-zinc-50 transition ${
                            active ? "bg-gold/5 border-l-2 border-l-gold" : ""
                          }`}
                        >
                          <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-ink to-zinc-700 text-paper grid place-items-center text-xs font-semibold relative">
                            {initials(t.professional_name)}
                            {t.unread_count > 0 && (
                              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center">
                                {t.unread_count}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-sm truncate ${t.unread_count > 0 ? "font-semibold" : "font-medium"}`}>
                                {t.professional_name || "Professional"}
                              </p>
                              <span className="text-[10px] text-ink/50 shrink-0">{timeAgo(t.last_message_at)}</span>
                            </div>
                            {t.job_title && <p className="text-xs text-ink/60 truncate">{t.job_title}</p>}
                            {t.last_message_body && (
                              <p className={`text-[11px] truncate mt-0.5 ${t.unread_count > 0 ? "text-ink font-medium" : "text-ink/50"}`}>
                                {fromMe ? "You: " : ""}{t.last_message_body}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>

              {/* Conversation */}
              <section className={`${mobileView === "chat" ? "flex" : "hidden"} md:flex flex-col min-h-0 bg-white`}>
                {selected ? (
                  <>
                    <header className="px-5 py-3 border-b border-zinc-200 flex items-center gap-3">
                      <button onClick={() => setMobileView("list")} className="md:hidden p-1.5 -ml-1 hover:bg-zinc-100 rounded">
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-ink to-zinc-700 text-paper grid place-items-center text-xs font-semibold">
                        {initials(selected.professional_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{selected.professional_name || "Professional"}</p>
                        {selected.job_title && (
                          <p className="text-xs text-ink/50 truncate flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {selected.job_title}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => void handleDelete()}
                        title="Delete chat"
                        className="p-1.5 text-ink/50 hover:text-rose-600 hover:bg-rose-50 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </header>

                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50">
                      {messages.length === 0 ? (
                        <p className="text-center text-xs text-ink/50 py-12">Start the conversation.</p>
                      ) : (
                        messages.map((m) => {
                          const mine = m.sender_id === meId;
                          return (
                            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                                mine ? "bg-ink text-paper rounded-br-sm" : "bg-white border border-zinc-200 rounded-bl-sm"
                              }`}>
                                {m.body}
                                {m.attachments && m.attachments.length > 0 && (
                                  <AttachmentList attachments={m.attachments} mine={mine} />
                                )}
                                <div className={`text-[10px] mt-1 ${mine ? "text-paper/60" : "text-ink/40"}`}>
                                  {timeAgo(m.created_at)}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <form
                      onSubmit={(e) => { e.preventDefault(); void send(); }}
                      className="p-3 border-t border-zinc-200 bg-white space-y-2"
                    >
                      {pendingFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {pendingFiles.map((f, i) => (
                            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 bg-zinc-100 text-ink rounded-full pl-3 pr-1 py-1 text-xs max-w-[220px]">
                              <span className="truncate">{f.name}</span>
                              <button
                                type="button"
                                onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                                className="rounded-full p-0.5 hover:bg-zinc-200"
                                aria-label={`Remove ${f.name}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-end gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          hidden
                          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={sending || pendingFiles.length >= MAX_ATTACHMENTS}
                          title="Attach files"
                          className="p-2.5 text-ink/60 hover:text-ink hover:bg-zinc-100 rounded-lg disabled:opacity-40"
                        >
                          <Paperclip className="h-4 w-4" />
                        </button>
                        <textarea
                          value={composer}
                          onChange={(e) => setComposer(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
                          }}
                          placeholder="Write a reply…"
                          rows={1}
                          className="flex-1 resize-none px-3 py-2 text-sm bg-zinc-100 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-gold/40 max-h-32"
                        />
                        <button
                          type="submit"
                          disabled={sending || (!composer.trim() && pendingFiles.length === 0)}
                          className="bg-ink text-paper p-2.5 rounded-lg hover:bg-gold disabled:opacity-50"
                        >
                          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="flex-1 grid place-items-center text-sm text-ink/50">Select a conversation</div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>
      <DashboardFooter />
      <ClientMobileNav />
    </div>
  );
}
