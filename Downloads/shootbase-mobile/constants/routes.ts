export const Routes = {
  root: '/',
  auth: {
    splash: '/splash',
    onboarding: '/onboarding',
    login: '/login',
    register: '/register',
  },
  client: {
    dashboard: '/(client)/(tabs)',
    messages: '/(client)/(tabs)/messages',
    notifications: '/(client)/(tabs)/notifications',
    profile: '/(client)/(tabs)/profile',
    settings: '/(client)/(tabs)/settings',
  },
  pro: {
    dashboard: '/(pro)/(tabs)',
    messages: '/(pro)/(tabs)/messages',
    notifications: '/(pro)/(tabs)/notifications',
    profile: '/(pro)/(tabs)/profile',
    settings: '/(pro)/(tabs)/settings',
  },
  shared: {
    roleRequired: '/(shared)/role-required',
  },
} as const;
