// components/ui/AppTooltip.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useRouter, useSegments } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { CalendarDays, BookOpen, FolderOpen, Sparkles } from 'lucide-react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

const TOOLTIP_STEPS = [
  {
    path: '(tabs)/schedule',
    title: 'Your Schedule',
    desc: 'Classes go here! You get push reminders before they start.',
    icon: CalendarDays,
    color: '#0A0A0A',
    top: 150,
  },
  {
    path: '(tabs)/lms',
    title: 'Moodle Sync',
    desc: 'Uni assignments & offline reading material all pulled automatically.',
    icon: BookOpen,
    color: '#4F46E5',
    top: 250,
  },
  {
    path: '(tabs)/files',
    title: 'Your Files',
    desc: 'Keep PDFs & slides organized. Search & sort fast.',
    icon: FolderOpen,
    color: '#F59E0B',
    top: 250,
  },
  {
    path: '(tabs)/chat',
    title: 'AI Companion',
    desc: 'Stuck on homework? Send your files to Gemini and get unstuck!',
    icon: Sparkles,
    color: '#10B981',
    top: 200,
  },
];

export function AppTooltip() {
  const router = useRouter();
  const segments = useSegments();
  
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    async function check() {
      const hasSeen = await SecureStore.getItemAsync('has_seen_tooltips');
      if (!hasSeen) {
        setIsVisible(true);
        // Start on schedule
        router.push('/(tabs)/schedule');
      }
    }
    check();
  }, []);

  // Update step if route matches (in case it drifted)
  useEffect(() => {
    if (!isVisible) return;
    const currentPath = segments.join('/');
    const stepMatch = TOOLTIP_STEPS.findIndex(s => s.path === currentPath);
    if (stepMatch !== -1 && stepMatch !== currentStep) {
      setCurrentStep(stepMatch);
    }
  }, [segments, isVisible]);

  const handleNext = async () => {
    if (currentStep < TOOLTIP_STEPS.length - 1) {
      const nextIndex = currentStep + 1;
      setCurrentStep(nextIndex);
      // Navigate to the next screen to show the tooltip in context
      const nextRoute = `/${TOOLTIP_STEPS[nextIndex].path}` as const;
      router.push(nextRoute);
    } else {
      setIsVisible(false);
      await SecureStore.setItemAsync('has_seen_tooltips', 'true');
    }
  };

  const handleSkip = async () => {
    setIsVisible(false);
    await SecureStore.setItemAsync('has_seen_tooltips', 'true');
  };

  if (!isVisible) return null;

  const stepInfo = TOOLTIP_STEPS[currentStep];
  const Icon = stepInfo.icon;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dimmed background to focus the tooltip */}
      <Animated.View 
        entering={FadeIn} exiting={FadeOut}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 9998 }]}
      />
      
      {/* Tooltip Card */}
      <Animated.View 
        entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)}
        style={{
          position: 'absolute',
          top: stepInfo.top,
          left: 20,
          right: 20,
          backgroundColor: '#FFFFFF',
          borderRadius: 24,
          padding: 24,
          zIndex: 9999,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.15,
          shadowRadius: 20,
          elevation: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${stepInfo.color}15`, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
             <Icon size={20} color={stepInfo.color} />
          </View>
          <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#0A0A0A' }}>
            {stepInfo.title}
          </Text>
        </View>

        <Text style={{ fontSize: 15, fontFamily: 'Inter_400Regular', color: '#4A4A4A', lineHeight: 22, marginBottom: 20 }}>
          {stepInfo.desc}
        </Text>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable onPress={handleSkip} hitSlop={10}>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#A0A0A0' }}>Skip</Text>
          </Pressable>
          
          <Pressable 
            onPress={handleNext}
            style={{ backgroundColor: stepInfo.color, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 16 }}
          >
            <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>
              {currentStep === TOOLTIP_STEPS.length - 1 ? "Got it!" : "Next"}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}
