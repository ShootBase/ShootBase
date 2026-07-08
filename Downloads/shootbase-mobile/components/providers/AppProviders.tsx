import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthNavigationGuard } from '@/components/navigation/AuthNavigationGuard';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { LoadingProvider } from '@/components/providers/LoadingProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { queryClient } from '@/lib/query-client';

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <QueryClientProvider client={queryClient}>
              <ErrorBoundary>
                <LoadingProvider>
                  <AuthNavigationGuard>{children}</AuthNavigationGuard>
                </LoadingProvider>
              </ErrorBoundary>
            </QueryClientProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
