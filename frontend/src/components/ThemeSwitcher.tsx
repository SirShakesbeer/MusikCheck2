import { useEffect } from 'react';

import { useThemeStore, type ThemeName } from '../stores/themeStore';

const THEMES: Array<{ value: ThemeName; label: string }> = [
  { value: 'neon', label: 'Neon Showdown' },
  { value: 'sunset-pop', label: 'Sunset Pop' },
  { value: 'retro-arcade', label: 'Retro Arcade' },
];

export function ThemeSwitcher() {
  const { theme, setTheme, hydrateTheme } = useThemeStore();

  useEffect(() => {
    hydrateTheme();
  }, [hydrateTheme]);

  return (
    <div className="floating-theme-switcher">
      <span className="text-xs font-semibold uppercase tracking-wide text-cyan-50">Skin</span>
      <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeName)} aria-label="Theme selector">
        {THEMES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}
