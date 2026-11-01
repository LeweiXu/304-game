import { newMatch, type Action, type Card, type GameState, type MatchState, type Seat, type Suit } from '../src';
import { newPlay } from '../src/play';

/** A match whose current game has the given dealer, in 4-card bidding. */
export function matchWithDealer(dealer: Seat, seed = 1): MatchState {
  return newMatch(seed, { dealer });
}

export const bid = (value: number): Action => ({ type: 'bid', value });
export const pass: Action = { type: 'pass' };
export const partner: Action = { type: 'partner' };
export const play = (card: Card): Action => ({ type: 'play', card });

/**
 * A match frozen at the start of play (or mid-trick) with hand-picked cards.
 * `indicator` set means closed trump with that card face down.
 */
export function playState(opts: {
  dealer?: Seat;
  hands: Card[][];
  trumpSeat: Seat;
  suit: Suit;
  indicator?: Card | null;
  open?: boolean;
  bid?: number;
}): MatchState {
  const m = newMatch(1, { dealer: opts.dealer ?? 3 });
  const g: GameState = m.game;
  g.hands = opts.hands.map((h) => [...h]);
  g.stock = [];
  g.bid4 = { seat: opts.trumpSeat, value: opts.bid ?? 160 };
  const folded = opts.indicator ?? (`J${opts.suit}` as Card);
  g.trump = {
    seat: opts.trumpSeat, suit: opts.suit, indicator: opts.indicator ?? null, folded,
    open: opts.open ?? false, declaredOpen: opts.open ?? false, foldedPublic: opts.open ?? false, mustLeadTrump: false,
  };
  g.play = newPlay(g);
  g.phase = 'play';
  return m;
}

/** Card list from a compact string: "Jc 9c Ah 10d". */
export const cards = (s: string): Card[] => s.split(/\s+/).filter(Boolean) as Card[];
