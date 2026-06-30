import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Phone,
  Mail,
  MessageCircle,
  Paperclip,
  Smile,
  Send,
  ArrowLeft,
  Info,
  Circle,
  Trash2,
  Calendar,
  MapPin,
  Wallet,
  User as UserIcon,
  CheckCheck,
  Check,
  Archive,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { ProShell } from "@/components/site/ProShell";
import { supabase } from "@/integrations/supabase/client";
import { AttachmentList } from "@/components/messages/AttachmentList";
import { uploadMessageAttachments, MAX_ATTACHMENTS } from "@/lib/message-uploads";
import {
  listProThreads,
  listThreadMessages,
  sendThreadMessage,
  markThreadRead,
  updateThreadFlags,
  type ProThread,
  type ThreadMessage,
} from "@/lib/messages.functions";
import { Loader2, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pro/responses")({
  validateSearch: (s: Record<string, unknown>) => ({ c: typeof s.c === "string" ? s.c : undefined }),
  head: () => ({
    meta: [
      { title: "Messages — Shootbase" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResponsesPage,
});

type LeadStatus = "new" | "contacted" | "negotiating" | "hired" | "closed";

const STATUS_META: Record<LeadStatus, { label: string; dot: string; chip: string }> = {
  new:         { label: "New",         dot: "bg-blue-500",   chip: "bg-blue-50 text-blue-700 border-blue-200" },
  contacted:   { label: "Contacted",   dot: "bg-sky-500",    chip: "bg-sky-50 text-sky-700 border-sky-200" },
  negotiating: { label: "Negotiating", dot: "bg-orange-500", chip: "bg-orange-50 text-orange-700 border-orange-200" },
  hired:       { label: "Hired",       dot: "bg-emerald-500",chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  closed:      { label: "Closed",      dot: "bg-zinc-400",   chip: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};

type FilterKey = "all" | "unread" | "active" | "hired" | "archived";
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "active", label: "Active" },
  { key: "hired", label: "Hired" },
  { key: "archived", label: "Archived" },
];

type Note = { id: string; text: string; ts: number };
type Quote = { id: string; amount: string; status: "sent" | "accepted" | "rejected"; ts: number };
type LocalCrm = { status: LeadStatus; notes: Note[]; quotes: Quote[] };

const CRM_KEY = "shootbase.responses.crm.v2";

function loadCrm(): Record<string, LocalCrm> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(CRM_KEY) || "{}"); } catch { return {}; }
}
function saveCrm(s: Record<string, LocalCrm>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CRM_KEY, JSON.stringify(s));
}

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
function sourceLabel(src: string | null | undefined, mine: boolean) {
  if (!src) return mine ? "Sent via Web" : "";
  switch (src) {
    case "email": return mine ? "Sent via Email" : "Replied via Email";
    case "mobile": return mine ? "Sent via Mobile" : "Sent via Mobile";
    case "system": return "System";
    default: return mine ? "Sent via Web" : "Sent via Web";
  }
}

