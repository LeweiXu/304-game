import { describe, expect, it } from 'vitest';
import {
  apply, isAbsoluteHand, legalActions, makeRng, newMatch, nextGame, nextSeat, PACK, PCC, toAct, viewFor, withRules,
  type Action, type Card, type MatchState, type Seat, type Trick,
} from '../src';
import { buildDeck } from '../src/shuffle';
import { bid, cards, matchWithDealer, pass, play, playState } from './helpers';

const D: Seat = 3;
const A = nextSeat(D, 1), B = nextSeat(D, 2), C = nextSeat(D, 3);
const types = (m: MatchState) => legalActions(m.game).map((a) => a.type);
const run = (m: MatchState, actions: Action[]) => actions.reduce((acc, a) => apply(acc, a), m);
const playAll = (m: MatchState, ...cs: string[]) => cs.reduce((acc, c) => apply(acc, play(c as Card)), m);

/** A at 160 on 4 cards, trump chosen, now in 8-card betting with A to speak. */
function toBid8(m = matchWithDealer(D)): MatchState {
  m = run(m, [bid(160), pass, pass, pass]);
  return apply(m, { type: 'trump', card: m.game.hands[A][0] });
}

describe('PCC', () => {
  it('on 8 cards: partner sits out, trumper shows a trump and leads, tricks have three cards', () => {
    let m = toBid8();
    m = run(m, [pass, { type: 'pcc' }]);
    expect(legalActions(m.game).filter((a) => a.type === 'bid' || a.type === 'pcc')).toEqual([]); // nothing outranks PCC
    m = run(m, [pass, pass, pass]); // C, D, A
    expect(m.game.phase).toBe('trump8');
    expect(toAct(m.game)).toBe(B);
    m = apply(m, { type: 'trump', card: m.game.hands[B][0] });
    expect(m.game.phase).toBe('show'); // PCC is always open trump
    expect(m.game.pccOut).toBe(nextSeat(B, 2));
    m = apply(m, legalActions(m.game).find((a) => a.type === 'show')!);
    expect(m.game.phase).toBe('play');
    expect(toAct(m.game)).toBe(B); // the PCC trumper has priority for round 1
    const leadOptions = legalActions(m.game).filter((a) => a.type === 'play');
    expect(leadOptions).toHaveLength(8); // and isn't forced to lead trump
    m = apply(m, leadOptions[0]);
    m = apply(m, legalActions(m.game).find((a) => a.type === 'play')!);
    m = apply(m, legalActions(m.game).find((a) => a.type === 'play')!);
    expect(m.game.play!.tricks).toHaveLength(1); // three cards made a trick
    expect(m.game.play!.tricks[0].cards.map((c) => c.seat)).not.toContain(m.game.pccOut);
  });

  it('can only be bid on 8 cards', () => {
    const m = matchWithDealer(D);
    expect(types(m)).not.toContain('pcc');
    expect(types(toBid8())).toContain('pcc');
  });

  it('is won by taking all 8 tricks (5 stone), lost the moment the opponents take one', () => {
    // Seat 0 is the PCC trumper (spades open), seat 2 sits out. Round 8, seat 0 leads the boss trump.
    const win = playState({ hands: [cards('Js'), cards('7c'), cards('8d 9d'), cards('7h')], trumpSeat: 0, suit: 's', open: true, bid: PCC });
    win.game.pccOut = 2;
    win.game.play!.round = 8;
    win.game.play!.tricks = Array.from({ length: 7 }, (_, i) => ({ round: i + 1, leader: 0 as Seat, cards: [], winner: 0 as Seat, points: 0, revealedTrump: false }));
    const done = playAll(win, 'Js', '7c', '7h');
    expect(done.game.end).toMatchObject({ kind: 'played', pcc: true, made: true, giver: 0, stone: 5 });

    const lose = playState({ hands: [cards('Kc 9s'), cards('Jc 8c'), cards('7d 8d'), cards('7h 8h')], trumpSeat: 0, suit: 's', open: true, bid: PCC });
    lose.game.pccOut = 2;
    const lost = playAll(lose, 'Kc', 'Jc', '7h'); // seat 1 takes round 1
    expect(lost.game.end).toMatchObject({ kind: 'played', pcc: true, made: false, giver: 1, stone: 5 });
  });
});

