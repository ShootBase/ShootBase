import { supabase } from '@/lib/supabase';
import type { AppRole, Profile } from '@/types/database';
import { getAuthErrorMessage } from '@/utils/auth-errors';

export async function fetchProfile(userId: string): Promise<{
  profile: Profile | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return { profile: null, error: getAuthErrorMessage(error) };
  }

  return { profile: data, error: null };
}

export async function updateProfileAccountType(
  userId: string,
  accountType: AppRole,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ account_type: accountType })
    .eq('id', userId);

  if (error) {
    return { error: getAuthErrorMessage(error) };
  }

  return { error: null };
}

export async function updateProfileFullName(
  userId: string,
  fullName: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName })
    .eq('id', userId);

  if (error) {
    return { error: getAuthErrorMessage(error) };
  }

  return { error: null };
}
