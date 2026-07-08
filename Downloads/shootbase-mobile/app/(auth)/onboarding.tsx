import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PlaceholderContent } from '@/components/PlaceholderContent';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Routes } from '@/constants/routes';

export default function OnboardingScreen() {
  return (
    <Screen title="Onboarding" subtitle="Welcome to ShootBase">
      <PlaceholderContent
        title="Get Started"
        description="Onboarding flow will introduce key features to new users."
      />
      <View style={styles.actions}>
        <Link href={Routes.auth.login} asChild>
          <Button title="Sign In" fullWidth />
        </Link>
        <Link href={Routes.auth.register} asChild>
          <Button title="Create Account" variant="outline" fullWidth />
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
    marginTop: 8,
  },
});
