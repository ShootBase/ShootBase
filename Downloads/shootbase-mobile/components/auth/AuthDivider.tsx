import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export function AuthDivider() {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
      <Text style={[theme.typography.bodySmall, styles.label, { color: theme.colors.textSecondary }]}>
        or
      </Text>
      <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  label: {
    textTransform: 'lowercase',
  },
});
