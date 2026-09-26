export const LightTheme = {
  dark: false,
  colors: {
    primary: '#A21E33',
    secondary: '#A21E33',
    background: '#F8FAFC',
    card: '#FFFFFF',
    surface: '#FFFFFF',
    text: '#11181C',
    textMuted: '#687076',
    border: '#EDF2F7',
    notification: '#FF3B30',
    incoming: '#34C759',
    outgoing: '#A21E33',
    missed: '#FF3B30',
    rejected: '#FF9500',
    blocked: '#8E8E93',
    brand: '#A21E33',
    brandLight: '#FDF2F4',
  },
};

export const DarkTheme = {
  dark: true,
  colors: {
    primary: '#E05B71',
    secondary: '#A21E33',
    background: '#121214',
    card: '#1E1F23',
    surface: '#1E1F23',
    text: '#ECEDEE',
    textMuted: '#9BA1A6',
    border: '#2E3036',
    notification: '#FF453A',
    incoming: '#30D158',
    outgoing: '#E05B71',
    missed: '#FF453A',
    rejected: '#FF9F0A',
    blocked: '#98989D',
    brand: '#A21E33',
    brandLight: '#2A171A',
  },
};

export type ThemeColors = typeof LightTheme.colors;

