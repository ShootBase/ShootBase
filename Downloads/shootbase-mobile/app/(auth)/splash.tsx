import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PlaceholderContent } from '@/components/PlaceholderContent';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Routes } from '@/constants/routes';
import { useTheme } from '@/hooks/use-theme';

export default function SplashScreen() {
  const { theme } = useTheme();

  return (
    <Screen scrollable={false} padded>
      <View style={styles.hero}>
        <Text style={[theme.typography.h1, { color: theme.colors.primary }]}>ShootBase</Text>
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
          Connect clients with creative professionals
        </Text>
      </View>
      <PlaceholderContent
        title="Welcome"
        description="Find creative professionals or grow your business on ShootBase."
      />
      <View style={styles.actions}>
        <Link href={Routes.auth.onboarding} asChild>
          <Button title="Continue" fullWidth />
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actions: {
    gap: 12,
  },
});
