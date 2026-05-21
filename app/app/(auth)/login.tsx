// app/(auth)/login.tsx
// Minimal login screen matching UniMate's core monotone aesthetic

import React, { useState } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  StyleSheet
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router } from 'expo-router';
import { LogIn } from 'lucide-react-native';
import { useToast } from '../../components/ui/Toast';
import { loginSequence } from '../../lib/auth';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export default function LoginScreen() {
  const [domain, setDomain] = useState('lms.umt.edu.pk');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  const handleLogin = async () => {
    if (!domain || !username || !password) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    try {
      setIsLoading(true);
      Keyboard.dismiss();

      let cleanDomain = domain.toLowerCase().trim();
      cleanDomain = cleanDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');

      await loginSequence(cleanDomain, username.trim(), password);
      
      showToast('Welcome to UniMate!', 'success');
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('[Login] Error:', error);
      showToast(error?.message || 'Failed to authenticate with Moodle', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.inner}>
          
          <Animated.View 
            entering={FadeIn.duration(500)}
            style={styles.content}
          >
            <View style={styles.header}>
              <Animated.View 
                entering={FadeIn.delay(300).duration(800)}
                style={styles.iconContainer}
              >
                <LogIn size={32} color="#0A0A0A" strokeWidth={2} />
              </Animated.View>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>
                Connect to your university portal
              </Text>
            </View>

            <View style={styles.formContainer}>
              <Animated.View entering={FadeIn.delay(100).duration(400)}>
                <Input
                  label="LMS Domain"
                  placeholder="e.g. lms.university.edu"
                  value={domain}
                  onChangeText={setDomain}
                  autoCapitalize="none"
                  keyboardType="url"
                  editable={!isLoading}
                />
              </Animated.View>

              <Animated.View entering={FadeIn.delay(200).duration(400)}>
                <Input
                  label="Student ID or Username"
                  placeholder="Enter your university ID"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  editable={!isLoading}
                />
              </Animated.View>

              <Animated.View entering={FadeIn.delay(300).duration(400)}>
                <Input
                  label="Password"
                  placeholder="Enter your password"
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                  rightIcon={showPassword ? 'EyeOff' : 'Eye'}
                  onRightIconPress={() => setShowPassword(!showPassword)}
                />
              </Animated.View>

              <Animated.View 
                entering={FadeIn.delay(400).duration(400)}
                style={{ marginTop: 16 }}
              >
                <Button
                  title="Sign In"
                  onPress={handleLogin}
                  loading={isLoading}
                  disabled={isLoading}
                  fullWidth
                />
              </Animated.View>
            </View>

            <Animated.View 
              entering={FadeIn.delay(600).duration(800)}
              style={styles.footer}
            >
               <Text style={styles.footerText}>
                  Credentials are encrypted and stored safely on your device.
               </Text>
            </Animated.View>

          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  iconContainer: {
    width: 64,
    height: 64,
    backgroundColor: '#F3F3F3',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E4E4E4',
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: '#0A0A0A',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#6E6E6E',
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
    gap: 16,
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  footerText: {
    color: '#A0A0A0',
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    lineHeight: 18,
  },
});
