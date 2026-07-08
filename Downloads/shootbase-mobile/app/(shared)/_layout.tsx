import { Stack } from 'expo-router';

export default function SharedLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        presentation: 'card',
      }}
    >
      <Stack.Screen
        name="role-required"
        options={{ title: 'Account Setup', headerShown: false }}
      />
    </Stack>
  );
}
