import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, DEFAULT_THEME, effectiveMode, isThemeId, loadMode, loadTheme } from './theme';

beforeEach(() => localStorage.clear());

describe('theme storage', () => {
  it('defaults to graphite following the OS', () => {
    expect(loadTheme()).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME).toBe('graphite');
    expect(loadMode()).toBeNull();
  });

  it('ignores junk in storage', () => {
    localStorage.setItem('304-theme', 'neon');
    localStorage.setItem('304-mode', 'sepia');
    expect(loadTheme()).toBe('graphite');
    expect(loadMode()).toBeNull();
  });

  it('reads back saved values', () => {
    localStorage.setItem('304-theme', 'tea');
    localStorage.setItem('304-mode', 'dark');
    expect(loadTheme()).toBe('tea');
    expect(loadMode()).toBe('dark');
  });

  it('knows its theme ids', () => {
    expect(['graphite', 'parchment', 'tea', 'indigo'].every(isThemeId)).toBe(true);
    expect(isThemeId('neon')).toBe(false);
  });
});

describe('mode', () => {
  it('resolves "follow the OS"', () => {
    expect(effectiveMode(null, true)).toBe('dark');
    expect(effectiveMode(null, false)).toBe('light');
    expect(effectiveMode('light', true)).toBe('light');
  });

  it('writes attributes to <html>', () => {
    const root = document.createElement('html');
    applyTheme('indigo', 'dark', root);
    expect(root.dataset.theme).toBe('indigo');
    expect(root.dataset.mode).toBe('dark');
    applyTheme('indigo', null, root);
    expect(root.hasAttribute('data-mode')).toBe(false);
  });
});
