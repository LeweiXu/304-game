import { NavLink, Link } from 'react-router-dom';
import ThemeMenu from './ThemeMenu';
import type { useTheme } from '../theme/theme';

type Props = { themeState: ReturnType<typeof useTheme> };

export default function Nav({ themeState }: Props) {
  const { current, toggleMode } = themeState;
  const next = current === 'dark' ? 'light' : 'dark';
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link className="brand" to="/">304</Link>
        <nav className="nav-links" aria-label="Site">
          <NavLink to="/rules">Rules</NavLink>
          <NavLink to="/" end className="cta">Play</NavLink>
          <ThemeMenu themeState={themeState} />
          <button type="button" className="icon-btn" onClick={toggleMode}
            aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
            {current === 'dark' ? <MoonIcon /> : <SunIcon />}
          </button>
        </nav>
      </div>
    </header>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
