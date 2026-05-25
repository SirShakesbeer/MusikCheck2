import { create } from 'zustand';

import type { Language } from '../i18n/translations';

export type BackgroundMode = 'flat' | 'room-3d';

const STORAGE_KEY = 'musikcheck2-ui-preferences';

type PreferencesPayload = {
  backgroundMode?: BackgroundMode;
  language?: Language;
};

type UiPreferencesStore = {
  backgroundMode: BackgroundMode;
  language: Language;
  setBackgroundMode: (mode: BackgroundMode) => void;
  setLanguage: (language: Language) => void;
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
  language: 'en',
  setBackgroundMode: (mode) => {
    const current = readStoredPreferences();
    persistPreferences({ ...current, backgroundMode: mode });
    set({ backgroundMode: mode });
  },
  setLanguage: (language) => {
    const current = readStoredPreferences();
    persistPreferences({ ...current, language });
    document.documentElement.lang = language;
    set({ language });
  },
  hydratePreferences: () => {
    const stored = readStoredPreferences();
    const mode = stored.backgroundMode === 'room-3d' ? 'room-3d' : 'flat';
    const language = stored.language === 'de' ? 'de' : 'en';
    document.documentElement.lang = language;
    set({ backgroundMode: mode, language });
  },
}));
