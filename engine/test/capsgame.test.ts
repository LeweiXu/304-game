import { describe, expect, it } from 'vitest';
import { apply, legalActions, toAct, type Card, type MatchState, type RuleOptions, type Seat, type Trick } from '../src';
import { cards, play, playState } from './helpers';

const trick = (round: number, leader: Seat, cs: string): Trick => {
  const list = cards(cs);
  const seats = [0, 1, 2, 3].map((i) => ((leader + i) % 4) as Seat);
  return {
    round, leader, winner: leader, points: 0, revealedTrump: false,
    cards: list.map((card, i) => ({ seat: seats[i], card, faceDown: false, revealed: false })),
  };
};

/**
 * Round 5, hearts open, seat 0 is the trumper (bid 160) and has priority.
 * Four tricks played, each four cards of one suit, so nobody has shown a void.
 * The leader of each played trick won it (the King).
 */
function position(hands: string[], opts: { rules?: Partial<RuleOptions>; lastWinner?: Seat } = {}): MatchState {
  const m = playState({ hands: hands.map(cards), trumpSeat: 0, suit: 'h', open: true, bid: 160 });
  const g = m.game;
  g.rules = { ...g.rules, caps: true, claimBalance: false, claimThreshold: false, ...opts.rules };
  const last = opts.lastWinner ?? 0;
  g.play!.tricks = [trick(1, 0, 'Kh Qh 8h 7h'), trick(2, 0, 'Kc Qc 8c 7c'), trick(3, 0, 'Kd Qd 8d 7d'), trick(4, last, 'Ks Qs 8s 7s')];
  g.play!.points = [15, 0];
  g.play!.points[last % 2] += 5;
  g.play!.round = 5;
  g.play!.leader = last;
  g.play!.turn = last;
  g.dealt = g.hands.map((h) => [...h]);
  return m;
}

// Seat 0 holds the top four trumps and nobody else has a heart: a sure sweep.
const SWEEP = ['Jh 9h Ah 10h', 'Jc 9c Ac 10c', 'Jd 9d Ad 10d', 'Js 9s As 10s'];

describe('caps', () => {
  it('is offered on your turn while your team has won every round', () => {
    const m = position(SWEEP);
    expect(legalActions(m.game).some((a) => a.type === 'caps')).toBe(true);
    expect(legalActions(position(SWEEP, { rules: { caps: false } }).game).some((a) => a.type === 'caps')).toBe(false);
  });

  it('correct caps before round 7: the win plus 1 stone', () => {
    const m = apply(position(SWEEP), { type: 'caps' });
    expect(m.game.end).toMatchObject({ kind: 'caps', seat: 0, result: 'correct', giver: 0, stone: 2 });
    expect(m.stone).toEqual([8, 10]);
  });

  it('a declared order is judged as declared, and has to list exactly your cards', () => {
    const m = position(SWEEP);
    expect(() => apply(m, { type: 'caps', order: cards('Jh 9h Ah') })).toThrow();
    const ok = apply(m, { type: 'caps', order: cards('10h Ah 9h Jh') });
    expect(ok.game.end).toMatchObject({ result: 'correct' });
  });

  it('late caps: an earlier chance was missed, so the game flips to a loss plus 1', () => {
    const m = position(SWEEP);
    m.game.capsFirst[0] = 0; // the engine had found a chance on an earlier turn
    const done = apply(m, { type: 'caps' });
    expect(done.game.end).toMatchObject({ result: 'late', giver: 1, stone: 3 });
  });

  it('early caps: no order guarantees the sweep, 5 stone', () => {
    const m = position(['Jc 9c Ac 10c', 'Jh 9h Ah 10h', 'Jd 9d Ad 10d', 'Js 9s As 10s']);
    const done = apply(m, { type: 'caps' });
    expect(done.game.end).toMatchObject({ result: 'early', giver: 1, stone: 5 });
  });

  it('wrong caps: an order exists, but not the one declared, 5 stone', () => {
    // Lead Jh 9h to pull Ah / 10h (9 outranks A), then Jc 9c are top clubs. Leading clubs first can be cut.
    const hands = ['Jh 9h Jc 9c', 'Ah 10h Ac 10c', 'Jd 9d Ad 10d', 'Js 9s As 10s'];
    expect(apply(position(hands), { type: 'caps', order: cards('Jh 9h Jc 9c') }).game.end).toMatchObject({ result: 'correct' });
    expect(apply(position(hands), { type: 'caps', order: cards('Jc 9c Jh 9h') }).game.end).toMatchObject({ result: 'wrong', stone: 5 });
  });

  it('sweeping without calling, after having had a chance: late caps', () => {
    let m = position(SWEEP);
    const order: Record<number, string[]> = { 0: ['Jh', '9h', 'Ah', '10h'] };
    while (m.game.phase === 'play') {
      const s = toAct(m.game)!;
      const plays = legalActions(m.game).filter((a) => a.type === 'play');
      const pick = s === 0 ? plays.find((a) => a.type === 'play' && a.card === order[0][0])! : plays[0];
      if (s === 0) order[0].shift();
      m = apply(m, pick);
    }
    expect(m.game.end).toMatchObject({ kind: 'caps', seat: null, team: 0, result: 'late' });
  });

  it('with caps off a sweep is just a normal win', () => {
    let m = position(SWEEP, { rules: { caps: false, claimThreshold: true } });
    while (m.game.phase === 'play') m = apply(m, legalActions(m.game).filter((a) => a.type === 'play')[0]);
    expect(m.game.end).toMatchObject({ kind: 'played', made: true });
  });
});