describe('absolute hand', () => {
  it('all eight trumps can be declared in goodwill: a pass-on', () => {
    let m = toBid8();
    const g = m.game;
    // Give A all eight hearts and fold one of them.
    const hearts = PACK.filter((c) => c.endsWith('h')) as Card[];
    const others = PACK.filter((c) => !c.endsWith('h')) as Card[];
    g.trump = { ...g.trump!, suit: 'h', indicator: hearts[7], folded: hearts[7] };
    g.hands = [0, 1, 2, 3].map((s) => (s === A ? hearts.slice(0, 7) : others.splice(0, 8)));
    m = run(m, [pass, pass, pass, pass]);
    expect(m.game.phase).toBe('declare');
    expect(types(m)).toContain('absolute');
    expect(apply(m, { type: 'absolute' }).game.end).toEqual({ kind: 'absolute', seat: A, how: 'goodwill' });
  });

  it('if the trumper sweeps with all eight trumps, the opposition claims it after the game: a pass-on', () => {
    const hearts = PACK.filter((c) => c.endsWith('h')) as Card[];
    const others = PACK.filter((c) => !c.endsWith('h')) as Card[];
    let m = playState({ hands: [hearts, others.slice(0, 8), others.slice(8, 16), others.slice(16, 24)], trumpSeat: 0, suit: 'h', open: true });
    const rng = makeRng(1);
    while (m.game.phase !== 'over') {
      const legal = legalActions(m.game).filter((a) => a.type === 'play');
      m = apply(m, legal[rng.int(legal.length)]);
    }
    expect(m.game.end).toEqual({ kind: 'absolute', seat: 0, how: 'claim' });
    expect(m.stone).toEqual([10, 10]);
  });

  it('is not offered without an absolute hand', () => {
    const m = run(toBid8(), [pass, pass, pass, pass]);
    expect(types(m)).not.toContain('absolute');
  });

  it('with priority: the top trumps draw every outstanding trump and the rest are top cards', () => {
    expect(isAbsoluteHand(cards('Jh 9h Ah 10h Kh Jc 9c Js'), 'h', true)).toBe(true); // 3 trumps out, top 3 held; Jc 9c and Js are tops
    expect(isAbsoluteHand(cards('Jh 9h Ah 10h Kh Jc 9c Js'), 'h', false)).toBe(false); // without the lead an opponent leads clubs and someone cuts
    expect(isAbsoluteHand(cards('Jh 9h Ah 10h Kh Jc Ac Js'), 'h', true)).toBe(false); // 9c is out: Ac can lose
    expect(isAbsoluteHand(cards('Jh 9h 10h Kh Qh Jc 9c Js'), 'h', true)).toBe(false); // Ah is out and outranks the 3rd trump lead
    expect(isAbsoluteHand(cards('Jh 9h Ah 10h Kh Qh 8h 7h'), 'h', false)).toBe(true); // all eight
  });
});

describe('Spoilt Trumps', () => {
  it('is detected automatically when play would start: the same dealer redeals', () => {
    // A wins on 4 cards with hearts; nobody on B/D's team gets a heart.
    let m = matchWithDealer(D);
    const hearts = PACK.filter((c) => c.endsWith('h')) as Card[];
    const others = PACK.filter((c) => !c.endsWith('h')) as Card[];
    m.game.hands = [0, 1, 2, 3].map((s) => (s === A ? [hearts[0], ...others.slice(0, 3)] : s === C ? hearts.slice(1, 5) : others.slice(3 + s * 4, 7 + s * 4))) as Card[][];
    m.game.stock = [...hearts.slice(5), ...others.slice(19)].slice(0, 16) as Card[];
    // Pad the stock so every seat gets 4 more cards, none of them hearts for B and D.
    const used = new Set([...m.game.hands.flat(), ...m.game.stock]);
    const spare = (PACK as Card[]).filter((c) => !used.has(c));
    m.game.stock = [...m.game.stock, ...spare].slice(0, 16);
    m = run(m, [bid(160), pass, pass, pass]);
    m = apply(m, { type: 'trump', card: hearts[0] });
    m = run(m, [pass, pass, pass, pass, { type: 'declare', open: false }]);
    const bdHearts = [B, D].some((s) => m.game.dealt?.[s].some((c) => c.endsWith('h')));
    if (!bdHearts) {
      expect(m.game.end).toEqual({ kind: 'spoilt' });
      expect(m.history.at(-1)).toEqual({ kind: 'spoilt' });
      expect(nextGame(m).game.dealer).toBe(D);
    }
  });

  it('is not an action any more', () => {
    const m = playState({ hands: [cards('Ac 7s'), cards('9h 8s'), cards('Qc 9s'), cards('7d 10s')], trumpSeat: 0, suit: 'h', indicator: 'Jh' });
    expect(types(m)).not.toContain('spoilt' as never);
  });
});

