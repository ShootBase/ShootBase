import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { secureStorage } from '@/lib/secure-storage';
import type { MobileRole } from '@/types/auth';
import { getAuthErrorMessage } from '@/utils/auth-errors';

export const PENDING_OAUTH_ROLE_KEY = 'pending_oauth_role';

WebBrowser.maybeCompleteAuthSession();

export function getOAuthRedirectUri(): string {
  return Linking.createURL('/callback');
}

export async function createSessionFromUrl(url: string): Promise<Session | null> {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    throw new Error(errorCode);
  }

  if (params.error_description || params.error) {
    throw new Error(String(params.error_description ?? params.error));
  }

  const { access_token, refresh_token, code } = params;

  if (access_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token: refresh_token ?? '',
    });

    if (error) {
      throw error;
    }

    return data.session;
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      throw error;
    }

    return data.session;
  }

  return null;
}

export async function setPendingOAuthRole(role: MobileRole | null): Promise<void> {
  if (role) {
    await secureStorage.setItem(PENDING_OAUTH_ROLE_KEY, role);
    return;
  }

  await secureStorage.removeItem(PENDING_OAUTH_ROLE_KEY);
}

export async function consumePendingOAuthRole(): Promise<MobileRole | null> {
  const role = await secureStorage.getItem(PENDING_OAUTH_ROLE_KEY);

  if (!role) {
    return null;
  }

  await secureStorage.removeItem(PENDING_OAUTH_ROLE_KEY);

  if (role === 'client' || role === 'pro') {
    return role;
  }

  return null;
}

export async function signInWithGoogleOAuth(
  role?: MobileRole,
): Promise<{ error: string | null; cancelled: boolean }> {
  try {
    await setPendingOAuthRole(role ?? null);

    const redirectTo = getOAuthRedirectUri();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      await setPendingOAuthRole(null);
      return { error: getAuthErrorMessage(error), cancelled: false };
    }

    if (!data.url) {
      await setPendingOAuthRole(null);
      return { error: 'Could not start Google sign-in. Please try again.', cancelled: false };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'cancel' || result.type === 'dismiss') {
      await setPendingOAuthRole(null);
      return { error: null, cancelled: true };
    }

    if (result.type === 'success') {
      const session = await createSessionFromUrl(result.url);

      if (!session) {
        await setPendingOAuthRole(null);
        return { error: 'Google sign-in did not return a valid session.', cancelled: false };
      }

      return { error: null, cancelled: false };
    }

    await setPendingOAuthRole(null);
    return { error: 'Google sign-in did not complete. Please try again.', cancelled: false };
  } catch (error) {
    await setPendingOAuthRole(null);
    return { error: getAuthErrorMessage(error), cancelled: false };
  }
}
