import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;

  const backgroundColor = getBackgroundColor(variant, theme.colors, isDisabled);
  const textColor = getTextColor(variant, theme.colors, isDisabled);
  const borderColor = variant === 'outline' ? theme.colors.primary : 'transparent';
  const padding = getPadding(size, theme.spacing);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          borderColor,
          paddingVertical: padding.vertical,
          paddingHorizontal: padding.horizontal,
          opacity: pressed && !isDisabled ? 0.85 : 1,
        },
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, theme.typography.button, { color: textColor }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

function getBackgroundColor(
  variant: ButtonVariant,
  colors: ReturnType<typeof useTheme>['theme']['colors'],
  disabled?: boolean | null,
): string {
  if (disabled) return colors.border;

  switch (variant) {
    case 'secondary':
      return colors.secondary;
    case 'outline':
    case 'ghost':
      return 'transparent';
    default:
      return colors.primary;
  }
}

function getTextColor(
  variant: ButtonVariant,
  colors: ReturnType<typeof useTheme>['theme']['colors'],
  disabled?: boolean | null,
): string {
  if (disabled) return colors.textSecondary;

  switch (variant) {
    case 'outline':
    case 'ghost':
      return colors.primary;
    default:
      return colors.surface;
  }
}

function getPadding(
  size: ButtonSize,
  spacing: ReturnType<typeof useTheme>['theme']['spacing'],
): { vertical: number; horizontal: number } {
  switch (size) {
    case 'sm':
      return { vertical: spacing.xs, horizontal: spacing.md };
    case 'lg':
      return { vertical: spacing.md, horizontal: spacing.xl };
    default:
      return { vertical: spacing.sm + 2, horizontal: spacing.lg };
  }
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    minHeight: 48,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    textAlign: 'center',
  },
});
