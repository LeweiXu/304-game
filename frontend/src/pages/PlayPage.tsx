import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { checkHealth } from '../api';
import SettingsPanel from '../game/SettingsPanel';
import { rulesOf, useSettings } from '../game/settings';
import Table from '../game/Table';
import { useMatch } from '../game/useMatch';
import '../styles/play.css';
import '../styles/game.css';

type Status = 'checking' | 'up' | 'down';

export default function PlayPage() {
  const { settings, update } = useSettings();
  const rules = useMemo(() => rulesOf(settings), [settings]);
  const game = useMatch(rules);
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    document.title = '304';
    const ctrl = new AbortController();
    checkHealth(ctrl.signal).then((ok) => { if (!ctrl.signal.aborted) setStatus(ok ? 'up' : 'down'); });
    return () => ctrl.abort();
  }, []);

  return (
    <main className="play">
      <div className="play-head">
        <h1>Play 304</h1>
        <p>You and North against East and West, all three played by bots. New to the game? <Link to="/rules">Read the rules</Link> first.</p>
      </div>
      <section className="game-box" aria-label="Game table">
        {game.match ? <Table game={game} assist={settings.assist} hints={settings.hints} onSettings={() => setShowSettings(true)} /> : (
          <div className="game-empty">
            <p className="game-title">Start a match</p>
            <p>First team to give away all 10 stone wins. Your progress is saved in this browser.</p>
            <div className="panel">
              <button type="button" className="btn primary" onClick={game.start}>Deal the first game</button>
              <button type="button" className="btn" onClick={() => setShowSettings(true)}>Settings</button>
            </div>
          </div>
        )}
        {showSettings && (
          <SettingsPanel settings={settings} onChange={update} onClose={() => setShowSettings(false)}
            midGame={!!game.match && game.match.game.phase !== 'over'} />
        )}
      </section>
      <p className={`server ${status}`} role="status">
        <i aria-hidden="true" />
        {status === 'checking' && 'Checking the game server'}
        {status === 'up' && 'Game server online'}
        {status === 'down' && 'Game server unreachable (bot games still work)'}
      </p>
    </main>
  );
}
