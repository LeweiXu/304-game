import { describe, expect, it } from 'vitest';
import { apply, encodeAction, nextSeat, viewFor, type Action, type MatchState } from '../src';
import { bid, cards, matchWithDealer, pass, play, playState } from './helpers';

const playAll = (m: MatchState, ...cs: string[]) => cs.reduce((acc, c) => apply(acc, play(c as never)), m);

describe('what a seat can see', () => {
  it('the trumper inspects folded cards once the trick is over; nobody else does', () => {
    // Seat 1 is trumper (hearts, folded Jh). Seat 3 can't follow clubs and minuses 7d face down.
    let m = playState({ hands: [cards('Kc 7s'), cards('Ac 8s'), cards('Qc 9s'), cards('7d 10s')], trumpSeat: 1, suit: 'h', indicator: 'Jh' });
    m = playAll(m, 'Kc', 'Ac', 'Qc');
    m = apply(m, play('7d'));
    expect(viewFor(m, 1).play!.lastTrick!.cards[3].card).toBe('7d'); // trumper, trick finished
    expect(viewFor(m, 0).play!.lastTrick!.cards[3].card).toBeNull();
    expect(viewFor(m, 2).play!.lastTrick!.cards[3].card).toBeNull();
    expect(viewFor(m, 3).play!.lastTrick!.cards[3].card).toBe('7d'); // the player who folded it
    expect(viewFor(m, 0).play!.unseenFaceDown).toEqual([0, 0, 0, 1]);
    expect(viewFor(m, 1).play!.unseenFaceDown).toEqual([0, 0, 0, 0]);
    expect(viewFor(m, 0).trump!.folded).toBeNull(); // still closed
  });

  it('a folded card mid-trick stays hidden even from the trumper', () => {
    let m = playState({ hands: [cards('Kc 7s'), cards('Ac 8s'), cards('7d 9s'), cards('Qc 10s')], trumpSeat: 1, suit: 'h', indicator: 'Jh' });
    m = playAll(m, 'Kc', 'Ac', '7d');
    expect(viewFor(m, 1).play!.trick[2].card).toBeNull();
  });

  it('a cut reveal makes the folded trump card public, even if it was not the card played', () => {
    let m = playState({ hands: [cards('Ac 7s'), cards('9d 8s'), cards('7h 9s'), cards('Kc 10s')], trumpSeat: 1, suit: 'h', indicator: 'Jh' });
    m = playAll(m, 'Ac', '9d', '7h', 'Kc'); // seat 2 cuts with 7h
    const v = viewFor(m, 0);
    expect(v.trump!.open).toBe(true);
    expect(v.trump!.declaredOpen).toBe(false);
    expect(v.trump!.folded).toBe('Jh');
    expect(v.trump!.revealedInRound).toBe(1);
  });

  it('keeps the 4-card auction after 8-card betting starts', () => {
    const D = 3, A = nextSeat(D, 1);
    let m = matchWithDealer(D);
    for (const a of [bid(160), pass, pass, pass] as Action[]) m = apply(m, a);
    m = apply(m, { type: 'trump', card: m.game.hands[A][0] });
    m = apply(m, pass);
    const v = viewFor(m, 0);
    expect(v.phase).toBe('bid8');
    expect(v.auction.filter((s) => s.stage === 4)).toHaveLength(4);
    expect(v.auction[0]).toMatchObject({ stage: 4, seat: A, action: 'bid', value: 160 });
    expect(v.auction.at(-1)).toMatchObject({ stage: 8, action: 'pass' });
    expect(v.bidding.speeches).toHaveLength(1); // the current round only
    expect(v.contract).toEqual({ seat: A, value: 160 });
  });

  it('declaring open without priority shows the folded card; with priority it stays private until led', () => {
    const base = () => {
      let m = matchWithDealer(3);
      for (const a of [pass, bid(160), pass, pass, pass] as Action[]) m = apply(m, a); // seat 1 wins, seat 0 has priority
      m = apply(m, { type: 'trump', card: m.game.hands[1][0] });
      for (let i = 0; i < 4; i++) m = apply(m, pass);
      return m;
    };
    const open = apply(base(), { type: 'declare', open: true });
    expect(viewFor(open, 0).trump).toMatchObject({ open: true, declaredOpen: true });
    expect(viewFor(open, 0).trump!.folded).not.toBeNull();

    // Dealer 0, so seat 1 has priority and wins the bid: declaring open means leading trump instead.
    let p = matchWithDealer(0);
    for (const a of [bid(160), pass, pass, pass] as Action[]) p = apply(p, a);
    p = apply(p, { type: 'trump', card: p.game.hands[1][0] });
    for (let i = 0; i < 4; i++) p = apply(p, pass);
    p = apply(p, { type: 'declare', open: true });
    expect(viewFor(p, 0).trump).toMatchObject({ open: true, declaredOpen: true, folded: null });
    expect(viewFor(p, 1).trump!.folded).not.toBeNull(); // the trumper knows their own card
  });

  it('lists legal actions as numbers too, and earlier games in the match', () => {
    const m = matchWithDealer(3);
    const v = viewFor(m, 0);
    expect(v.legalIds).toEqual(v.legal.map(encodeAction));
    expect(v.priority).toBe(0);
    expect(v.history).toEqual([]);
    expect(viewFor(m, 1).legal).toEqual([]);
  });
});
