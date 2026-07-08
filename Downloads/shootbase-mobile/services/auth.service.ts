import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { MobileRole } from '@/types/auth';
import { getAuthErrorMessage } from '@/utils/auth-errors';
import { mobileRoleToAccountType } from '@/utils/roles';

import { updateProfileAccountType, updateProfileFullName } from './profile.service';

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(getAuthErrorMessage(error));
  }

  return data.session;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ user: User | null; session: Session | null; error: string | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    return { user: null, session: null, error: getAuthErrorMessage(error) };
  }

  return { user: data.user, session: data.session, error: null };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  fullName: string,
  role: MobileRole,
): Promise<{
  user: User | null;
  session: Session | null;
  error: string | null;
  needsEmailConfirmation: boolean;
}> {
  const accountType = mobileRoleToAccountType(role);

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        account_type: accountType,
      },
    },
  });

  if (error) {
    return {
      user: null,
      session: null,
      error: getAuthErrorMessage(error),
      needsEmailConfirmation: false,
    };
  }

  if (data.user && data.session) {
    await updateProfileFullName(data.user.id, fullName.trim());
    await updateProfileAccountType(data.user.id, accountType);
  }

  return {
    user: data.user,
    session: data.session,
    error: null,
    needsEmailConfirmation: Boolean(data.user && !data.session),
  };
}

export async function signOutUser(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { error: getAuthErrorMessage(error) };
  }

  return { error: null };
}
