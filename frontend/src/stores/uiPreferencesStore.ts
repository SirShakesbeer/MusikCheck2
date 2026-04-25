import { create } from 'zustand';

export type BackgroundMode = 'flat' | 'room-3d';

const STORAGE_KEY = 'musikcheck2-ui-preferences';

type PreferencesPayload = {
  backgroundMode?: BackgroundMode;
};

type UiPreferencesStore = {
  backgroundMode: BackgroundMode;
  setBackgroundMode: (mode: BackgroundMode) => void;
  hydratePreferences: () => void;
};

function readStoredPreferences(): PreferencesPayload {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as PreferencesPayload;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function persistPreferences(payload: PreferencesPayload) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export const useUiPreferencesStore = create<UiPreferencesStore>((set) => ({
  backgroundMode: 'flat',
  setBackgroundMode: (mode) => {
    const current = readStoredPreferences();
    persistPreferences({ ...current, backgroundMode: mode });
    set({ backgroundMode: mode });
  },
  hydratePreferences: () => {
    const stored = readStoredPreferences();
    const mode = stored.backgroundMode === 'room-3d' ? 'room-3d' : 'flat';
    set({ backgroundMode: mode });
  },
}));
