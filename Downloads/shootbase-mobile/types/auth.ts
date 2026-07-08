import type { Session, User } from '@supabase/supabase-js';

import type { AppRole, Profile } from '@/types/database';

export type MobileRole = 'client' | 'pro';

export type AuthProfileError = 'missing_profile' | 'missing_role' | null;

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: MobileRole | null;
  accountType: AppRole | null;
  profileError: AuthProfileError;
  isLoading: boolean;
  isInitialized: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    accountType: MobileRole,
  ) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};
