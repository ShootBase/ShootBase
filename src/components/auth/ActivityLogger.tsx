import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/admin/activity.functions";

/**
 * Listens to auth state changes and logs login / logout events
 * to the user_activity_log via the server fn (which uses an
 * append-only SECURITY DEFINER RPC).
 */
export function ActivityLogger() {
  const lastEventRef = useRef<string>("");

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      const key = `${event}:${session?.user?.id ?? ""}`;
      if (lastEventRef.current === key) return;
      lastEventRef.current = key;

      const userId = session?.user?.id;
      if (event === "SIGNED_IN" && userId) {
        const ua = typeof navigator !== "undefined" ? navigator.userAgent : undefined;
        logActivity({
          data: {
            user_id: userId,
            action_type: "login",
            action_description: "Signed in",
            user_agent: ua,
          },
        }).catch(() => {});
      }
      // We can't log SIGNED_OUT with the same user because the session is already cleared.
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}
