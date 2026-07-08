import { darkTheme, lightTheme } from '@/constants/theme';

export type Theme = typeof lightTheme | typeof darkTheme;
export type ThemeColors = Theme['colors'];
export type ThemeMode = 'light' | 'dark';
