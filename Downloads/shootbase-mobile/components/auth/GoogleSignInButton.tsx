import { Button } from '@/components/ui/Button';

type GoogleSignInButtonProps = {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function GoogleSignInButton({ onPress, loading, disabled }: GoogleSignInButtonProps) {
  return (
    <Button
      title="Continue with Google"
      variant="outline"
      onPress={onPress}
      loading={loading}
      disabled={disabled}
      fullWidth
    />
  );
}