describe('ending once the game is decided', () => {
  it('with caps off: stops as soon as a team reaches its threshold', () => {
    const m = position(SWEEP, { rules: { caps: false } });
    m.game.play!.points = [150, 0];
    const done = [play('Jh'), play('Jc'), play('Jd'), play('Js')].reduce((x, a) => apply(x, a), m);
    expect(done.game.phase).toBe('over');
    expect(done.game.end).toMatchObject({ kind: 'played', made: true, tricks: [5, 0] });
  });

  it('with caps on: keeps going while a team could still sweep', () => {
    const m = position(SWEEP);
    m.game.play!.points = [150, 0];
    const after = [play('Jh'), play('Jc'), play('Jd'), play('Js')].reduce((x, a) => apply(x, a), m);
    expect(after.game.phase).toBe('play');
  });
});

describe('claim balance', () => {
  // Team 1 (seat 1) won round 4, so caps is off the table; seat 0 can still be sure of every remaining round.
  const BALANCE = ['Jh 9h Ah 10h', 'Jc 9c Ac 10c', 'Jd 9d Ad 10d', 'Js 9s As 10s'];
  const atSeat0 = (rules: Partial<RuleOptions>) => {
    let m = position(BALANCE, { rules: { claimBalance: true, ...rules }, lastWinner: 1 });
    m = [play('Jc'), play('Jd'), play('Js')].reduce((x, a) => apply(x, a), m); // seats 1, 2, 3
    return m;
  };

  it('a correct claim ends the game with every remaining card to the claimer', () => {
    const m = atSeat0({});
    expect(toAct(m.game)).toBe(0);
    expect(m.game.balanceFirst[0]).not.toBeNull();
    const done = apply(m, { type: 'balance' });
    expect(done.game.end).toMatchObject({ kind: 'played', made: true });
    expect(done.game.penalties).toEqual([]);
  });

  it('missing the claim costs 1 stone at the end of the game', () => {
    let m = atSeat0({});
    while (m.game.phase === 'play') m = apply(m, legalActions(m.game).filter((a) => a.type === 'play')[0]);
    expect(m.game.penalties.some((p) => p.reason === 'balanceMissed' && p.seat === 0)).toBe(true);
  });

  it('a wrong claim costs 1 stone, play goes on, and you only get one', () => {
    const m = position(BALANCE, { rules: { claimBalance: true }, lastWinner: 1 }); // seat 1 to lead clubs: not sure of anything
    const after = apply(m, { type: 'balance' });
    expect(after.game.phase).toBe('play');
    expect(after.game.penalties).toEqual([{ seat: 1, reason: 'balanceWrong', stone: 1 }]);
    expect(legalActions(after.game).some((a) => a.type === 'balance')).toBe(false);
  });
});

void (0 as unknown as Card);
