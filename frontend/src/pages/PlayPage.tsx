import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { checkHealth } from '../api';
import '../styles/play.css';

type Status = 'checking' | 'up' | 'down';

// The game itself lives in engine/ and isn't wired in yet. This page is the
// frame it will sit in.
export default function PlayPage() {
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
        <p>You and a bot partner against two bots. New to the game? <Link to="/rules">Read the rules</Link> first.</p>
      </div>
      <section className="game-box" aria-label="Game table">
        <div className="game-empty">
          <p className="game-title">The table isn't ready yet</p>
          <p>Bot games will start here once the engine is plugged in.</p>
          <button type="button" disabled>New game</button>
        </div>
      </section>
      <p className={`server ${status}`} role="status">
        <i aria-hidden="true" />
        {status === 'checking' && 'Checking the game server'}
        {status === 'up' && 'Game server online'}
        {status === 'down' && 'Game server unreachable'}
      </p>
    </main>
  );
}
