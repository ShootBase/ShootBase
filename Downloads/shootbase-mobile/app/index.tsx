import { Redirect } from 'expo-router';

import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { Routes } from '@/constants/routes';
import { useAuth } from '@/hooks/use-auth';

export default function Index() {
  const { isInitialized, session, role, profileError } = useAuth();

  if (!isInitialized) {
    return <AuthLoadingScreen />;
  }

  if (!session) {
    return <Redirect href={Routes.auth.splash} />;
  }

  if (profileError || !role) {
    return <Redirect href={Routes.shared.roleRequired} />;
  }

  if (role === 'client') {
    return <Redirect href={Routes.client.dashboard} />;
  }

  return <Redirect href={Routes.pro.dashboard} />;
}
