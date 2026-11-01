// What one seat is allowed to know. Bots and the UI only ever get this, never
// the full state, so nobody can peek at other hands or folded cards.
import { pointsOf, type Card, type Suit } from './cards';
import { legalActions, toAct } from './game';
import { teamOf, type Seat, type Team } from './seats';
import type { Action, GameEnd, HighBid, MatchState, Phase, Speech, TrickCard } from './types';

export interface SeenCard {
  seat: Seat;
  /** null when it went face down and this seat may not see it. */
  card: Card | null;
  faceDown: boolean;
  revealed: boolean;
}

export interface SeenTrick {
  round: number;
  leader: Seat;
  cards: SeenCard[];
  winner: Seat;
  /** Points of the cards this seat can see (folded cards stay secret until the end). */
  visiblePoints: number;
  revealedTrump: boolean;
}

export interface PlayerView {
  seat: Seat;
  gameNumber: number;
  dealer: Seat;
  phase: Phase;
  stone: [number, number];
  matchWinner: Team | null;
  hand: Card[];
  handCounts: number[];
  toAct: Seat | null;
  /** Your legal actions. Empty unless it's your turn. */
  legal: Action[];
  bidding: { stage: 4 | 8; turn: Seat; speaker: Seat; high: HighBid | null; speeches: Speech[] };
  bid4: HighBid | null;
  bid8: HighBid | null;
  trump: {
    seat: Seat;
    open: boolean;
    /** Known to the trumper always, to everyone else once trump is open. */
    suit: Suit | null;
    indicatorOnTable: boolean;
    /** The face-down card itself: only the trumper sees it. */
    indicator: Card | null;
  } | null;
  play: {
    round: number;
    leader: Seat;
    turn: Seat;
    trick: SeenCard[];
    /** Only the most recent completed trick may be inspected at the table... */
    lastTrick: SeenTrick | null;
    /** ...but players may remember everything they saw: every completed trick, as this seat saw it. */
    tricks: SeenTrick[];
    tricksWon: [number, number];
    visiblePoints: [number, number];
  } | null;
  end: GameEnd | null;
}

function see(c: TrickCard, viewer: Seat): SeenCard {
  const visible = !c.faceDown || c.revealed || c.seat === viewer;
  return { seat: c.seat, card: visible ? c.card : null, faceDown: c.faceDown, revealed: c.revealed };
}

export function viewFor(m: MatchState, seat: Seat): PlayerView {
  const g = m.game;
  const t = g.trump;
  const p = g.play;
  const actor = toAct(g);
  const tricks = (p?.tricks ?? []).map((tr) => {
    const cards = tr.cards.map((c) => see(c, seat));
    return {
      round: tr.round, leader: tr.leader, cards, winner: tr.winner, revealedTrump: tr.revealedTrump,
      visiblePoints: cards.reduce((n, c) => n + (c.card ? pointsOf(c.card) : 0), 0),
    };
  });
  const tricksWon: [number, number] = [0, 0];
  const visiblePoints: [number, number] = [0, 0];
  for (const tr of tricks) {
    tricksWon[teamOf(tr.winner)] += 1;
    visiblePoints[teamOf(tr.winner)] += tr.visiblePoints;
  }
  return {
    seat,
    gameNumber: g.number,
    dealer: g.dealer,
    phase: g.phase,
    stone: [m.stone[0], m.stone[1]],
    matchWinner: m.winner,
    hand: [...g.hands[seat]],
    handCounts: g.hands.map((h) => h.length),
    toAct: actor,
    legal: actor === seat ? legalActions(g) : [],
    bidding: {
      stage: g.bidding.stage, turn: g.bidding.turn, speaker: g.bidding.speaker,
      high: g.bidding.high, speeches: [...g.bidding.speeches],
    },
    bid4: g.bid4,
    bid8: g.bid8,
    trump: t && {
      seat: t.seat,
      open: t.open,
      suit: t.open || t.seat === seat ? t.suit : null,
      indicatorOnTable: t.indicator !== null,
      indicator: t.seat === seat ? t.indicator : null,
    },
    play: p && {
      round: p.round, leader: p.leader, turn: p.turn,
      trick: p.trick.map((c) => see(c, seat)),
      lastTrick: tricks.at(-1) ?? null,
      tricks,
      tricksWon, visiblePoints,
    },
    end: g.end,
  };
}
