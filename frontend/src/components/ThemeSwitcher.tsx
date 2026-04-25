import { useThemeStore, type ThemeName } from '../stores/themeStore';

const THEMES: Array<{ value: ThemeName; label: string }> = [
  { value: 'neon', label: 'Neon Showdown' },
  { value: 'sunset-pop', label: 'Sunset Pop' },
  { value: 'retro-arcade', label: 'Retro Arcade' },
];

type ThemeSelectorProps = {
  label?: string;
  className?: string;
  selectClassName?: string;
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function ThemeSelector({ label = 'Skin', className, selectClassName }: ThemeSelectorProps) {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className={joinClasses('theme-selector-group', className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-cyan-50">{label}</span>
      <select
        className={selectClassName}
        value={theme}
        onChange={(event) => setTheme(event.target.value as ThemeName)}
        aria-label="Theme selector"
      >
        {THEMES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ThemeSwitcher() {
  return (
    <div className="floating-theme-switcher">
      <ThemeSelector label="Skin" />
    </div>
  );
}
