import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Routes } from '@/constants/routes';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { PROFILE_ERRORS } from '@/utils/auth-errors';

export default function RoleRequiredScreen() {
  const { theme } = useTheme();
  const { profileError, profile, signOut } = useAuth();
  const router = useRouter();

  const message =
    profileError === 'missing_profile'
      ? PROFILE_ERRORS.missingProfile
      : PROFILE_ERRORS.missingRole;

  async function handleSignOut() {
    await signOut();
    router.replace(Routes.auth.login);
  }

  return (
    <Screen title="Account Setup Required" subtitle="We could not route your account">
      <Card>
        <View style={styles.content}>
          <Text style={[theme.typography.body, { color: theme.colors.text }]}>
            {message}
          </Text>
          {profile?.full_name ? (
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
              Signed in as {profile.full_name}
            </Text>
          ) : null}
        </View>
      </Card>
      <View style={styles.actions}>
        <Button title="Sign Out" onPress={handleSignOut} fullWidth />
        <Button
          title="Back to Sign In"
          variant="outline"
          onPress={() => router.replace(Routes.auth.login)}
          fullWidth
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 8,
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
});
