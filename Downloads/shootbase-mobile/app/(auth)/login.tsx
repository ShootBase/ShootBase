import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Routes } from '@/constants/routes';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const { theme } = useTheme();
  const { signIn, isLoading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    const result = await signIn(email, password);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.replace(Routes.root);
  }

  return (
    <Screen title="Sign In" subtitle="Access your ShootBase account">
      <View style={styles.form}>
        <Input
          label="Email"
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          label="Password"
          placeholder="Enter your password"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
        />
      </View>

      {error ? (
        <Text style={[theme.typography.bodySmall, styles.error, { color: theme.colors.error }]}>
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button title="Sign In" onPress={handleSignIn} loading={isLoading} fullWidth />
        <Link href={Routes.auth.register} asChild>
          <Button title="Create Account" variant="ghost" fullWidth />
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 16,
  },
  actions: {
    gap: 12,
  },
  error: {
    marginTop: 4,
  },
});
