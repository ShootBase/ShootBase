import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Routes } from '@/constants/routes';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import type { MobileRole } from '@/types/auth';

export default function RegisterScreen() {
  const { theme } = useTheme();
  const { signUp, isLoading } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState<MobileRole>('client');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleRegister() {
    setError(null);
    setSuccessMessage(null);

    if (!fullName.trim() || !email.trim() || !password) {
      setError('Please complete all fields.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const result = await signUp(email, password, fullName, accountType);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.needsEmailConfirmation) {
      setSuccessMessage('Account created. Check your email to confirm your address, then sign in.');
      return;
    }

    router.replace(Routes.root);
  }

  return (
    <Screen title="Create Account" subtitle="Join the ShootBase community">
      <View style={styles.form}>
        <Input
          label="Full Name"
          placeholder="Your name"
          autoCapitalize="words"
          autoComplete="name"
          value={fullName}
          onChangeText={setFullName}
        />
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
          placeholder="Create a password"
          secureTextEntry
          autoComplete="new-password"
          value={password}
          onChangeText={setPassword}
        />
      </View>

      <View style={styles.roleSection}>
        <Text style={[theme.typography.bodySmall, styles.roleLabel, { color: theme.colors.text }]}>
          I am a
        </Text>
        <View style={styles.roleOptions}>
          <RoleOption
            label="Client"
            selected={accountType === 'client'}
            onPress={() => setAccountType('client')}
          />
          <RoleOption
            label="Professional"
            selected={accountType === 'pro'}
            onPress={() => setAccountType('pro')}
          />
        </View>
      </View>

      {error ? (
        <Text style={[theme.typography.bodySmall, styles.message, { color: theme.colors.error }]}>
          {error}
        </Text>
      ) : null}

      {successMessage ? (
        <Text
          style={[theme.typography.bodySmall, styles.message, { color: theme.colors.success }]}
        >
          {successMessage}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button title="Create Account" onPress={handleRegister} loading={isLoading} fullWidth />
        <Link href={Routes.auth.login} asChild>
          <Button title="Already have an account?" variant="ghost" fullWidth />
        </Link>
      </View>
    </Screen>
  );
}

type RoleOptionProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

function RoleOption({ label, selected, onPress }: RoleOptionProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.roleOption,
        {
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          backgroundColor: selected ? theme.colors.inputBackground : theme.colors.surface,
        },
      ]}
    >
      <Text
        style={[
          theme.typography.body,
          { color: selected ? theme.colors.primary : theme.colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 16,
  },
  roleSection: {
    gap: 8,
    marginTop: 4,
  },
  roleLabel: {
    fontWeight: '500',
  },
  roleOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  roleOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 1.5,
    borderRadius: 10,
  },
  actions: {
    gap: 12,
  },
  message: {
    marginTop: 4,
  },
});
