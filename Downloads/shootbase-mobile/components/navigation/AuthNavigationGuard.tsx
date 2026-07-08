import { useRouter, useSegments } from 'expo-router';
import { useEffect, type ReactNode } from 'react';

import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { Routes } from '@/constants/routes';
import { useAuth } from '@/hooks/use-auth';

type AuthNavigationGuardProps = {
  children: ReactNode;
};

function getDashboardRoute(role: 'client' | 'pro') {
  return role === 'client' ? Routes.client.dashboard : Routes.pro.dashboard;
}

export function AuthNavigationGuard({ children }: AuthNavigationGuardProps) {
  const { isInitialized, session, role, profileError } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isInitialized) return;

    const rootSegment = segments[0];
    const inAuthGroup = rootSegment === '(auth)';
    const inClientGroup = rootSegment === '(client)';
    const inProGroup = rootSegment === '(pro)';
    const inSharedGroup = rootSegment === '(shared)';
    const onRoleRequired = inSharedGroup && segments[1] === 'role-required';

    if (!session) {
      if (inClientGroup || inProGroup || (inSharedGroup && !onRoleRequired)) {
        router.replace(Routes.auth.login);
      }
      return;
    }

    if (profileError || !role) {
      if (!onRoleRequired) {
        router.replace(Routes.shared.roleRequired);
      }
      return;
    }

    if (inAuthGroup) {
      router.replace(getDashboardRoute(role));
      return;
    }

    if (role === 'client' && inProGroup) {
      router.replace(Routes.client.dashboard);
      return;
    }

    if (role === 'pro' && inClientGroup) {
      router.replace(Routes.pro.dashboard);
      return;
    }

    if (onRoleRequired) {
      router.replace(getDashboardRoute(role));
    }
  }, [isInitialized, profileError, role, router, segments, session]);

  if (!isInitialized) {
    return <AuthLoadingScreen />;
  }

  return children;
}
