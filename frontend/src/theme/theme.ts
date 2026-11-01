// Colour theme + light/dark mode. The theme picks the palette (see
// styles/themes.css); the mode picks its light or dark half. A null mode
// means "follow the OS". Both live on <html> as data attributes and in
// localStorage. index.html applies them before first paint with the same keys.
import { useCallback, useEffect, useState } from 'react';

export const THEMES = [
  { id: 'graphite', name: 'Graphite', swatch: ['#f3f3f1', '#96600f', '#111113', '#e3aa4f'] },
  { id: 'parchment', name: 'Parchment', swatch: ['#f4ecd8', '#9c2f1d', '#1a0f0a', '#d8694a'] },
  { id: 'tea', name: 'Tea', swatch: ['#edf1e4', '#2f6b45', '#0e1611', '#74c08d'] },
  { id: 'indigo', name: 'Indigo', swatch: ['#eceef4', '#34449a', '#0d1020', '#9aa8ff'] },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
export type Mode = 'light' | 'dark' | null;

export const DEFAULT_THEME: ThemeId = 'graphite';
const THEME_KEY = '304-theme';
const MODE_KEY = '304-mode';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode etc: theme just won't persist */ }
}

export function isThemeId(v: string | null): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

export function loadTheme(): ThemeId {
  const v = read(THEME_KEY);
  return isThemeId(v) ? v : DEFAULT_THEME;
}

export function loadMode(): Mode {
  const v = read(MODE_KEY);
  return v === 'light' || v === 'dark' ? v : null;
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** The mode actually on screen, resolving "follow the OS". */
export function effectiveMode(mode: Mode, prefersDark = systemPrefersDark()): 'light' | 'dark' {
  return mode ?? (prefersDark ? 'dark' : 'light');
}

export function applyTheme(theme: ThemeId, mode: Mode, root = document.documentElement) {
  root.setAttribute('data-theme', theme);
  if (mode) root.setAttribute('data-mode', mode);
  else root.removeAttribute('data-mode');
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(loadTheme);
  const [mode, setModeState] = useState<Mode>(loadMode);
  // Re-render when the OS flips while we're following it.
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => { applyTheme(theme, mode); }, [theme, mode]);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setPrefersDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((t: ThemeId) => { write(THEME_KEY, t); setThemeState(t); }, []);
  const setMode = useCallback((m: Mode) => { write(MODE_KEY, m); setModeState(m); }, []);
  const current = effectiveMode(mode, prefersDark);
  const toggleMode = useCallback(() => setMode(current === 'dark' ? 'light' : 'dark'), [current, setMode]);

  return { theme, mode, current, setTheme, setMode, toggleMode };
}
