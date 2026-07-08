import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { useTheme } from '@/hooks/use-theme';

type PlaceholderContentProps = {
  title: string;
  description?: string;
};

export function PlaceholderContent({ title, description }: PlaceholderContentProps) {
  const { theme } = useTheme();

  return (
    <Card style={styles.card}>
      <View style={styles.content}>
        <Text style={[theme.typography.h3, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
          {description ?? 'This screen is a placeholder. Business logic will be added later.'}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
  },
  content: {
    gap: 8,
  },
});
