import { useEffect, useRef, useState } from 'react';
import { THEMES, type Mode, type useTheme } from '../theme/theme';

type Props = { themeState: ReturnType<typeof useTheme> };

const MODES: { value: Mode; label: string }[] = [
  { value: null, label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function ThemeMenu({ themeState }: Props) {
  const { theme, mode, setTheme, setMode } = themeState;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="theme-menu" ref={wrap}>
      <button type="button" className="icon-btn" aria-haspopup="true" aria-expanded={open}
        aria-label="Theme settings" title="Theme settings" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.7-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 0 0 5-5C21 6.5 17 3 12 3z" />
          <circle cx="7.5" cy="11" r="1" fill="currentColor" /><circle cx="10.5" cy="7" r="1" fill="currentColor" />
          <circle cx="15" cy="7.5" r="1" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="theme-pop" role="dialog" aria-label="Theme settings">
          <fieldset>
            <legend>Colours</legend>
            <div className="theme-grid">
              {THEMES.map((t) => (
                <label key={t.id} className={`theme-opt${theme === t.id ? ' on' : ''}`}>
                  <input type="radio" name="theme" value={t.id} checked={theme === t.id}
                    onChange={() => setTheme(t.id)} />
                  <span className="swatch" aria-hidden="true">
                    <i style={{ background: t.swatch[0] }}><b style={{ background: t.swatch[1] }} /></i>
                    <i style={{ background: t.swatch[2] }}><b style={{ background: t.swatch[3] }} /></i>
                  </span>
                  {t.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Mode</legend>
            <div className="mode-seg">
              {MODES.map((m) => (
                <label key={m.label} className={mode === m.value ? 'on' : ''}>
                  <input type="radio" name="mode" checked={mode === m.value} onChange={() => setMode(m.value)} />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
