import { describe, expect, it } from 'vitest';
import { apply, makeRng, mixSeed, newMatch, nextGame, toAct, viewFor, type MatchState } from '../../engine/src';
import { naiveBot } from '../src/naive';

function botMatch(seed: number): MatchState {
  let m = newMatch(seed);
  for (let guard = 0; guard < 100_000 && m.winner === null; guard++) {
    if (m.game.phase === 'over') { m = nextGame(m); continue; }
    const seat = toAct(m.game)!;
    const before = m.stone;
    m = apply(m, naiveBot(viewFor(m, seat), makeRng(mixSeed(seed, m.steps)))); // throws on an illegal pick
    expect(m.stone[0] <= before[0] && m.stone[1] <= before[1]).toBe(true);
  }
  return m;
}

describe('naive bot', () => {
  it('plays 30 full matches to a winner', () => {
    for (let seed = 1; seed <= 30; seed++) expect(botMatch(seed).winner).not.toBeNull();
  });

  it('bids often enough that most deals get played', () => {
    const results = Array.from({ length: 10 }, (_, i) => botMatch(100 + i).history).flat();
    expect(results.filter((r) => r.kind === 'played').length / results.length).toBeGreaterThan(0.6);
  });

  it('is deterministic for a given seed', () => {
    expect(botMatch(7)).toEqual(botMatch(7));
  });
});
