import { useContext } from 'react';

import { LoadingContext } from '@/components/providers/LoadingProvider';

export function useLoading() {
  const context = useContext(LoadingContext);

  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }

  return context;
}
