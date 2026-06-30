import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  playMessagePop,
  notificationPermission,
  SOUND_PREF_EVENT,
} from "@/lib/notification-sound";

type MessageRow = {
  id: string;
  sender_id: string;
  body: string;
  quote_request_id: string;
  created_at: string;
};

/**
 * Global listener that plays a soft sound (and optionally shows a browser
 * notification) whenever the current user receives a new message in any
 * conversation. Mounted once near the app root.
 *
 * Notes:
 * - Realtime respects RLS, so we only ever receive messages the user is
 *   allowed to read.
 * - We dedupe across tabs via BroadcastChannel and across resubscriptions
 *   via a local Set of message IDs.
 * - Sounds are throttled inside `playMessagePop`.
 * - We ignore messages older than 60s to avoid replaying on reconnect/backfill.
 */
export function MessageNotifier() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let authSub: { unsubscribe: () => void } | null = null;
    let bc: BroadcastChannel | null = null;
    const seen = new Set<string>();
    let soundEnabled = true;
    let userId: string | null = null;
    let starting = false;

    try {
      bc = new BroadcastChannel("shootbase-message-notif");
      bc.addEventListener("message", (e: MessageEvent) => {
        const id = (e.data as { id?: string } | null)?.id;
        if (id) seen.add(id);
      });
    } catch {
      bc = null;
    }

    function onPrefChange(e: Event) {
      const detail = (e as CustomEvent<{ enabled: boolean }>).detail;
      if (detail && typeof detail.enabled === "boolean") {
        soundEnabled = detail.enabled;
      }
    }
    window.addEventListener(SOUND_PREF_EVENT, onPrefChange);

    async function start() {
      if (starting) return;
      starting = true;
      const { data: userRes } = await supabase.auth.getUser();
      if (cancelled || !userRes.user) { starting = false; return; }
      userId = userRes.user.id;

      const { data: prof } = await supabase
        .from("profiles")
        .select("sound_new_message" as never)
        .eq("id", userId)
        .maybeSingle();
      const pref = (prof as { sound_new_message?: boolean } | null)?.sound_new_message;
      if (typeof pref === "boolean") soundEnabled = pref;

      if (channel) {
        await supabase.removeChannel(channel);
        channel = null;
      }

      channel = supabase
        .channel(`msg-notify-${userId}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const row = payload.new as MessageRow | null;
            if (!row || !userId || row.sender_id === userId) return;
            if (seen.has(row.id)) return;
            seen.add(row.id);
            bc?.postMessage({ id: row.id });

            // Ignore old messages (e.g. replayed on reconnect)
            const age = Date.now() - new Date(row.created_at).getTime();
            if (Number.isFinite(age) && age > 60_000) return;

            const onThisThread =
              window.location.pathname.includes(`/threads/${row.quote_request_id}`);

            if (soundEnabled) {
              playMessagePop(onThisThread ? 0.12 : 0.28);
            }

            if (
              notificationPermission() === "granted" &&
              document.visibilityState !== "visible"
            ) {
              void showBrowserNotification(row);
            }
          },
        )
        .subscribe();
      starting = false;
    }

    async function showBrowserNotification(row: MessageRow) {
      try {
        const { data: sender } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", row.sender_id)
          .maybeSingle();
        const title = sender?.full_name?.trim() || "New message";
        const body = row.body.length > 140 ? `${row.body.slice(0, 137)}…` : row.body;
        const n = new Notification(title, {
          body,
          tag: `thread-${row.quote_request_id}`,
          icon: "/favicon.ico",
        });
        n.onclick = () => {
          window.focus();
          void navigate({ to: "/threads/$id", params: { id: row.quote_request_id } });
          n.close();
        };
      } catch {
        // ignore
      }
    }

    void start();

    // Restart subscription on sign-in/sign-out so it reflects the active user.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        if (channel) {
          supabase.removeChannel(channel);
          channel = null;
        }
        userId = null;
        if (event !== "SIGNED_OUT") void start();
      }
    });
    authSub = sub.subscription;

    return () => {
      cancelled = true;
      window.removeEventListener(SOUND_PREF_EVENT, onPrefChange);
      if (channel) supabase.removeChannel(channel);
      authSub?.unsubscribe();
      bc?.close();
    };
  }, [navigate]);

  return null;
}
