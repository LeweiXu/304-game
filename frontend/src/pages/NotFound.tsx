import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '80px 24px' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '.4em' }}>No page here</h1>
      <p>That address doesn't match anything on the site. Try <Link to="/">Play</Link> or the <Link to="/rules">rules</Link>.</p>
    </main>
  );
}
