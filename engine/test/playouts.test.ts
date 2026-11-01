import { describe, expect, it } from 'vitest';
import {
  ACTION_COUNT, apply, decodeAction, encodeAction, handPoints, legalActions, legalMask, makeRng, mixSeed,
  naiveBot, newMatch, nextGame, sameAction, toAct, viewFor, type Card, type MatchState,
} from '../src';

/** Every card is in exactly one place: a hand, the stock, the folded trump, or on the table. */
function allCards(m: MatchState): Card[] {
  const g = m.game;
  return [
    ...g.hands.flat(),
    ...g.stock,
    ...(g.trump?.indicator ? [g.trump.indicator] : []),
    ...(g.play?.trick.map((c) => c.card) ?? []),
    ...(g.play?.tricks.flatMap((t) => t.cards.map((c) => c.card)) ?? []),
  ];
}

function checkInvariants(m: MatchState) {
  const everything = allCards(m);
  expect(everything).toHaveLength(32);
  expect(new Set(everything).size).toBe(32);
  for (const n of m.stone) expect(n >= 0 && n <= 10).toBe(true); // stone only ever goes down
  const g = m.game;
  if (g.phase === 'play') {
    // Every seat holds the same number of cards, give or take the one played this trick.
    const counts = g.hands.map((h, s) => h.length + (g.trump?.seat === s && g.trump.indicator ? 1 : 0));
    const played = g.play!.trick.map((c) => c.seat);
    counts.forEach((n, s) => expect(n + (played.includes(s as never) ? 1 : 0)).toBe(9 - g.play!.round));
  }
  if (g.end?.kind === 'played') expect(g.end.points[0] + g.end.points[1]).toBe(304);
}

describe('random legal playouts', () => {
  it('2000 games of random legal moves never break the rules engine', () => {
    let played = 0;
    for (let i = 0; i < 2000; i++) {
      const rng = makeRng(i + 1);
      let m = newMatch(i + 1);
      while (m.game.phase !== 'over') {
        const legal = legalActions(m.game);
        expect(legal.length).toBeGreaterThan(0);
        m = apply(m, legal[rng.int(legal.length)]);
        checkInvariants(m);
      }
      if (m.game.end?.kind === 'played') played++;
    }
    expect(played).toBeGreaterThan(100);
  });
});

function botMatch(seed: number): MatchState {
  let m = newMatch(seed);
  for (let guard = 0; guard < 100_000 && m.winner === null; guard++) {
    if (m.game.phase === 'over') { m = nextGame(m); continue; }
    const seat = toAct(m.game)!;
    const action = naiveBot(viewFor(m, seat), makeRng(mixSeed(seed, m.steps)));
    const before = m.stone;
    m = apply(m, action); // throws if the bot ever picks something illegal
    checkInvariants(m);
    expect(m.stone[0] <= before[0] && m.stone[1] <= before[1]).toBe(true); // nobody's stone goes up
  }
  return m;
}

describe('naive bot', () => {
  it('plays 30 full matches to a winner', () => {
    for (let seed = 1; seed <= 30; seed++) expect(botMatch(seed).winner).not.toBeNull();
  });

  it('bids often enough that most deals get played', () => {
    const results = Array.from({ length: 10 }, (_, i) => botMatch(100 + i).history).flat();
    const played = results.filter((r) => r.kind === 'played').length;
    expect(played / results.length).toBeGreaterThan(0.6);
  });

  it('is deterministic for a given seed', () => {
    expect(botMatch(7)).toEqual(botMatch(7));
  });
});

describe('action numbering', () => {
  it('round-trips every action and matches the legal list', () => {
    for (let i = 0; i < ACTION_COUNT; i++) expect(encodeAction(decodeAction(i))).toBe(i);
    const m = newMatch(3);
    const mask = legalMask(m.game);
    const fromMask = [...mask].flatMap((on, i) => (on ? [decodeAction(i)] : []));
    const legal = legalActions(m.game);
    expect(fromMask).toHaveLength(legal.length);
    for (const a of legal) expect(fromMask.some((b) => sameAction(a, b))).toBe(true);
  });
});

describe('dealing', () => {
  it('deals 4 cards each, keeps 16 back, and the 4-card points add up', () => {
    const m = newMatch(42);
    expect(m.game.hands.map((h) => h.length)).toEqual([4, 4, 4, 4]);
    expect(m.game.stock).toHaveLength(16);
    expect(m.game.hands.reduce((n, h) => n + handPoints(h), 0) + handPoints(m.game.stock)).toBe(304);
  });
});
