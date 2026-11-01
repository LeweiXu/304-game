import type { Card, Suit } from './cards';
import type { Seat, Team } from './seats';

/**
 * bid4     betting on the first 4 cards
 * trump4   the 4-card winner places a trump card face down
 * bid8     betting after the second deal
 * trump8   an 8-card bid superseded the 4-card one: the new trumper picks again
 * declare  the trumper chooses open or closed trump
 * play     8 rounds of tricks
 * over     the game ended (played out, pass-on or redeal); see GameState.end
 */
export type Phase = 'bid4' | 'trump4' | 'bid8' | 'trump8' | 'declare' | 'play' | 'over';

export type Action =
  | { type: 'bid'; value: number }
  | { type: 'pass' }
  | { type: 'partner' } // ask your partner to bid in your seat (4-card round only)
  | { type: 'redeal' } // 4 cards under 15 points
  | { type: 'passOn' } // 8 cards under 25 points, first 8-card speech
  | { type: 'trump'; card: Card }
  | { type: 'declare'; open: boolean }
  | { type: 'play'; card: Card };

export interface HighBid { seat: Seat; value: number }

export interface Speech {
  seat: Seat; // who spoke
  action: 'bid' | 'pass' | 'partner';
  value?: number;
  inSeat?: Seat; // set when speaking in a partner's seat after "partner"
}

export interface Bidding {
  stage: 4 | 8;
  /** The seat whose turn it is. */
  turn: Seat;
  /** Who actually speaks. Differs from `turn` only right after a partner call. */
  speaker: Seat;
  high: HighBid | null;
  spoken: boolean[];
  passes: number;
  /** §B-1: a partnered player's next normal turn is skipped once. */
  skipOnce: boolean[];
  /** The seat that said "partner" this round, if any. */
  partneredBy: Seat | null;
  speeches: Speech[];
}

export interface TrumpState {
  seat: Seat;
  suit: Suit;
  /** The face-down trump card while it's still on the table, else null. */
  indicator: Card | null;
  /** Open trump declared, or closed trump revealed by a cut. */
  open: boolean;
  /** Open trump declared by a trumper with priority: round 1 must be led with trump. */
  mustLeadTrump: boolean;
}

export interface TrickCard {
  seat: Seat;
  card: Card;
  faceDown: boolean;
  /** A face-down card shown to everyone because it was a trump. */
  revealed: boolean;
}

export interface Trick {
  round: number;
  leader: Seat;
  cards: TrickCard[];
  winner: Seat;
  points: number;
  /** This trick is where closed trump got revealed. */
  revealedTrump: boolean;
}

export interface PlayState {
  round: number;
  leader: Seat;
  turn: Seat;
  trick: TrickCard[];
  tricks: Trick[];
  points: [number, number];
}

export type GameEnd =
  | {
      kind: 'played';
      bid: HighBid;
      bidTeam: Team;
      points: [number, number];
      made: boolean;
      /** The team that won the game and gave away stone, and how much. */
      giver: Team;
      stone: number;
    }
  | { kind: 'passOn'; reason: 'noBids' }
  | { kind: 'passOn'; reason: 'lowPoints8'; seat: Seat }
  | { kind: 'redeal'; seat: Seat };

export interface GameState {
  number: number;
  dealer: Seat;
  phase: Phase;
  hands: Card[][];
  /** The 16 cards waiting for the second deal. */
  stock: Card[];
  bidding: Bidding;
  bid4: HighBid | null;
  bid8: HighBid | null;
  trump: TrumpState | null;
  play: PlayState | null;
  end: GameEnd | null;
}

export interface MatchState {
  seed: number;
  /** RNG state, advanced every deal. */
  rng: number;
  /** Stone left per team. First to 0 wins. */
  stone: [number, number];
  game: GameState;
  /** Every finished game's outcome, in order. */
  history: GameEnd[];
  winner: Team | null;
  /** Number of actions applied so far (handy for deriving bot seeds). */
  steps: number;
}
