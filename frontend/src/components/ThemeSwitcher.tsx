import { useTranslation } from '../i18n/useTranslation';
import { useThemeStore, type ThemeName } from '../stores/themeStore';

const THEME_VALUES: ThemeName[] = ['neon', 'sunset-pop', 'retro-arcade'];

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
  const { t } = useTranslation();
  const resolvedLabel = label === 'Skin' ? t('theme.label') : label;

  const themeLabels: Record<ThemeName, string> = {
    neon: t('theme.neonShowdown'),
    'sunset-pop': t('theme.sunsetPop'),
    'retro-arcade': t('theme.retroArcade'),
  };

  return (
    <div className={joinClasses('theme-selector-group', className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-cyan-50">{resolvedLabel}</span>
      <select
        className={selectClassName}
        value={theme}
        onChange={(event) => setTheme(event.target.value as ThemeName)}
        aria-label="Theme selector"
      >
        {THEME_VALUES.map((value) => (
          <option key={value} value={value}>
            {themeLabels[value]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ThemeSwitcher() {
  return (
    <div className="floating-theme-switcher">
      <ThemeSelector />
    </div>
  );
}
