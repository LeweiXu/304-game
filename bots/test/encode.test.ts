import { describe, expect, it } from 'vitest';
import { apply, legalActions, makeRng, newMatch, PACK, toAct, viewFor, type MatchState, type Seat } from '../../engine/src';
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

  it('records every completed trick and every speech', () => {
    // Play random moves until two tricks are done, then check seat 0's view of trick 1.
    let m: MatchState | null = null;
    for (let seed = 21; !m; seed++) {
      const rng = makeRng(seed);
      let x = newMatch(seed);
      while (!(x.game.phase === 'play' && x.game.play!.tricks.length >= 2) && x.game.phase !== 'over') {
        const legal = legalActions(x.game);
        x = apply(x, legal[rng.int(legal.length)]);
      }
      if (x.game.phase === 'play') m = x;
    }
    const v = viewFor(m, 0);
    const o = encodeView(v);
    const block = (name: string) => OBS_LAYOUT.find((b) => b.name === name)!;
    const tr = v.play!.tricks[0];
    const q = block('tricks').offset; // slot for round 1
    expect(o[q + tr.leader]).toBe(1); // seat 0's view, so relative seat == absolute seat
    expect(o[q + 4 + tr.winner]).toBe(1);
    for (const c of tr.cards) {
      const k = q + 10 + c.seat * 33;
      if (c.card) expect(o[k + PACK.indexOf(c.card)]).toBe(1);
      else expect(o[k + 32]).toBe(1);
    }
    const a4 = block('auction4').offset;
    const first = v.auction[0];
    expect(o[a4 + first.seat]).toBe(1);
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
