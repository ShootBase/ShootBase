import type { AppRole } from '@/types/database';
import type { MobileRole } from '@/types/auth';

export function mobileRoleToAccountType(role: MobileRole): AppRole {
  return role === 'client' ? 'customer' : 'professional';
}

export function accountTypeToMobileRole(accountType: AppRole | null): MobileRole | null {
  if (accountType === 'customer') return 'client';
  if (accountType === 'professional') return 'pro';
  return null;
}

export function normalizeMetadataAccountType(value: unknown): AppRole | null {
  if (value === 'customer' || value === 'client') return 'customer';
  if (value === 'professional' || value === 'pro') return 'professional';
  if (value === 'admin') return 'admin';
  return null;
}
