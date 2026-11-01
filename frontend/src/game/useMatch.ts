// Holds the match, runs the bots on a timer, and stops after each trick until
// you click Continue, so you can inspect it. The engine does all the rules;
// this is just pacing.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  apply, makeRng, mixSeed, newMatch, nextGame, toAct, viewFor, type Action, type MatchState,
} from '@engine';
import { naiveBot } from '@bots/naive';
import { HUMAN } from './labels';

const STORAGE_KEY = '304-match-v2'; // v1 saves could hold stone above 10 under the old scoring
const BOT_DELAY = { bid: 700, choose: 600, play: 650 };

function load(): MatchState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as MatchState;
    return m && m.game && Array.isArray(m.game.hands) ? m : null;
  } catch {
    return null;
  }
}

function save(m: MatchState | null) {
  try {
    if (m) localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage full or blocked: the game just won't survive a reload */ }
}

const trickCount = (m: MatchState) => m.game.play?.tricks.length ?? 0;

export function useMatch() {
  const [match, setMatch] = useState<MatchState | null>(load);
  // True while a just-finished trick stays on the table, until you click Continue.
  const [pausing, setPausing] = useState(false);

  useEffect(() => save(match), [match]);

  const view = useMemo(() => (match ? viewFor(match, HUMAN) : null), [match]);

  const step = useCallback((m: MatchState, action: Action) => {
    const next = apply(m, action);
    if (trickCount(next) > trickCount(m)) setPausing(true);
    setMatch(next);
  }, []);

  // Bots take their turns after a short delay.
  useEffect(() => {
    if (!match || pausing || match.game.phase === 'over') return;
    const seat = toAct(match.game);
    if (seat === null || seat === HUMAN) return;
    const phase = match.game.phase;
    const delay = phase === 'play' ? BOT_DELAY.play : phase.startsWith('bid') ? BOT_DELAY.bid : BOT_DELAY.choose;
    const id = setTimeout(() => {
      const action = naiveBot(viewFor(match, seat), makeRng(mixSeed(match.seed, match.steps)));
      step(match, action);
    }, delay);
    return () => clearTimeout(id);
  }, [match, pausing, step]);

  const act = useCallback((action: Action) => {
    if (match && !pausing && toAct(match.game) === HUMAN) step(match, action);
  }, [match, pausing, step]);

  const start = useCallback(() => {
    setPausing(false);
    setMatch(newMatch((Math.random() * 2 ** 32) >>> 0)); // the only non-seeded randomness: picking a seed
  }, []);

  const deal = useCallback(() => { if (match) setMatch(nextGame(match)); }, [match]);
  const quit = useCallback(() => { setPausing(false); setMatch(null); }, []);
  const resume = useCallback(() => setPausing(false), []);

  return { match, view, pausing, act, start, deal, quit, resume };
}
