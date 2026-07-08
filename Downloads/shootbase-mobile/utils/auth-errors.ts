type AuthErrorLike = {
  message?: string;
  status?: number;
  name?: string;
};

export function getAuthErrorMessage(error: unknown): string {
  if (!error) {
    return 'Something went wrong. Please try again.';
  }

  if (typeof error === 'string') {
    return mapMessage(error);
  }

  const authError = error as AuthErrorLike;
  const message = authError.message ?? 'Something went wrong. Please try again.';

  if (authError.status === 0 || message.toLowerCase().includes('network')) {
    return 'Network error. Check your connection and try again.';
  }

  return mapMessage(message);
}

function mapMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'Incorrect email or password. Please try again.';
  }

  if (normalized.includes('user already registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }

  if (normalized.includes('password should be at least')) {
    return 'Password must be at least 6 characters.';
  }

  if (normalized.includes('unable to validate email address')) {
    return 'Please enter a valid email address.';
  }

  if (normalized.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }

  if (normalized.includes('access_denied') || normalized.includes('user cancelled')) {
    return 'Google sign-in was cancelled.';
  }

  if (normalized.includes('oauth') || normalized.includes('provider')) {
    return 'Google sign-in failed. Please try again.';
  }

  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Network error. Check your connection and try again.';
  }

  return message;
}

export const PROFILE_ERRORS = {
  missingProfile:
    'Your account is missing a profile. Please contact support or complete setup on the ShootBase website.',
  missingRole:
    'Your account role is not set up yet. Please complete your profile on the ShootBase website.',
} as const;
