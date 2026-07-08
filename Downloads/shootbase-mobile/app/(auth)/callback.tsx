import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthLoadingScreen } from '@/components/AuthLoadingScreen';
import { Button } from '@/components/ui/Button';
import { Routes } from '@/constants/routes';
import { useTheme } from '@/hooks/use-theme';
import { createSessionFromUrl } from '@/lib/oauth';
import { getAuthErrorMessage } from '@/utils/auth-errors';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function handleCallback() {
      try {
        const url = await Linking.getInitialURL();

        if (!url) {
          if (isMounted) {
            setError('No authentication response was received.');
          }
          return;
        }

        const session = await createSessionFromUrl(url);

        if (!session) {
          if (isMounted) {
            setError('Google sign-in did not return a valid session.');
          }
          return;
        }

        if (isMounted) {
          router.replace(Routes.root);
        }
      } catch (callbackError) {
        if (isMounted) {
          setError(getAuthErrorMessage(callbackError));
        }
      }
    }

    handleCallback();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (error) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.colors.background }]}>
        <Text style={[theme.typography.body, styles.errorText, { color: theme.colors.error }]}>
          {error}
        </Text>
        <Button title="Back to Sign In" onPress={() => router.replace(Routes.auth.login)} fullWidth />
      </View>
    );
  }

  return <AuthLoadingScreen />;
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  errorText: {
    textAlign: 'center',
  },
});
