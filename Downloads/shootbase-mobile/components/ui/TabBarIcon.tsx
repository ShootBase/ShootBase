import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps } from 'react';

import { useTheme } from '@/hooks/use-theme';

type TabBarIconProps = {
  name: ComponentProps<typeof Ionicons>['name'];
  color: string;
  size?: number;
};

export function TabBarIcon({ name, color, size = 24 }: TabBarIconProps) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function useTabBarTheme() {
  const { theme } = useTheme();

  return {
    tabBarActiveTintColor: theme.colors.tabIconSelected,
    tabBarInactiveTintColor: theme.colors.tabIconDefault,
    tabBarStyle: {
      backgroundColor: theme.colors.surface,
      borderTopColor: theme.colors.border,
    },
    headerStyle: {
      backgroundColor: theme.colors.surface,
    },
    headerTintColor: theme.colors.text,
  };
}
