import { ScrollView, StyleSheet, Text, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

type ScreenProps = ScrollViewProps & {
  title?: string;
  subtitle?: string;
  scrollable?: boolean;
  padded?: boolean;
  children: React.ReactNode;
};

export function Screen({
  title,
  subtitle,
  scrollable = true,
  padded = true,
  children,
  contentContainerStyle,
  ...props
}: ScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const content = (
    <View
      style={[
        styles.content,
        padded && { padding: theme.spacing.md },
        { paddingBottom: Math.max(insets.bottom, theme.spacing.md) },
      ]}
    >
      {title ? (
        <View style={styles.header}>
          <Text style={[theme.typography.h2, { color: theme.colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );

  if (!scrollable) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {content}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      {...props}
    >
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    gap: 16,
  },
  header: {
    gap: 4,
    marginBottom: 8,
  },
});
