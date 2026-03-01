// components/ui/Toast.tsx
// Global toast/snackbar system with spring animations

import React, { createContext, useContext, useCallback, useRef, useState } from 'react';
import { View, Text, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Check, X, Info } from 'lucide-react-native';
import { Springs, AnimationConfig } from '../../lib/theme';

type ToastType = 'success' | 'error' | 'info';

interface ToastData {
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

const SCREEN_WIDTH = Dimensions.get('window').width;

const ToastIcon = ({ type }: { type: ToastType }) => {
  const size = 16;
  const color = '#FFFFFF';
  switch (type) {
    case 'success':
      return <Check size={size} color={color} />;
    case 'error':
      return <X size={size} color={color} />;
    case 'info':
      return <Info size={size} color={color} />;
  }
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hideToast = useCallback(() => {
    translateY.value = withSpring(-100, Springs.snappy);
    opacity.value = withTiming(0, { duration: 200 });
    setTimeout(() => {
      setToast(null);
    }, 300);
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setToast({ message, type });
    translateY.value = withSpring(0, Springs.smooth);
    opacity.value = withTiming(1, { duration: 150 });

    const duration = type === 'error'
      ? AnimationConfig.toastErrorDuration
      : AnimationConfig.toastHoldDuration;

    timeoutRef.current = setTimeout(() => {
      runOnJS(hideToast)();
    }, duration);
  }, [hideToast]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 52,
              left: 16,
              right: 16,
              zIndex: 9999,
              alignItems: 'center',
            },
            animatedStyle,
          ]}
          pointerEvents="none"
        >
          <View
            style={{
              backgroundColor: '#0A0A0A',
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              maxWidth: SCREEN_WIDTH - 32,
              width: '100%',
              gap: 10,
            }}
          >
            <ToastIcon type={toast.type} />
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 13,
                fontFamily: 'Inter_400Regular',
                flex: 1,
              }}
            >
              {toast.message}
            </Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}
