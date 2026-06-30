import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const TIMEOUT_MS = 40 * 60 * 1000; // 40 min
const WARNING_MS = 35 * 60 * 1000; // warn at 35 min (5 min remaining)
const WARNING_WINDOW_SECONDS = 5 * 60;
const ACTIVITY_KEY = "shootbase.lastActivity";
const LOGOUT_BROADCAST_KEY = "shootbase.sessionTimeout.logout";
const EXPIRED_FLAG = "shootbase.sessionExpired";
const THROTTLE_MS = 1000;

export function SessionTimeout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [authed, setAuthed] = useState(false);
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_WINDOW_SECONDS);
  const lastActivityRef = useRef<number>(Date.now());
  const lastWriteRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track auth state
  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAuthed(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const recordActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    if (now - lastWriteRef.current > THROTTLE_MS) {
      lastWriteRef.current = now;
      try { localStorage.setItem(ACTIVITY_KEY, String(now)); } catch {}
    }
    if (warning) setWarning(false);
  }, [warning]);

  const doLogout = useCallback(async (broadcast: boolean) => {
    setWarning(false);
    if (broadcast) {
      try {
        localStorage.setItem(LOGOUT_BROADCAST_KEY, String(Date.now()));
        sessionStorage.setItem(EXPIRED_FLAG, "1");
      } catch {}
    }
    try { await supabase.auth.signOut(); } catch {}
    try { localStorage.removeItem(ACTIVITY_KEY); } catch {}
    navigate({ to: "/auth", replace: true });
  }, [navigate]);

  // Reset activity on route change (page navigation counts)
  useEffect(() => { if (authed) recordActivity(); }, [pathname, authed, recordActivity]);

  // Main inactivity loop + activity listeners + cross-tab sync
  useEffect(() => {
    if (!authed) {
      setWarning(false);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }

    recordActivity();

    const events: Array<keyof WindowEventMap> = [
      "mousemove", "mousedown", "keydown", "scroll", "touchstart", "click", "wheel", "focus",
    ];
    const handler = () => recordActivity();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));

    const onStorage = (e: StorageEvent) => {
      if (e.key === LOGOUT_BROADCAST_KEY) {
        // Another tab logged out due to timeout
        void doLogout(false);
      } else if (e.key === ACTIVITY_KEY && e.newValue) {
        const v = parseInt(e.newValue, 10);
        if (!Number.isNaN(v) && v > lastActivityRef.current) {
          lastActivityRef.current = v;
          if (warning) setWarning(false);
        }
      }
    };
    window.addEventListener("storage", onStorage);

    intervalRef.current = setInterval(() => {
      // Pull most-recent activity from any tab
      try {
        const stored = parseInt(localStorage.getItem(ACTIVITY_KEY) || "0", 10);
        if (stored > lastActivityRef.current) lastActivityRef.current = stored;
      } catch {}
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= TIMEOUT_MS) {
        void doLogout(true);
        return;
      }
      if (elapsed >= WARNING_MS) {
        setSecondsLeft(Math.max(0, Math.ceil((TIMEOUT_MS - elapsed) / 1000)));
        setWarning(true);
      } else if (warning) {
        setWarning(false);
      }
    }, 1000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      window.removeEventListener("storage", onStorage);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [authed, recordActivity, doLogout, warning]);

  if (!authed || !warning) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md bg-white border border-ink/15 shadow-xl p-6">
        <h2 id="session-timeout-title" className="font-display text-2xl font-bold mb-2">
          Still there?
        </h2>
        <p className="text-sm text-ink/70 mb-1">
          You've been inactive for a while. You will be logged out in 5 minutes.
        </p>
        <p className="text-xs font-mono uppercase tracking-widest text-gold mb-5">
          Logging out in {Math.floor(secondsLeft / 60)}m {String(secondsLeft % 60).padStart(2, "0")}s
        </p>
        <div className="flex gap-2 justify-end flex-wrap">
          <button
            onClick={() => void doLogout(false)}
            className="px-4 py-2 text-xs uppercase tracking-widest border border-ink/20 hover:border-ink"
          >
            Logout Now
          </button>
          <button
            onClick={recordActivity}
            className="px-4 py-2 text-xs uppercase tracking-widest bg-ink text-paper hover:bg-gold"
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
