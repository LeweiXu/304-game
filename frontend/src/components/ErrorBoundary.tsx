// Catches a crash anywhere in the page so it shows a way out instead of a blank screen.
// The usual cause is a saved game from an older version of the site.
import { Component, type ReactNode } from 'react';

type State = { error: Error | null };

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  private reset = () => {
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith('304-match')) localStorage.removeItem(key);
    } catch { /* storage blocked: a reload is all we can do */ }
    location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '80px 24px' }}>
        <h1 style={{ fontSize: '1.8rem', marginBottom: '.4em' }}>Something went wrong</h1>
        <p>The page hit an error, probably from a game saved by an older version of the site.</p>
        <p><button type="button" className="btn primary" onClick={this.reset}>Clear the saved game and reload</button></p>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem' }}>{this.state.error.message}</p>
      </main>
    );
  }
}
