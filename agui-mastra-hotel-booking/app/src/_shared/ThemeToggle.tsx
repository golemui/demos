/* AUTO-GENERATED from shared/ThemeToggle.tsx — edit there and run `npm run sync`. Do not edit here. */
import { useEffect, useState } from 'react';

/** GolemUI's bundled Clay theme: `clay` (light), `clay-dark`, or `clay-auto` (follows the OS). */
type Theme = 'clay-auto' | 'clay' | 'clay-dark';

const ORDER: Theme[] = ['clay-auto', 'clay', 'clay-dark'];
const STORAGE_KEY = 'golemui-demo-theme';
const LABEL: Record<Theme, string> = { 'clay-auto': 'Auto', clay: 'Light', 'clay-dark': 'Dark' };
const ICON: Record<Theme, string> = {
  'clay-auto': 'brightness_auto',
  clay: 'light_mode',
  'clay-dark': 'dark_mode',
};
/** Preferences saved before the Clay rebrand. */
const LEGACY: Record<string, Theme> = { auto: 'clay-auto', light: 'clay', dark: 'clay-dark' };

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function readStored(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) ?? '';
    if (ORDER.includes(stored as Theme)) return stored as Theme;
    return LEGACY[stored] ?? 'clay-auto';
  } catch {
    return 'clay-auto';
  }
}

/**
 * Cycles the page between auto → light → dark by setting `data-theme` on
 * <html> to one of the Clay theme's values (the attribute GolemUI's
 * `themes/clay.css` reads) and persisting the choice to localStorage. The page
 * starts from `data-theme="clay-auto"` in index.html; this restores any saved
 * preference on mount.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('clay-auto');

  useEffect(() => {
    const initial = readStored();
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked (private mode): the choice just doesn't persist.
    }
  }

  return (
    <button
      type="button"
      className="demo-shell__toggle"
      onClick={cycle}
      title={`Theme: ${LABEL[theme]} — click to change`}
      aria-label={`Switch theme (currently ${LABEL[theme].toLowerCase()})`}
    >
      <span className="material-icons" aria-hidden="true">
        {ICON[theme]}
      </span>
      <span className="demo-shell__toggle-label">{LABEL[theme]}</span>
    </button>
  );
}
