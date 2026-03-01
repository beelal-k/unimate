// lib/store/useSettingsStore.ts
import { create } from 'zustand';

interface SettingsState {
  geminiApiKey: string | null;
  moodleSiteUrl: string | null;
  moodleToken: string | null;
  moodleUsername: string | null;
  gmailAccessToken: string | null;
  gmailRefreshToken: string | null;
  universityDomain: string | null;
  theme: 'light' | 'dark' | 'system';
  defaultNotifyMinutes: number;
  onboardingComplete: boolean;

  setGeminiApiKey: (key: string | null) => void;
  setMoodleCredentials: (siteUrl: string | null, token: string | null, username: string | null) => void;
  setGmailTokens: (access: string | null, refresh: string | null) => void;
  setUniversityDomain: (domain: string | null) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setDefaultNotifyMinutes: (minutes: number) => void;
  setOnboardingComplete: (complete: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  geminiApiKey: null,
  moodleSiteUrl: null,
  moodleToken: null,
  moodleUsername: null,
  gmailAccessToken: null,
  gmailRefreshToken: null,
  universityDomain: null,
  theme: 'light',
  defaultNotifyMinutes: 15,
  onboardingComplete: false,

  setGeminiApiKey: (key) => set({ geminiApiKey: key }),
  setMoodleCredentials: (siteUrl, token, username) =>
    set({ moodleSiteUrl: siteUrl, moodleToken: token, moodleUsername: username }),
  setGmailTokens: (access, refresh) =>
    set({ gmailAccessToken: access, gmailRefreshToken: refresh }),
  setUniversityDomain: (domain) => set({ universityDomain: domain }),
  setTheme: (theme) => set({ theme }),
  setDefaultNotifyMinutes: (minutes) => set({ defaultNotifyMinutes: minutes }),
  setOnboardingComplete: (complete) => set({ onboardingComplete: complete }),
}));
