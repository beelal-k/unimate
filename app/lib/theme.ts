// lib/theme.ts
// Design system tokens, typography, spacing, and animation presets

export const Colors = {
  light: {
    bgBase: '#FFFFFF',
    bgSubtle: '#F9F9F9',
    bgSurface: '#FFFFFF',
    bgElevated: '#F3F3F3',
    bgInverse: '#0A0A0A',
    borderSubtle: '#F0F0F0',
    borderDefault: '#E4E4E4',
    borderStrong: '#C0C0C0',
    textPrimary: '#0A0A0A',
    textSecondary: '#6E6E6E',
    textTertiary: '#A0A0A0',
    textInverse: '#FFFFFF',
    accentOverdue: '#EF4444',
    accentWarning: '#999999',
    accentDone: '#BBBBBB',
  },
  dark: {
    bgBase: '#0A0A0A',
    bgSubtle: '#111111',
    bgSurface: '#161616',
    bgElevated: '#1E1E1E',
    bgInverse: '#F5F5F5',
    borderSubtle: '#2A2A2A',
    borderDefault: '#3A3A3A',
    borderStrong: '#505050',
    textPrimary: '#F5F5F5',
    textSecondary: '#888888',
    textTertiary: '#555555',
    textInverse: '#0A0A0A',
    accentOverdue: '#EF4444',
    accentWarning: '#999999',
    accentDone: '#BBBBBB',
  },
} as const;

export const Typography = {
  display: { fontSize: 32, lineHeight: 38.4, letterSpacing: -0.5, fontFamily: 'Inter_700Bold' },
  h1: { fontSize: 24, lineHeight: 36, letterSpacing: -0.5, fontFamily: 'Inter_600SemiBold' },
  h2: { fontSize: 18, lineHeight: 27, fontFamily: 'Inter_600SemiBold' },
  h3: { fontSize: 15, lineHeight: 22.5, fontFamily: 'Inter_500Medium' },
  body: { fontSize: 15, lineHeight: 22.5, fontFamily: 'Inter_400Regular' },
  bodySm: { fontSize: 13, lineHeight: 19.5, fontFamily: 'Inter_400Regular' },
  label: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium', letterSpacing: 0.8 },
  caption: { fontSize: 11, lineHeight: 16.5, fontFamily: 'Inter_400Regular' },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
  screenPadding: 20,
  cardPadding: 16,
  sectionGap: 32,
  tabBarHeight: 68,
  tabBarBottomOffset: 20,
  buttonHeight: 52,
  inputHeight: 52,
} as const;

// Spring animation presets (react-native-reanimated)
export const Springs = {
  snappy: { damping: 20, stiffness: 400, mass: 0.6 },   // Fast, crisp
  smooth: { damping: 28, stiffness: 280, mass: 0.9 },   // Fluid, confident
  gentle: { damping: 35, stiffness: 180, mass: 1.0 },   // Soft, calm
} as const;

// Animation timing
export const AnimationConfig = {
  staggerDelay: 40,        // ms between staggered items
  maxStaggerItems: 6,      // Cap stagger at 6 items
  shimmerDuration: 1400,   // ms for skeleton shimmer
  pressScale: 0.97,        // Button press scale
  cardPressScale: 0.98,    // Card press scale
  iconPressScale: 0.88,    // Icon button press scale
  toastHoldDuration: 3000, // ms for normal toast
  toastErrorDuration: 5000,// ms for error toast
} as const;
