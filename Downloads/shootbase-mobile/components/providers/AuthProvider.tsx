import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import {
  getCurrentSession,
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
} from '@/services/auth.service';
import { fetchProfile, updateProfileAccountType } from '@/services/profile.service';
import type {
  AuthContextValue,
  AuthProfileError,
  MobileRole,
} from '@/types/auth';
import type { AppRole, Profile } from '@/types/database';
import { getAuthErrorMessage } from '@/utils/auth-errors';
import {
  accountTypeToMobileRole,
  normalizeMetadataAccountType,
} from '@/utils/roles';

export const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

async function resolveProfile(
  user: User,
): Promise<{ profile: Profile | null; profileError: AuthProfileError }> {
  const { profile, error } = await fetchProfile(user.id);

  if (error) {
    throw new Error(error);
  }

  if (!profile) {
    return { profile: null, profileError: 'missing_profile' };
  }

  if (!profile.account_type) {
    const metadataAccountType = normalizeMetadataAccountType(user.user_metadata?.account_type);

    if (metadataAccountType && metadataAccountType !== 'admin') {
      const { error: updateError } = await updateProfileAccountType(
        user.id,
        metadataAccountType,
      );

      if (!updateError) {
        const refreshed = await fetchProfile(user.id);
        if (refreshed.profile?.account_type) {
          return { profile: refreshed.profile, profileError: null };
        }
      }
    }

    return { profile, profileError: 'missing_role' };
  }

  if (profile.account_type === 'admin') {
    return { profile, profileError: 'missing_role' };
  }

  return { profile, profileError: null };
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accountType, setAccountType] = useState<AppRole | null>(null);
  const [profileError, setProfileError] = useState<AuthProfileError>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const role = useMemo<MobileRole | null>(
    () => accountTypeToMobileRole(accountType),
    [accountType],
  );

  const applyAuthState = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);

    if (!nextSession?.user) {
      setUser(null);
      setProfile(null);
      setAccountType(null);
      setProfileError(null);
      return;
    }

    setUser(nextSession.user);

    try {
      const resolved = await resolveProfile(nextSession.user);
      setProfile(resolved.profile);
      setAccountType(resolved.profile?.account_type ?? null);
      setProfileError(resolved.profileError);
    } catch (error) {
      setProfile(null);
      setAccountType(null);
      setProfileError('missing_profile');
      console.error('Failed to load profile:', getAuthErrorMessage(error));
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const resolved = await resolveProfile(user);
      setProfile(resolved.profile);
      setAccountType(resolved.profile?.account_type ?? null);
      setProfileError(resolved.profileError);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    async function initializeAuth() {
      try {
        const existingSession = await getCurrentSession();
        if (isMounted) {
          await applyAuthState(existingSession);
        }
      } catch (error) {
        console.error('Failed to restore session:', getAuthErrorMessage(error));
      } finally {
        if (isMounted) {
          setIsInitialized(true);
        }
      }
    }

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!isMounted) return;
      await applyAuthState(nextSession);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [applyAuthState]);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await signInWithEmail(email, password);
      if (result.error) {
        return { error: result.error };
      }
      return { error: null };
    } catch (error) {
      return { error: getAuthErrorMessage(error) };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string, nextRole: MobileRole) => {
      setIsLoading(true);
      try {
        const result = await signUpWithEmail(email, password, fullName, nextRole);
        if (result.error) {
          return { error: result.error, needsEmailConfirmation: false };
        }
        return {
          error: null,
          needsEmailConfirmation: result.needsEmailConfirmation,
        };
      } catch (error) {
        return { error: getAuthErrorMessage(error), needsEmailConfirmation: false };
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      await signOutUser();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      role,
      accountType,
      profileError,
      isLoading,
      isInitialized,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [
      accountType,
      isInitialized,
      isLoading,
      profile,
      profileError,
      refreshProfile,
      role,
      session,
      signIn,
      signOut,
      signUp,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
