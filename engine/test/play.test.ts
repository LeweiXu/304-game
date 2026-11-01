import { describe, expect, it } from 'vitest';
import { apply, legalActions, nextGame, viewFor, type MatchState } from '../src';
import { playOptions } from '../src/play';
import { cards, play, playState } from './helpers';

// Dealer 3, so seat 0 has priority and leads round 1. Play goes 0, 1, 2, 3.
const opts = (m: MatchState) => playOptions(m.game).map((o) => `${o.card}${o.faceDown ? '↓' : ''}`).sort();
const playAll = (m: MatchState, ...cs: string[]) => cs.reduce((acc, c) => apply(acc, play(c as never)), m);

describe('closed trump: the trumper', () => {
  it('§T-1: cannot lead trump in round 1 with priority', () => {
    const m = playState({ hands: [cards('Kh 9c Ad'), cards('Ac'), cards('Kc'), cards('Qc')], trumpSeat: 0, suit: 'h', indicator: 'Jh' });
    expect(opts(m)).toEqual(['9c', 'Ad']);
  });

  it('§T-2/§T-3: void in a non-trump lead, may cut with the folded trump or minus', () => {
    let m = playState({ hands: [cards('Ac'), cards('Kh 9d'), cards('Kc'), cards('Qc')], trumpSeat: 1, suit: 'h', indicator: 'Jh' });
    m = playAll(m, 'Ac');
    expect(opts(m)).toEqual(['9d↓', 'Jh↓']); // §T-4: the in-hand Kh can't be folded
  });

  it('§T-4: only trumps in hand, so must cut with the folded trump', () => {
    let m = playState({ hands: [cards('Ac'), cards('Kh Qh'), cards('Kc'), cards('Qc')], trumpSeat: 1, suit: 'h', indicator: 'Jh' });
    m = playAll(m, 'Ac');
    expect(opts(m)).toEqual(['Jh↓']);
  });

  it('§T-5: trump led and holding in-hand trumps, follows face up', () => {
    let m = playState({ hands: [cards('Ah'), cards('Kh 9d'), cards('Kc'), cards('Qc')], trumpSeat: 1, suit: 'h', indicator: 'Jh' });
    m = playAll(m, 'Ah');
    expect(opts(m)).toEqual(['Kh']);
  });

  it('§T-6: trump led and only the folded trump left, must minus', () => {
    let m = playState({ hands: [cards('Ah'), cards('9d 7c'), cards('Kc'), cards('Qc')], trumpSeat: 1, suit: 'h', indicator: 'Jh' });
    m = playAll(m, 'Ah');
    expect(opts(m)).toEqual(['7c↓', '9d↓']);
  });

  it('§T-2: the folded trump is the last card in round 8', () => {
    const m = playState({ hands: [cards('Ac'), [], cards('Kc'), cards('Qc')], trumpSeat: 1, suit: 'h', indicator: 'Jh' });
    m.game.play!.round = 8;
    const after = playAll(m, 'Ac');
    expect(opts(after)).toEqual(['Jh']);
  });
});

describe('closed trump: everyone else', () => {
  it('a player who cannot follow plays face down, any card', () => {
    let m = playState({ hands: [cards('Ac'), cards('Kc'), cards('Jh 7d'), cards('Qc')], trumpSeat: 1, suit: 'h', indicator: '9h' });
    m = playAll(m, 'Ac', 'Kc');
    expect(opts(m)).toEqual(['7d↓', 'Jh↓']);
  });

  it('nobody else can see a face-down card, or the trump suit, until it is revealed', () => {
    let m = playState({ hands: [cards('Ac 7s'), cards('Kc 8s'), cards('Jd 7d'), cards('Qc 9s')], trumpSeat: 1, suit: 'h', indicator: '9h' });
    m = playAll(m, 'Ac', 'Kc', '7d');
    expect(viewFor(m, 0).play!.trick[2].card).toBeNull();
    expect(viewFor(m, 2).play!.trick[2].card).toBe('7d');
    expect(viewFor(m, 0).trump!.suit).toBeNull();
    expect(viewFor(m, 1).trump!.suit).toBe('h');
    expect(viewFor(m, 0).trump!.indicator).toBeNull();
    expect(viewFor(m, 1).trump!.indicator).toBe('9h');
  });
});

