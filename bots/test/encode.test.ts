import { describe, expect, it } from 'vitest';
import { apply, legalActions, makeRng, newMatch, toAct, viewFor, type MatchState, type Seat } from '../../engine/src';
import { encodeView, OBS_LAYOUT, OBS_SIZE } from '../src/encode';

function randomState(seed: number, steps: number): MatchState {
  const rng = makeRng(seed);
  let m = newMatch(seed);
  for (let i = 0; i < steps && m.game.phase !== 'over'; i++) {
    const legal = legalActions(m.game);
    m = apply(m, legal[rng.int(legal.length)]);
  }
  return m;
}

describe('observation encoding', () => {
  it('has a contiguous layout', () => {
    let at = 0;
    for (const b of OBS_LAYOUT) { expect(b.offset).toBe(at); at += b.size; }
    expect(at).toBe(OBS_SIZE);
  });

  it('marks exactly my cards in the hand block', () => {
    const m = randomState(3, 20);
    const s = toAct(m.game) ?? 0;
    const o = encodeView(viewFor(m, s));
    const hand = OBS_LAYOUT.find((b) => b.name === 'hand')!;
    const bits = [...o.slice(hand.offset, hand.offset + 32)].reduce((a, b) => a + b, 0);
    expect(bits).toBe(m.game.hands[s].length);
  });

  it('does not change when cards I cannot see change', () => {
    // Swap the two opponents' hands before anyone has played: seat 0 can't tell.
    const m = newMatch(11);
    const other: MatchState = structuredClone(m);
    [other.game.hands[1], other.game.hands[3]] = [other.game.hands[3], other.game.hands[1]];
    expect(encodeView(viewFor(other, 0))).toEqual(encodeView(viewFor(m, 0)));
    expect(encodeView(viewFor(other, 1))).not.toEqual(encodeView(viewFor(m, 1)));
  });

  it('stays finite and in a sane range across many states', () => {
    for (let seed = 1; seed < 200; seed++) {
      const m = randomState(seed, seed % 60);
      for (const s of [0, 1, 2, 3] as Seat[]) {
        for (const x of encodeView(viewFor(m, s))) expect(x >= 0 && x <= 1).toBe(true);
      }
    }
  });
});
