import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const DISMISSED_VERSION_KEY = 'update_dismissed_version';

interface UpdateState {
  latestVersion: string | null;
  downloadUrl: string | null;
  releaseNotes: string | null;
  hasUpdate: boolean;
  isDownloading: boolean;
  dismissedVersion: string | null;

  setUpdateInfo: (info: { latestVersion: string; downloadUrl: string; releaseNotes: string }) => void;
  dismissUpdate: (version: string) => Promise<void>;
  loadDismissedVersion: () => Promise<void>;
  setIsDownloading: (val: boolean) => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  latestVersion: null,
  downloadUrl: null,
  releaseNotes: null,
  hasUpdate: false,
  isDownloading: false,
  dismissedVersion: null,

  setUpdateInfo: (info) =>
    set({
      latestVersion: info.latestVersion,
      downloadUrl: info.downloadUrl,
      releaseNotes: info.releaseNotes,
      hasUpdate: true,
    }),

  dismissUpdate: async (version) => {
    await SecureStore.setItemAsync(DISMISSED_VERSION_KEY, version);
    set({ dismissedVersion: version });
  },

  loadDismissedVersion: async () => {
    const stored = await SecureStore.getItemAsync(DISMISSED_VERSION_KEY);
    set({ dismissedVersion: stored });
  },

  setIsDownloading: (val) => set({ isDownloading: val }),
}));