describe('resolving folded cards', () => {
  it('a cut with the folded trump wins, opens trump, and minuses stay hidden', () => {
    let m = playState({ hands: [cards('Ac 7s'), cards('9d 8s'), cards('Kc 9s'), cards('7d 10s')], trumpSeat: 1, suit: 'h', indicator: 'Jh' });
    m = playAll(m, 'Ac', 'Jh', 'Kc', '7d');
    const last = m.game.play!.tricks[0];
    expect(last.winner).toBe(1);
    expect(last.revealedTrump).toBe(true);
    expect(m.game.trump!.open).toBe(true);
    expect(m.game.trump!.indicator).toBeNull();
    const seen = viewFor(m, 0).play!.lastTrick!.cards;
    expect(seen.find((c) => c.seat === 1)!.card).toBe('Jh'); // revealed trump
    expect(seen.find((c) => c.seat === 3)!.card).toBeNull(); // minus stays face down
    expect(m.game.play!.points[1]).toBe(11 + 30 + 3 + 0);
  });

  it('overcut: the highest folded trump wins, and the folded card joins the trumper\'s hand', () => {
    let m = playState({ hands: [cards('Ac 7s'), cards('9d 8s'), cards('7h 9s'), cards('9h 10s')], trumpSeat: 1, suit: 'h', indicator: 'Jh' });
    m = playAll(m, 'Ac', '9d', '7h', '9h');
    expect(m.game.play!.tricks[0].winner).toBe(3);
    expect(m.game.trump!.open).toBe(true);
    expect(m.game.hands[1]).toContain('Jh');
  });

  it('no trump among the folded cards: highest of the led suit wins, trump stays closed', () => {
    let m = playState({ hands: [cards('Kc 7s'), cards('9d 8s'), cards('Ac 9s'), cards('7d 10s')], trumpSeat: 1, suit: 'h', indicator: 'Jh' });
    m = playAll(m, 'Kc', '9d', 'Ac', '7d');
    expect(m.game.play!.tricks[0].winner).toBe(2);
    expect(m.game.trump!.open).toBe(false);
  });
});

describe('open trump', () => {
  it('exhausted trumps: the trumper keeps leading trump while nobody else has any', () => {
    let m = playState({
      hands: [cards('Jh 9h Ac'), cards('Kc 7d 8d'), cards('Qc 7c 8s'), cards('10c 9s 7s')],
      trumpSeat: 0, suit: 'h', open: true,
    });
    m = playAll(m, 'Jh', 'Kc', 'Qc', '10c');
    expect(m.game.play!.leader).toBe(0);
    expect(opts(m)).toEqual(['9h']);
  });

  it('declaring open with priority means leading trump in round 1', () => {
    const m = playState({ hands: [cards('Kh Ac'), cards('Kc'), cards('Qc'), cards('7c')], trumpSeat: 0, suit: 'h', open: true });
    m.game.trump!.mustLeadTrump = true;
    expect(opts(m)).toEqual(['Kh']);
  });
});

describe('scoring', () => {
  function lastTrick(points: [number, number], bid: number, stone: [number, number]) {
    const m = playState({ hands: [cards('Jc'), cards('7c'), cards('8c'), cards('Qc')], trumpSeat: 0, suit: 'h', open: true, bid });
    m.game.play!.round = 8;
    m.game.play!.points = points;
    m.stone = stone;
    return playAll(m, 'Jc', '7c', '8c', 'Qc'); // seat 0 wins 32 points
  }

  it('making the bid: the bidding team gives stone', () => {
    const m = lastTrick([130, 142], 160, [10, 10]);
    expect(m.game.end).toMatchObject({ kind: 'played', made: true, giver: 0, stone: 1 });
    expect(m.stone).toEqual([9, 11]);
  });

  it('failing the bid: the bidding team receives stone from the opponents', () => {
    const m = lastTrick([120, 152], 200, [10, 10]);
    expect(m.game.end).toMatchObject({ made: false, giver: 1, stone: 3 });
    expect(m.stone).toEqual([13, 7]);
  });

  it('giving away your last stone wins the match', () => {
    const m = lastTrick([220, 52], 250, [2, 18]);
    expect(m.stone).toEqual([0, 20]);
    expect(m.winner).toBe(0);
    expect(() => nextGame(m)).toThrow();
  });

  it('the deal rotates anticlockwise, except after a redeal', () => {
    const m = lastTrick([130, 142], 160, [10, 10]);
    expect(nextGame(m).game.dealer).toBe(0);
    expect(legalActions(nextGame(m).game).length).toBeGreaterThan(0);
  });
});
