// components/ui/BottomSheet.tsx
// Full-screen capable bottom sheet above everything, keyboard-friendly

import React, { useCallback, useEffect, useState } from 'react';
import { View, Dimensions, Pressable, Keyboard, Platform, Modal } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  ScrollView,
} from 'react-native-gesture-handler';
import { Springs } from '../../lib/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  snapPoint?: number;
}

export function BottomSheet({
  visible,
  onDismiss,
  children,
  snapPoint = 0.5,
}: BottomSheetProps) {
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const baseHeight = SCREEN_HEIGHT * snapPoint;
  const sheetHeight = isFullScreen
    ? SCREEN_HEIGHT * 0.95
    : keyboardHeight > 0
      ? Math.min(SCREEN_HEIGHT * 0.9, baseHeight + keyboardHeight)
      : baseHeight;

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, {
        damping: 25, stiffness: 300, mass: 0.8,
      });
      backdropOpacity.value = withTiming(0.5, { duration: 200 });
    } else {
      translateY.value = withSpring(SCREEN_HEIGHT, Springs.smooth);
      backdropOpacity.value = withTiming(0, { duration: 200 });
      setIsFullScreen(false);
    }
  }, [visible, sheetHeight]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const panGesture = Gesture.Pan()
    .onChange((event) => {
      // Allow dragging downwards past 0, or dragging upwards with resistance
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      } else {
        // give resistance when pulling up
        translateY.value = event.translationY * 0.3;
      }
    })
    .onEnd((event) => {
      if (event.translationY > sheetHeight * 0.3 || event.velocityY > 1000) {
        runOnJS(onDismiss)();
      } else if (event.translationY < -80) {
        runOnJS(setIsFullScreen)(true);
        translateY.value = withSpring(0, {
          damping: 25, stiffness: 300, mass: 0.8,
        });
      } else {
        translateY.value = withSpring(0, {
          damping: 25, stiffness: 300, mass: 0.8,
        });
      }
    });

  const handleDismiss = useCallback(() => {
    Keyboard.dismiss();
    if (isFullScreen) {
      setIsFullScreen(false);
    } else {
      onDismiss();
    }
  }, [onDismiss, isFullScreen]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Backdrop — does NOT dismiss keyboard, only closes sheet */}
        <Pressable
          onPress={handleDismiss}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <Animated.View
            style={[{ flex: 1, backgroundColor: '#000000' }, backdropStyle]}
          />
        </Pressable>

        {/* Sheet */}
        <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: sheetHeight,
                  backgroundColor: '#FFFFFF',
                  borderTopLeftRadius: isFullScreen ? 0 : 16,
                  borderTopRightRadius: isFullScreen ? 0 : 16,
                },
                sheetStyle,
              ]}
            >
            {/* Handle */}
            <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 12 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D0D0D0' }} />
            </View>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}
