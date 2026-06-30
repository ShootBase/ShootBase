// Per-user active role storage. Keying by user id prevents a previous
// account's role from leaking into a different account that signs in next.

export const LEGACY_ACTIVE_ROLE_KEY = "shootbase.activeRole";
export const PENDING_ROLE_KEY = "shootbase.pendingRole";
export const LAST_ACTIVITY_KEY = "shootbase.lastActivity";

export type StoredRole = "customer" | "professional";

function userKey(userId: string): string {
  return `${LEGACY_ACTIVE_ROLE_KEY}:${userId}`;
}

export function readActiveRole(userId: string): StoredRole | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(userKey(userId));
    return v === "customer" || v === "professional" ? v : null;
  } catch {
    return null;
  }
}

export function writeActiveRole(userId: string, role: StoredRole): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(userKey(userId), role);
  } catch {}
}

export function readPendingRole(): StoredRole | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(PENDING_ROLE_KEY);
    return v === "customer" || v === "professional" ? v : null;
  } catch {
    return null;
  }
}

export function writePendingRole(role: StoredRole): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_ROLE_KEY, role);
  } catch {}
}

export function clearPendingRole(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_ROLE_KEY);
  } catch {}
}

// Remove every active-role hint we've ever written (legacy + per-user) plus
// any session-bound metadata that should not survive sign-out.
export function clearAllRoleStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const ls = window.localStorage;
    const toRemove: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k) continue;
      if (k === LEGACY_ACTIVE_ROLE_KEY) toRemove.push(k);
      else if (k.startsWith(`${LEGACY_ACTIVE_ROLE_KEY}:`)) toRemove.push(k);
      else if (k === PENDING_ROLE_KEY) toRemove.push(k);
      else if (k === LAST_ACTIVITY_KEY) toRemove.push(k);
    }
    toRemove.forEach((k) => ls.removeItem(k));
  } catch {}
}