function ResponsesPage() {
  const search = useSearch({ from: Route.id });
  const [threads, setThreads] = useState<ProThread[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mobileView, setMobileView] = useState<"list" | "chat" | "details">("list");
  const [crm, setCrm] = useState<Record<string, LocalCrm>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // load me + threads
  useEffect(() => {
    setCrm(loadCrm());
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
    void refreshThreads(true);
    // realtime: any new message or qr change → refresh threads
    const channel = supabase
      .channel("pro-responses")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => void refreshThreads(false))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quote_requests" }, () => void refreshThreads(false))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { saveCrm(crm); }, [crm]);

  // honor ?c=<qr_id>
  useEffect(() => {
    if (search.c) { setSelectedId(search.c); setMobileView("chat"); }
  }, [search.c]);

  const refreshThreads = useCallback(async (initial: boolean) => {
    try {
      const list = await listProThreads();
      setThreads(list);
      if (initial && list.length && !selectedId) {
        setSelectedId(list[0].qr_id);
      }
    } catch { /* ignore */ } finally {
      if (initial) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // when selected changes — load messages + mark read + subscribe per-thread
  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    let cancelled = false;
    const load = async () => {
      const ms = await listThreadMessages({ data: { qr_id: selectedId } });
      if (!cancelled) setMessages(ms);
      try { await markThreadRead({ data: { qr_id: selectedId } }); } catch { /* */ }
      void refreshThreads(false);
    };
    void load();
    const ch = supabase
      .channel(`thread-${selectedId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `quote_request_id=eq.${selectedId}` },
        () => void load(),
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [selectedId, refreshThreads]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads.filter((t) => {
      if (filter === "unread" && t.unread_count === 0) return false;
      if (filter === "active" && (t.archived_by_pro || t.closed)) return false;
      if (filter === "hired" && !t.hired) return false;
      if (filter === "archived" && !t.archived_by_pro) return false;
      if (filter === "all" && t.archived_by_pro) return false;
      if (!q) return true;
      return [t.title, t.city, (t.client_display_name ?? t.customer_name)].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [threads, query, filter]);

  const selected = threads.find((t) => t.qr_id === selectedId) ?? null;
  const local = selected
    ? crm[selected.qr_id] ?? { status: "new" as LeadStatus, notes: [], quotes: [] }
    : null;

  // Initial-contact lock: pro may send only one message until client replies.
  const proLocked = useMemo(() => {
    if (!selected || !meId) return false;
    const proSent = messages.some((m) => m.sender_id === meId && m.source !== "system");
    const clientReplied = messages.some((m) => m.sender_id === selected.customer_id);
    return proSent && !clientReplied;
  }, [messages, selected, meId]);


  function updateLocal(id: string, patch: Partial<LocalCrm>) {
    setCrm((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { status: "new", notes: [], quotes: [] }), ...patch } }));
  }

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
      if (!crm[selected.qr_id] || crm[selected.qr_id].status === "new") {
        updateLocal(selected.qr_id, { status: "contacted" });
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Failed to send";
      if (errMsg.includes("PRO_PHONE_VERIFICATION_REQUIRED")) {
        const go = window.confirm("Please verify your mobile number before continuing.\n\nVerify Mobile Number now?");
        if (go) window.location.href = "/account/settings#phone";
      } else {
        alert(errMsg);
      }
      setComposer(body);
      setPendingFiles(files);
    } finally {
      setSending(false);
    }
  }

  async function flag(patch: { archived_by_pro?: boolean; hired?: boolean; closed?: boolean }) {
    if (!selected) return;
    await updateThreadFlags({ data: { qr_id: selected.qr_id, ...patch } });
    void refreshThreads(false);
  }

  function addNote(text: string) {
    if (!selected || !text.trim()) return;
    updateLocal(selected.qr_id, {
      notes: [{ id: crypto.randomUUID(), text: text.trim(), ts: Date.now() }, ...(local?.notes ?? [])],
    });
  }
  function deleteNote(id: string) {
    if (!selected) return;
    updateLocal(selected.qr_id, { notes: (local?.notes ?? []).filter((n) => n.id !== id) });
  }
  async function handleDelete() {
    if (!selected) return;
    if (!window.confirm("Delete this chat from your inbox? The client will still see it on their side.")) return;
    try {
      const { deleteThreadForMe } = await import("@/lib/messages.functions");
      await deleteThreadForMe({ data: { qr_id: selected.qr_id } });
      setThreads((prev) => prev.filter((t) => t.qr_id !== selected.qr_id));
      setSelectedId(null);
      setMobileView("list");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }


  return (
    <ProShell>
      <div className="h-[calc(100vh-73px)] bg-zinc-50 flex flex-col">
        {loading ? (
          <div className="flex-1 grid place-items-center text-sm text-ink/60">Loading conversations…</div>
        ) : threads.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_360px]">
            {/* COLUMN 1 — Inbox */}
            <aside className={`${mobileView === "list" ? "flex" : "hidden"} md:flex flex-col bg-white border-r border-zinc-200 min-h-0`}>
              <div className="p-4 border-b border-zinc-200 space-y-3">
                <h1 className="font-display text-xl">Inbox</h1>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search conversations"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-100 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                </div>
                <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={`shrink-0 px-3 py-1 text-xs rounded-full border transition ${
                        filter === f.key
                          ? "bg-ink text-paper border-ink"
                          : "bg-white text-ink/70 border-zinc-200 hover:border-ink/30"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="p-6 text-xs text-ink/50 text-center">No conversations match.</p>
                ) : (
                  filtered.map((t) => {
                    const serverStatus: LeadStatus = t.client_status === "closed" || t.closed
                      ? "closed"
                      : t.hired ? "hired"
                      : t.client_status === "contacted" ? "contacted"
                      : (crm[t.qr_id]?.status ?? "new") as LeadStatus;
                    const meta = STATUS_META[serverStatus] ?? STATUS_META.new;
                    const active = t.qr_id === selectedId;
                    const fromMe = t.last_message_sender === meId;
                    return (
                      <button
                        key={t.qr_id}
                        onClick={() => { setSelectedId(t.qr_id); setMobileView("chat"); }}
                        className={`w-full text-left p-3 border-b border-zinc-100 flex gap-3 hover:bg-zinc-50 transition ${
                          active ? "bg-gold/5 border-l-2 border-l-gold" : ""
                        }`}
                      >
                        <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-ink to-zinc-700 text-paper grid place-items-center text-xs font-semibold relative">
                          {initials((t.client_display_name ?? t.customer_name))}
                          {t.unread_count > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center">
                              {t.unread_count}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-sm truncate ${t.unread_count > 0 ? "font-semibold" : "font-medium"}`}>
                              {(t.client_display_name ?? t.customer_name) || "Client"}
                            </p>
                            <span className="text-[10px] text-ink/50 shrink-0">{timeAgo(t.last_message_at)}</span>
                          </div>
                          <p className="text-xs text-ink/60 truncate">{t.title}</p>
                          <p className="text-[11px] text-ink/40 truncate flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" /> {t.city}
                          </p>
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${meta.chip}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                            </span>
                            {t.last_message_body && (
                              <span className={`text-[11px] truncate max-w-[140px] ${t.unread_count > 0 ? "text-ink font-medium" : "text-ink/50"}`}>
                                {fromMe ? "You: " : ""}{t.last_message_body}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* COLUMN 2 — Conversation */}
            <section className={`${mobileView === "chat" ? "flex" : "hidden"} md:flex flex-col min-h-0 bg-white border-r border-zinc-200`}>
              {selected && local ? (
                <>
                  <header className="px-5 py-3 border-b border-zinc-200 flex items-center gap-3">
                    <button onClick={() => setMobileView("list")} className="md:hidden p-1.5 -ml-1 hover:bg-zinc-100 rounded">
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-ink to-zinc-700 text-paper grid place-items-center text-xs font-semibold relative">
                      {initials((selected.client_display_name ?? selected.customer_name))}
                      <Circle className="absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-emerald-500 text-emerald-500 stroke-white stroke-[3]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{(selected.client_display_name ?? selected.customer_name) || "Client"}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-ink/50 truncate">{selected.title}</p>
                        {(() => {
                          const s = selected.client_status === "closed" || selected.closed ? "closed"
                            : selected.client_status === "contacted" ? "contacted" : "new";
                          const map: Record<string, string> = {
                            new: "bg-blue-50 text-blue-700 border-blue-200",
                            contacted: "bg-sky-50 text-sky-700 border-sky-200",
                            closed: "bg-zinc-100 text-zinc-600 border-zinc-300",
                          };
                          return <span className={`inline-flex items-center px-1.5 py-0.5 text-[9px] uppercase tracking-widest border rounded ${map[s]}`}>{s}</span>;
                        })()}
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-1">
                      <IconBtn href={selected.customer_phone ? `tel:${selected.customer_phone}` : undefined} icon={<Phone className="h-4 w-4" />} label="Call" />
                      <IconBtn
                        href={selected.customer_phone ? `https://wa.me/${selected.customer_phone.replace(/\D/g, "")}` : undefined}
                        icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp"
                      />
                      <IconBtn href={selected.customer_email ? `mailto:${selected.customer_email}` : undefined} icon={<Mail className="h-4 w-4" />} label="Email" />
                      <button
                        onClick={() => void handleDelete()}
                        title="Delete chat"
                        className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete chat
                      </button>
                    </div>
                    <button onClick={() => setMobileView("details")} className="xl:hidden p-2 hover:bg-zinc-100 rounded">
                      <Info className="h-4 w-4" />
                    </button>
                  </header>

                  <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-3 bg-zinc-50">
                    {messages.length === 0 ? (
                      <p className="text-center text-xs text-ink/40 py-8">No messages yet — send the first hello.</p>
                    ) : (
                      messages.map((m) =>
                        m.source === "system" ? (
                          <SystemEvent key={m.id} text={m.body} ts={m.created_at} />
                        ) : (
                          <Bubble key={m.id} msg={m} mine={m.sender_id === meId} />
                        ),
                      )
                    )}
                  </div>

                  <div className="border-t border-zinc-200 p-3 bg-white space-y-2">
                    {proLocked && (
                      <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900">
                        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="font-medium">Awaiting client reply</span>
                        <span className="text-amber-800/80 hidden sm:inline">— you can continue the conversation once the client replies.</span>
                      </div>
                    )}
                    {pendingFiles.length > 0 && !proLocked && (
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
                    <div className={`flex items-end gap-2 rounded-2xl px-3 py-2 ${proLocked ? "bg-zinc-100 opacity-60" : "bg-zinc-50"}`}>
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
                        disabled={proLocked || sending || pendingFiles.length >= MAX_ATTACHMENTS}
                        title={proLocked ? "Waiting for client reply" : "Attach files"}
                        className="p-2 text-ink/60 hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>
                      <button className="p-2 text-ink/50 hover:text-ink" disabled={proLocked}><Smile className="h-4 w-4" /></button>
                      <textarea
                        value={composer}
                        onChange={(e) => setComposer(e.target.value)}
                        onKeyDown={(e) => { if (!proLocked && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                        rows={1}
                        disabled={proLocked}
                        placeholder={proLocked ? "Waiting for client to reply…" : "Write a message…"}
                        className="flex-1 resize-none bg-transparent border-0 focus:outline-none text-sm py-2 max-h-32 disabled:cursor-not-allowed"
                      />
                      <button
                        onClick={() => void send()}
                        disabled={proLocked || sending || (!composer.trim() && pendingFiles.length === 0)}
                        className="p-2 bg-ink text-paper rounded-full hover:bg-gold disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-ink/40 mt-1.5 text-center">
                      {proLocked
                        ? "Conversation locked until the client replies."
                        : "Your client will get an email notification for each message you send."}
                    </p>
                  </div>

                </>
              ) : (
                <div className="flex-1 grid place-items-center text-sm text-ink/50">Select a conversation</div>
              )}
            </section>

            {/* COLUMN 3 — Details */}
            <aside className={`${mobileView === "details" ? "flex" : "hidden"} xl:flex flex-col min-h-0 bg-white overflow-y-auto`}>
              {selected && local ? (
                <DetailsPanel
                  thread={selected}
                  local={local}
                  onStatus={(s) => updateLocal(selected.qr_id, { status: s })}
                  onAddNote={addNote}
                  onDeleteNote={deleteNote}
                  onCreateQuote={() => {}}
                  onArchive={() => void flag({ archived_by_pro: !selected.archived_by_pro })}
                  onHired={() => void flag({ hired: !selected.hired })}
                  onClose={() => void flag({ closed: !selected.closed })}
                  onBack={() => setMobileView("chat")}
                />
              ) : (
                <div className="flex-1 grid place-items-center text-sm text-ink/50">No project selected</div>
              )}
            </aside>
          </div>
        )}
      </div>
    </ProShell>
  );
}

function IconBtn({ icon, label, href }: { icon: React.ReactNode; label: string; href?: string }) {
  const cls = "p-2 text-ink/60 hover:text-ink hover:bg-zinc-100 rounded-lg transition";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" title={label} className={cls}>{icon}</a>
  ) : (
    <button title={label} className={cls + " opacity-40 cursor-not-allowed"}>{icon}</button>
  );
}

function Bubble({ msg, mine }: { msg: ThreadMessage; mine: boolean }) {
  const read = msg.read_at != null;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
        mine ? "bg-ink text-paper rounded-br-sm" : "bg-white border border-zinc-200 rounded-bl-sm"
      }`}>
        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        {msg.attachments && msg.attachments.length > 0 && (
          <AttachmentList attachments={msg.attachments} mine={mine} />
        )}
        <div className={`mt-1 text-[10px] flex items-center gap-1.5 ${mine ? "text-paper/60 justify-end" : "text-ink/40"}`}>
          <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          {msg.source && msg.source !== "web" && (
            <span className="opacity-80">· {sourceLabel(msg.source, mine)}</span>
          )}
          {mine && (read
            ? (<><CheckCheck className="h-3 w-3 text-sky-300" /><span>Read</span></>)
            : (<><Check className="h-3 w-3" /><span>Sent</span></>))}
        </div>
      </div>
    </div>
  );
}

function SystemEvent({ text, ts }: { text: string; ts: string | number }) {
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts;
  return (
    <div className="flex items-center gap-2 text-[11px] text-ink/40 justify-center py-1">
      <div className="h-px bg-zinc-200 flex-1 max-w-[60px]" />
      <span>{text} · {new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
      <div className="h-px bg-zinc-200 flex-1 max-w-[60px]" />
    </div>
  );
}

function DetailsPanel({
  thread, local, onStatus, onAddNote, onDeleteNote, onCreateQuote, onArchive, onHired, onClose, onBack,
}: {
  thread: ProThread;
  local: LocalCrm;
  onStatus: (s: LeadStatus) => void;
  onAddNote: (t: string) => void;
  onDeleteNote: (id: string) => void;
  onCreateQuote: (a: string) => void;
  onArchive: () => void;
  onHired: () => void;
  onClose: () => void;
  onBack: () => void;
}) {
  const [noteDraft, setNoteDraft] = useState("");
  return (
    <div className="flex flex-col">
      <header className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between sticky top-0 bg-white z-10">
        <h2 className="font-display text-lg">Project details</h2>
        <button onClick={onBack} className="xl:hidden text-xs text-ink/60">Back</button>
      </header>

      <Section title="Quick actions">
        <div className="grid grid-cols-3 gap-1.5">
          <ActionBtn icon={<CheckCircle2 className="h-3.5 w-3.5" />} label={thread.hired ? "Hired ✓" : "Mark Hired"} active={thread.hired} onClick={onHired} tone="emerald" />
          <ActionBtn icon={<Archive className="h-3.5 w-3.5" />} label={thread.archived_by_pro ? "Unarchive" : "Archive"} active={thread.archived_by_pro} onClick={onArchive} tone="zinc" />
          <ActionBtn icon={<XCircle className="h-3.5 w-3.5" />} label={thread.closed ? "Reopen" : "Close"} active={thread.closed} onClick={onClose} tone="rose" />
        </div>
      </Section>

      <Section title="Summary">
        <Field icon={<UserIcon className="h-3.5 w-3.5" />} label="Client" value={(thread.client_display_name ?? thread.customer_name) || "—"} />
        <Field label="Service" value={thread.title} />
        <Field label="Thread" value={thread.qr_id.slice(0, 8)} mono />
      </Section>

      <Section title="Status">
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(STATUS_META) as LeadStatus[]).map((s) => {
            const meta = STATUS_META[s];
            const active = local.status === s;
            return (
              <button
                key={s}
                onClick={() => onStatus(s)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition ${
                  active ? `${meta.chip} font-semibold` : "bg-white border-zinc-200 text-ink/70 hover:border-ink/30"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Project details">
        <Field icon={<MapPin className="h-3.5 w-3.5" />} label="Location" value={thread.city || "—"} />
        {thread.event_date && (
          <Field icon={<Calendar className="h-3.5 w-3.5" />} label="Date" value={
            new Date(thread.event_date).toLocaleDateString() + (thread.event_time ? ` · ${thread.event_time.slice(0, 5)}` : "")
          } />
        )}
        {thread.budget_band && <Field icon={<Wallet className="h-3.5 w-3.5" />} label="Budget" value={thread.budget_band} />}
        {thread.details && (
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-widest text-ink/40 mb-1">Description</p>
            <p className="text-sm text-ink/80 whitespace-pre-wrap">{thread.details}</p>
          </div>
        )}
      </Section>

      <Section title="Contact">
        {thread.customer_phone && (
          <a href={`tel:${thread.customer_phone}`} className="flex items-center gap-2 text-sm text-ink hover:text-gold">
            <Phone className="h-3.5 w-3.5" /> {thread.customer_phone}
          </a>
        )}
        {thread.customer_email && (
          <a href={`mailto:${thread.customer_email}`} className="flex items-center gap-2 text-sm text-ink hover:text-gold break-all">
            <Mail className="h-3.5 w-3.5" /> {thread.customer_email}
          </a>
        )}
      </Section>


      <Section title="Internal notes">
        <div className="flex gap-1.5 mb-2">
          <input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { onAddNote(noteDraft); setNoteDraft(""); } }}
            placeholder="Add a private note…"
            className="flex-1 px-2.5 py-1.5 text-xs bg-zinc-50 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-gold/40"
          />
          <button
            onClick={() => { onAddNote(noteDraft); setNoteDraft(""); }}
            className="px-2.5 py-1.5 text-xs bg-ink text-paper rounded-lg hover:bg-gold"
          >Add</button>
        </div>
        {local.notes.length === 0 ? (
          <p className="text-xs text-ink/40">Notes are private to you.</p>
        ) : local.notes.map((n) => (
          <div key={n.id} className="group bg-amber-50 border border-amber-100 rounded-lg p-2 mb-1.5">
            <p className="text-xs text-ink/80 whitespace-pre-wrap">{n.text}</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-ink/40">{timeAgo(n.ts)} ago</span>
              <button onClick={() => onDeleteNote(n.id)} className="opacity-0 group-hover:opacity-100 text-ink/40 hover:text-red-600">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}

function ActionBtn({
  icon, label, active, onClick, tone,
}: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; tone: "emerald" | "rose" | "zinc" }) {
  const tones = {
    emerald: active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "border-zinc-200 text-ink/70 hover:border-emerald-300",
    rose: active ? "bg-rose-50 text-rose-700 border-rose-200" : "border-zinc-200 text-ink/70 hover:border-rose-300",
    zinc: active ? "bg-zinc-100 text-ink border-zinc-300" : "border-zinc-200 text-ink/70 hover:border-ink/30",
  };
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 px-2 py-2 text-[11px] rounded-lg border transition ${tones[tone]}`}>
      {icon}{label}
    </button>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-zinc-100">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] uppercase tracking-widest text-ink/40 font-semibold">{title}</h3>
        {action}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Field({ icon, label, value, mono }: { icon?: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-ink/50 text-xs flex items-center gap-1.5">{icon}{label}</span>
      <span className={`text-ink text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 grid place-items-center px-6">
      <div className="text-center max-w-md">
        <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-gold/10 text-gold grid place-items-center">
          <MessageCircle className="h-7 w-7" />
        </div>
        <h2 className="font-display text-2xl mb-2">No conversations yet</h2>
        <p className="text-sm text-ink/60 mb-6">
          Unlock a project from the marketplace to start a conversation. Every message you send notifies the client by email.
        </p>
        <Link to="/pro/leads" className="inline-flex items-center gap-2 bg-ink text-paper px-5 py-3 text-xs uppercase tracking-widest rounded-lg hover:bg-gold transition">
          Browse Projects Marketplace
        </Link>
      </div>
    </div>
  );
}
