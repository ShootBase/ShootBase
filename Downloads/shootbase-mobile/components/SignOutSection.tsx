import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Routes } from '@/constants/routes';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

export function SignOutSection() {
  const { theme } = useTheme();
  const { profile, signOut, isLoading } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.replace(Routes.auth.login);
  }

  return (
    <Card>
      <View style={styles.content}>
        <Text style={[theme.typography.h3, { color: theme.colors.text }]}>Account</Text>
        {profile?.full_name ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
            Signed in as {profile.full_name}
          </Text>
        ) : null}
        <Button
          title="Sign Out"
          variant="outline"
          onPress={handleSignOut}
          loading={isLoading}
          fullWidth
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
});