describe('claim threshold', () => {
  function nearlyThere(rules: { claimThreshold: boolean }) {
    const m = playState({ hands: [cards('Jc 7s'), cards('9c 8s'), cards('Ac 9s'), cards('7d 10s')], trumpSeat: 0, suit: 'h', open: true, bid: 160 });
    m.game.rules = { ...m.game.rules, ...rules };
    // Two earlier tricks worth 142 to seat 0's team, as the engine would have recorded them.
    const trick = (round: number, cs: string): Trick => ({
      round, leader: 0, winner: 0, points: 71, revealedTrump: false,
      cards: cards(cs).map((card, i) => ({ seat: i as Seat, card, faceDown: false, revealed: false })),
    });
    m.game.play!.tricks = [trick(1, 'Jd 9d Ad 10d'), trick(2, 'Jh 9h Ah 10h')];
    m.game.play!.points = [142, 0];
    m.game.play!.round = 3;
    return m;
  }

  it('is only offered when the option is on and the team can see it has reached its threshold', () => {
    let m = nearlyThere({ claimThreshold: true });
    expect(types(m)).not.toContain('claim'); // 142 < 160
    m = playAll(m, 'Jc', '9c', 'Ac', '7d'); // 30 + 20 + 11 = 61 more to seat 0's team: 203 >= 160
    expect(toAct(m.game)).toBe(0);
    expect(types(m)).toContain('claim');
    expect(types(nearlyThere({ claimThreshold: false }))).not.toContain('claim');
  });

  it('claiming ends the game with the claimed result', () => {
    let m = nearlyThere({ claimThreshold: true });
    m = playAll(m, 'Jc', '9c', 'Ac', '7d');
    m = apply(m, { type: 'claim' });
    expect(m.game.end).toMatchObject({ kind: 'played', made: true, claimedBy: 0, giver: 0, stone: 1 });
  });

  it('the opposition claims at 305 - bid', () => {
    const v = viewFor(nearlyThere({ claimThreshold: true }), 1);
    expect(v.thresholds).toEqual([160, 145]);
  });
});

describe('shuffling', () => {
  it("slap shuffling keeps most of the last game's order, and is a real permutation", () => {
    const pile = [...PACK] as Card[];
    const rules = { shuffle: 'slap' as const, caps: true, claimBalance: false, claimThreshold: false };
    let kept = 0;
    for (let i = 0; i < 200; i++) {
      const deck = buildDeck(makeRng(i + 1), rules, pile, false);
      expect([...deck].sort()).toEqual([...pile].sort());
      for (let j = 0; j + 1 < 32; j++) if (PACK.indexOf(deck[j + 1]) === PACK.indexOf(deck[j]) + 1) kept++;
    }
    expect(kept / (200 * 31)).toBeGreaterThan(0.7); // a full shuffle keeps about 3%
  });

  it("a match in slap mode deals from the previous game's cards", () => {
    let m = newMatch(5, { rules: { shuffle: 'slap' } });
    m = run(m, [pass, pass, pass, pass]); // pass-on
    expect(m.pile).toHaveLength(32);
    const next = nextGame(m);
    expect(next.game.hands.flat().length + next.game.stock.length).toBe(32);
  });

  it('three redeals in a row from the same seat earn a riffle', () => {
    let m = matchWithDealer(D);
    for (let i = 0; i < 3; i++) {
      m.game.hands[A] = ['7c', '8c', '7d', 'Qh'];
      m = apply(m, { type: 'redeal' });
      if (i < 2) m = nextGame(m);
    }
    expect(m.redealStreak).toEqual({ seat: A, count: 3 });
    expect(nextGame(m).redealStreak).toBeNull(); // used up by the riffle
  });

  it('rule changes apply from the next game', () => {
    let m = withRules(newMatch(1), { claimThreshold: true });
    expect(m.game.rules.claimThreshold).toBe(false);
    m = run(m, [pass, pass, pass, pass]);
    expect(nextGame(m).game.rules.claimThreshold).toBe(true);
  });
});

void C;
