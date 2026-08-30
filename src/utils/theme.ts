export const LightTheme = {
  dark: false,
  colors: {
    primary: '#0A7EA4',
    background: '#F8F9FA',
    card: '#FFFFFF',
    text: '#11181C',
    textMuted: '#687076',
    border: '#E6E8EB',
    notification: '#FF3B30',
    incoming: '#34C759',
    outgoing: '#007AFF',
    missed: '#FF3B30',
    rejected: '#FF9500',
    blocked: '#8E8E93',
  },
};

export const DarkTheme = {
  dark: true,
  colors: {
    primary: '#32ADE6',
    background: '#151718',
    card: '#202425',
    text: '#ECEDEE',
    textMuted: '#9BA1A6',
    border: '#3A3F42',
    notification: '#FF453A',
    incoming: '#30D158',
    outgoing: '#0A84FF',
    missed: '#FF453A',
    rejected: '#FF9F0A',
    blocked: '#98989D',
  },
};

export type ThemeColors = typeof LightTheme.colors;
