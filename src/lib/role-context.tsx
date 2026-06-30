import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/marketplace.functions";
import {
  clearAllRoleStorage,
  clearPendingRole,
  readActiveRole,
  readPendingRole,
  writeActiveRole,
} from "@/lib/role-storage";

type Role = "customer" | "professional";

export type RoleProfile = {
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  proId: string | null;
  hasProAvatar: boolean;
  proAvatarKind: "logo" | "photo" | null;
  businessName: string | null;
};

type RoleState = {
  loaded: boolean;
  roles: Role[];
  activeRole: Role | null;
  proSlug: string | null;
  profile: RoleProfile;
  refresh: () => Promise<void>;
  switchActiveRole: (role: Role) => void;
};

const RoleContext = createContext<RoleState | null>(null);

const EMPTY_PROFILE: RoleProfile = {
  displayName: "",
  initials: "",
  avatarUrl: null,
  proId: null,
  hasProAvatar: false,
  proAvatarKind: null,
  businessName: null,
};

function computeInitials(name: string): string {
  const n = name.trim();
  if (!n) return "•";
  const parts = n.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeRole, setActiveRole] = useState<Role | null>(null);
  const [proSlug, setProSlug] = useState<string | null>(null);
  const [profile, setProfile] = useState<RoleProfile>(EMPTY_PROFILE);
  const lastUserIdRef = useRef<string | null>(null);

  const resetState = useCallback(() => {
    setRoles([]);
    setActiveRole(null);
    setProSlug(null);
    setProfile(EMPTY_PROFILE);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      lastUserIdRef.current = null;
      clearAllRoleStorage();
      resetState();
      setLoaded(true);
      return;
    }
    const userId = session.user.id;
    // If the underlying user changed (e.g. signed in as a different account),
    // wipe any cached role state from the previous user before applying the new one.
    if (lastUserIdRef.current && lastUserIdRef.current !== userId) {
      resetState();
    }
    lastUserIdRef.current = userId;

    try {
      const me = await getMyProfile();
      const userRoles = (me.roles ?? []) as Role[];
      const fallback = (me.profile?.account_type as Role | undefined) ?? null;
      const merged = Array.from(new Set([...userRoles, ...(fallback ? [fallback] : [])]));
      setRoles(merged);
      setProSlug(me.professional?.slug ?? null);

      const stored = readActiveRole(userId);
      const pending = readPendingRole();
      // Single-role accounts are LOCKED to their one role. Cached/pending values
      // from a previous session can never flip a pro into customer (or vice versa).
      const candidate: Role | null = merged.length === 1
        ? merged[0]
        : (stored && merged.includes(stored) && stored) ||
          (pending && merged.includes(pending) && pending) ||
          (fallback && merged.includes(fallback) ? fallback : null) ||
          (merged[0] ?? null);
      clearPendingRole();
      setActiveRole(candidate);
      if (candidate) writeActiveRole(userId, candidate);


      const businessName = me.professional?.business_name ?? null;
      const personalName = (me.profile?.full_name as string | undefined)?.trim()
        || (me.professional?.contact_name as string | undefined)?.trim()
        || session.user.email?.split("@")[0]
        || "Account";
      const displayName = candidate === "professional" && businessName ? businessName : personalName;
      setProfile({
        displayName,
        initials: computeInitials(displayName),
        avatarUrl: (me.profile?.avatar_url as string | undefined) ?? null,
        proId: me.professional?.id ?? null,
        hasProAvatar: Boolean(me.professional?.avatar_path),
        proAvatarKind: (me.professional?.avatar_kind as "logo" | "photo" | null) ?? null,
        businessName,
      });
    } finally {
      setLoaded(true);
    }
  }, [resetState]);

  useEffect(() => {
    void refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        lastUserIdRef.current = null;
        clearAllRoleStorage();
        resetState();
        setLoaded(true);
        return;
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        // If a different user just signed in, drop stale state immediately so
        // consumers don't redirect off the previous role before refresh resolves.
        const nextId = session?.user.id ?? null;
        if (nextId && lastUserIdRef.current && lastUserIdRef.current !== nextId) {
          resetState();
          setLoaded(false);
        }
        void refresh();
      }
    });

    // Cross-tab sync: when another tab signs out or changes the active role,
    // re-run refresh so this tab converges.
    function onStorage(e: StorageEvent) {
      if (!e.key) return;
      if (
        e.key.startsWith("shootbase.activeRole") ||
        e.key === "shootbase.pendingRole" ||
        e.key.startsWith("sb-") // supabase auth token key
      ) {
        void refresh();
      }
    }
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
    return () => {
      sub.subscription.unsubscribe();
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    };
  }, [refresh, resetState]);

  const switchActiveRole = useCallback((role: Role) => {
    const userId = lastUserIdRef.current;
    // Guard: never switch to a role the user does not own. Prevents pro→client
    // (or client→pro) drift triggered by UI actions like "Post a Job".
    setRoles((current) => {
      if (!current.includes(role)) return current;
      if (userId) writeActiveRole(userId, role);
      setActiveRole(role);
      return current;
    });
  }, []);


  return (
    <RoleContext.Provider value={{ loaded, roles, activeRole, proSlug, profile, refresh, switchActiveRole }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleState {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
