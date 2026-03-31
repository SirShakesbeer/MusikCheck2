import { create } from 'zustand';

export type ThemeName = 'neon' | 'sunset-pop' | 'retro-arcade';

const STORAGE_KEY = 'musikcheck2-theme';

type ThemeStore = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  hydrateTheme: () => void;
};

function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute('data-theme', theme);
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: 'neon',
  setTheme: (theme) => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
    set({ theme });
  },
  hydrateTheme: () => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const savedTheme: ThemeName = raw === 'sunset-pop' || raw === 'retro-arcade' ? raw : 'neon';
    applyTheme(savedTheme);
    set({ theme: savedTheme });
  },
}));
