// Lightweight notification sound + browser notification helpers.
// Uses Web Audio API so no asset bundling is required.

let ctx: AudioContext | null = null;
let lastPlayAt = 0;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  try {
    const Ctor: typeof AudioContext | undefined =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Play a short, soft "pop" chime (~350ms). Throttled so rapid bursts of
 * messages never play more than once every 1.5s.
 */
export function playMessagePop(volume = 0.25): void {
  const now = Date.now();
  if (now - lastPlayAt < 1500) return;
  lastPlayAt = now;

  const ac = getCtx();
  if (!ac) return;
  try {
    if (ac.state === "suspended") void ac.resume();
    const t = ac.currentTime;

    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.09);

    const v = Math.max(0, Math.min(1, volume));
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(v, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);

    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  } catch {
    // ignore - audio is best-effort
  }
}

/** Returns the current Notification permission or "unsupported". */
export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Ask the browser for notification permission. Safe to call repeatedly. */
export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export const SOUND_PREF_EVENT = "shootbase:sound-pref-change";
