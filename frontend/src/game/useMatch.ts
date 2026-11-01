// Holds the match, runs the bots on a timer, and stops after each trick until
// you click Continue, so you can inspect it. The engine does all the rules;
// this is just pacing.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  apply, makeRng, mixSeed, newMatch, nextGame, toAct, viewFor, withRules, type Action, type MatchState, type RuleOptions,
} from '@engine';
import { naiveBot } from '@bots/naive';
import { HUMAN } from './labels';

const STORAGE_KEY = '304-match-v4'; // bump when MatchState changes shape (v4: caps / balance bookkeeping)
const BOT_DELAY = { bid: 700, choose: 600, play: 650 };

function load(): MatchState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as MatchState;
    // Anything saved by an older version (missing fields) is dropped rather than crashing the page.
    const ok = m && m.rules && m.game && Array.isArray(m.game.hands) && Array.isArray(m.game.capsFirst) && Array.isArray(m.game.balanceCalled);
    return ok ? m : null;
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

export function useMatch(rules: RuleOptions) {
  const [match, setMatch] = useState<MatchState | null>(load);
  // True while a just-finished trick stays on the table, until you click Continue.
  const [pausing, setPausing] = useState(false);

  useEffect(() => save(match), [match]);

  // Settings changes go into the match and apply from the next deal.
  const rulesKey = JSON.stringify(rules);
  useEffect(() => {
    setMatch((m) => (m && JSON.stringify(m.rules) !== rulesKey ? withRules(m, JSON.parse(rulesKey) as RuleOptions) : m));
  }, [rulesKey]);

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
    setMatch(newMatch((Math.random() * 2 ** 32) >>> 0, { rules })); // the only non-seeded randomness: picking a seed
  }, [rules]);

  const deal = useCallback(() => { if (match) setMatch(nextGame(match)); }, [match]);
  const quit = useCallback(() => { setPausing(false); setMatch(null); }, []);
  const resume = useCallback(() => setPausing(false), []);

  return { match, view, pausing, act, start, deal, quit, resume };
}
