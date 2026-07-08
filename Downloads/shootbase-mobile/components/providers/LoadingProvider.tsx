import {
  createContext,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type LoadingContextValue = {
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  showLoading: () => void;
  hideLoading: () => void;
};

export const LoadingContext = createContext<LoadingContextValue | null>(null);

type LoadingProviderProps = {
  children: ReactNode;
};

export function LoadingProvider({ children }: LoadingProviderProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { theme } = useTheme();

  const setLoading = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  const showLoading = useCallback(() => {
    setIsLoading(true);
  }, []);

  const hideLoading = useCallback(() => {
    setIsLoading(false);
  }, []);

  const value = useMemo(
    () => ({
      isLoading,
      setLoading,
      showLoading,
      hideLoading,
    }),
    [hideLoading, isLoading, setLoading, showLoading],
  );

  return (
    <LoadingContext.Provider value={value}>
      {children}
      <Modal transparent visible={isLoading} animationType="fade">
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </Modal>
    </LoadingContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
});
