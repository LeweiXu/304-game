import { describe, expect, it } from 'vitest';
import { apply, legalActions, nextSeat, toAct, type Action, type MatchState, type Seat } from '../src';
import { legalBidValues } from '../src/bidding';
import { bid, matchWithDealer, partner, pass } from './helpers';

// Seating as in rules.md: A is to the dealer's right, then B, C, and D the dealer.
// A and C are partners, B and D are partners.
const D: Seat = 3;
const A = nextSeat(D, 1), B = nextSeat(D, 2), C = nextSeat(D, 3);

function run(m: MatchState, steps: [Seat, Action][]): MatchState {
  for (const [seat, action] of steps) {
    expect(toAct(m.game), `expected seat ${seat} to act`).toBe(seat);
    m = apply(m, action);
  }
  return m;
}

const bids = (m: MatchState) => legalActions(m.game).flatMap((a) => (a.type === 'bid' ? [a.value] : []));

describe('4-card betting', () => {
  it('worked example: simple', () => {
    let m = matchWithDealer(D);
    m = run(m, [[A, bid(160)], [B, bid(170)], [C, pass], [D, pass]]);
    expect(bids(m)[0]).toBe(200); // §B-6: A has spoken, so 200 minimum
    m = run(m, [[A, bid(200)], [B, bid(205)], [C, pass], [D, pass], [A, bid(210)], [B, pass], [C, pass], [D, pass]]);
    expect(m.game.phase).toBe('trump4');
    expect(m.game.bid4).toEqual({ seat: A, value: 210 });
    expect(toAct(m.game)).toBe(A);
  });

  it('worked example: partnering', () => {
    let m = matchWithDealer(D);
    m = run(m, [[A, partner]]);
    expect(toAct(m.game)).toBe(C); // C speaks in A's seat, right away
    expect(legalActions(m.game).some((a) => a.type === 'partner')).toBe(false); // no partner-back
    m = run(m, [[C, bid(160)], [B, bid(170)]]);
    // §B-1: C's normal turn is skipped once, so D is next.
    m = run(m, [[D, pass], [A, pass]]);
    // §B-2: B holds the high bid and is skipped. C is back in rotation with a 200 minimum.
    expect(toAct(m.game)).toBe(C);
    expect(bids(m)[0]).toBe(200);
    m = run(m, [[C, bid(200)], [D, pass], [A, pass], [B, pass]]);
    expect(m.game.bid4).toEqual({ seat: C, value: 200 });
  });

  it('worked example: partner then nobody bids is a pass-on', () => {
    let m = matchWithDealer(D);
    m = run(m, [[A, partner], [C, pass], [B, pass], [D, pass]]);
    expect(m.game.phase).toBe('over');
    expect(m.game.end).toEqual({ kind: 'passOn', reason: 'noBids' });
  });

  it('§B-5: three passes after the high bid ends it, with no extra turn for the holder', () => {
    let m = matchWithDealer(D);
    m = run(m, [[A, bid(160)], [B, pass], [C, pass], [D, pass]]);
    expect(m.game.phase).toBe('trump4');
    expect(m.game.bid4?.seat).toBe(A);
  });

  it('§B-7: cannot undercut your own partner below 200', () => {
    let m = matchWithDealer(D);
    m = run(m, [[A, bid(160)], [B, pass]]);
    expect(toAct(m.game)).toBe(C);
    expect(Math.min(...bids(m))).toBe(200);
    m = run(m, [[C, pass]]);
    expect(Math.min(...bids(m))).toBe(170); // D can still overtake the other team low on a first speech
  });

  it('only the first two speakers may partner', () => {
    let m = matchWithDealer(D);
    m = run(m, [[A, pass]]);
    expect(legalActions(m.game).some((a) => a.type === 'partner')).toBe(true); // B, across from dealer
    m = run(m, [[B, pass]]);
    expect(legalActions(m.game).some((a) => a.type === 'partner')).toBe(false); // C
  });

  it('bid steps: tens below 200, fives from 200, max 250', () => {
    const m = matchWithDealer(D);
    expect(legalBidValues(m.game)).toEqual([160, 170, 180, 190, 200, 205, 210, 215, 220, 225, 230, 235, 240, 245, 250]);
  });

  it('redeal: only the priority player, only under 15 points', () => {
    const m = matchWithDealer(D);
    m.game.hands[A] = ['7c', '8c', '7d', 'Qh'];
    expect(legalActions(m.game).some((a) => a.type === 'redeal')).toBe(true);
    m.game.hands[A] = ['7c', '8c', '7d', 'Jh'];
    expect(legalActions(m.game).some((a) => a.type === 'redeal')).toBe(false);
    const r = apply({ ...m, game: { ...m.game, hands: m.game.hands.map((h, i) => (i === A ? ['7c', '8c', '7d', 'Qh'] : h)) } }, { type: 'redeal' });
    expect(r.game.end).toEqual({ kind: 'redeal', seat: A });
  });
});

describe('trump and 8-card betting', () => {
  function toBid8(): MatchState {
    let m = matchWithDealer(D);
    m = run(m, [[A, bid(160)], [B, pass], [C, pass], [D, pass]]);
    return apply(m, { type: 'trump', card: m.game.hands[A][0] });
  }

  it('the trump card goes face down and everyone gets 4 more', () => {
    const m = toBid8();
    expect(m.game.phase).toBe('bid8');
    expect(m.game.hands.map((h) => h.length)).toEqual(
      [0, 1, 2, 3].map((s) => (s === A ? 7 : 8)),
    );
    expect(m.game.trump?.indicator).not.toBeNull();
  });

  it('8-card bids start at Honest (220), then 250 after your first speech', () => {
    let m = toBid8();
    expect(toAct(m.game)).toBe(A);
    expect(bids(m)[0]).toBe(220);
    m = run(m, [[A, pass], [B, bid(220)], [C, pass], [D, pass]]);
    expect(bids(m)[0]).toBe(250); // A already spoke on 8 cards
  });

  it('no 8-card bids: the 4-card bid stands and the trumper declares', () => {
    let m = toBid8();
    m = run(m, [[A, pass], [B, pass], [C, pass], [D, pass]]);
    expect(m.game.phase).toBe('declare');
    expect(toAct(m.game)).toBe(A);
  });

  it('an 8-card bid supersedes: the old trumper gets their card back, the new one picks', () => {
    let m = toBid8();
    const folded = m.game.trump!.indicator!;
    m = run(m, [[A, pass], [B, bid(220)], [C, pass], [D, pass], [A, pass]]);
    expect(m.game.phase).toBe('trump8');
    expect(m.game.hands[A]).toContain(folded);
    expect(m.game.hands[A]).toHaveLength(8);
    expect(toAct(m.game)).toBe(B);
  });

  it('pass-on on 8 cards under 25 points, first speech only', () => {
    const m = toBid8();
    m.game.hands[A] = ['7c', '8c', '7d', 'Qh', '8h', '7h', 'Kd'];
    expect(legalActions(m.game).some((a) => a.type === 'passOn')).toBe(true);
    const after = apply(m, { type: 'passOn' });
    expect(after.game.end).toEqual({ kind: 'passOn', reason: 'lowPoints8', seat: A });
  });
});
