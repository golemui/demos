import { useEffect, useState } from 'react';

type Theme = 'auto' | 'light' | 'dark';

const ORDER: Theme[] = ['auto', 'light', 'dark'];
const STORAGE_KEY = 'golemui-demo-theme';
const ICON: Record<Theme, string> = {
  auto: 'brightness_auto',
  light: 'light_mode',
  dark: 'dark_mode',
};

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Cycles the page between auto → light → dark by setting `data-theme` on
 * <html> (the attribute GolemUI's CSS reads) and persisting the choice to
 * localStorage. The page starts from `data-theme="auto"` in index.html; this
 * restores any saved preference on mount.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('auto');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial = stored && ORDER.includes(stored) ? stored : 'auto';
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <button
      type="button"
      className="demo-shell__toggle"
      onClick={cycle}
      title={`Theme: ${theme} — click to change`}
      aria-label={`Switch theme (currently ${theme})`}
    >
      <span className="material-icons" aria-hidden="true">
        {ICON[theme]}
      </span>
      <span className="demo-shell__toggle-label">{theme}</span>
    </button>
  );
}
