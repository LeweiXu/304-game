import type { Card, Suit } from './cards';
import type { Seat, Team } from './seats';

/**
 * bid4     betting on the first 4 cards
 * trump4   the 4-card winner places a trump card face down
 * bid8     betting after the second deal (skipped after a PCC bid on 4 cards)
 * trump8   an 8-card bid superseded the 4-card one: the new trumper picks again
 * declare  the trumper chooses open or closed trump (skipped for PCC, which is always open)
 * show     open trump without priority, or PCC: the trumper shows one trump card to the table
 * play     8 rounds of tricks
 * over     the game ended; see GameState.end
 */
export type Phase = 'bid4' | 'trump4' | 'bid8' | 'trump8' | 'declare' | 'show' | 'play' | 'over';

/** House-rule switches, chosen per match. Each game copies them when it's dealt. */
export interface RuleOptions {
  /** 'random': full shuffle every deal. 'slap': the last game's cards, 1-3 slap shuffles and a cut. */
  shuffle: 'random' | 'slap';
  /** Caps rules. Stored, but caps itself isn't implemented yet. */
  caps: boolean;
  /** Claim balance. Stored, but not implemented yet. */
  claimBalance: boolean;
  /** Players may claim the game once their team has reached its points threshold. */
  claimThreshold: boolean;
}

export const DEFAULT_RULES: RuleOptions = { shuffle: 'random', caps: true, claimBalance: false, claimThreshold: false };

/** The PCC (Partner Closed Caps) bid, stored as a bid value above every numeric bid. */
export const PCC = 999;

export type Action =
  | { type: 'bid'; value: number }
  | { type: 'pass' }
  | { type: 'partner' } // ask your partner to bid in your seat (4-card round only)
  | { type: 'redeal' } // 4 cards under 15 points
  | { type: 'passOn' } // 8 cards under 25 points, first 8-card speech
  | { type: 'trump'; card: Card }
  | { type: 'pcc' } // Partner Closed Caps: the highest bid
  | { type: 'declare'; open: boolean }
  | { type: 'show'; card: Card } // open trump: show this trump card to the table
  | { type: 'absolute' } // goodwill declaration of an absolute hand before round 1: pass-on
  | { type: 'spoilt' } // call Spoilt Trumps
  | { type: 'claim' } // claim the game: my team has reached its points threshold
  | { type: 'play'; card: Card };

/** value is PCC (999) for a PCC bid. */
export interface HighBid { seat: Seat; value: number }

export interface Speech {
  stage: 4 | 8; // which betting round
  seat: Seat; // who spoke
  action: 'bid' | 'pass' | 'partner';
  value?: number; // PCC (999) for a PCC bid
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
  /** The card the trumper placed face down. Stays set after it's picked up or played. */
  folded: Card;
  /** Open trump declared, or closed trump revealed by a cut. */
  open: boolean;
  /** Trump was declared open before play (rather than revealed by a cut). */
  declaredOpen: boolean;
  /** Everyone has seen which card was folded: it was flipped on a cut reveal or played face up. */
  foldedPublic: boolean;
  /** The trump card shown to the table on an open declaration (or for PCC). */
  shown: Card | null;
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
      /** PCC game: decided by tricks (all 8 to the trumper), not points. */
      pcc: boolean;
      /** Set when the game ended early because this seat claimed its team's threshold. */
      claimedBy: Seat | null;
      /** Tricks won per team (fewer than 8 in total if the game ended early). */
      tricks: [number, number];
    }
  | { kind: 'passOn'; reason: 'noBids' }
  | { kind: 'passOn'; reason: 'lowPoints8'; seat: Seat }
  | { kind: 'redeal'; seat: Seat }
  /** Absolute hand: declared in goodwill before round 1, or claimed by the opposition after losing every round. */
  | { kind: 'absolute'; seat: Seat; how: 'goodwill' | 'claim' }
  /** A correct Spoilt Trumps call voids the game. */
  | { kind: 'spoilt'; seat: Seat };

/** A penalty handed out during a game, settled when it ends: the offender's opponents give away stone. */
export interface Penalty { seat: Seat; reason: 'falseSpoilt'; stone: number }

export interface GameState {
  number: number;
  /** Rule options in force for this game. */
  rules: RuleOptions;
  dealer: Seat;
  phase: Phase;
  hands: Card[][];
  /** The 16 cards waiting for the second deal. */
  stock: Card[];
  bidding: Bidding;
  /** Every speech of both betting rounds, in order. */
  auction: Speech[];
  bid4: HighBid | null;
  bid8: HighBid | null;
  trump: TrumpState | null;
  play: PlayState | null;
  /** PCC: the trumper's partner, who sits the game out. */
  pccOut: Seat | null;
  /** Everyone's 8 cards as play began (the trumper's include the folded card). Used to settle Spoilt Trumps and absolute hands. */
  dealt: Card[][] | null;
  /** Seats that have called Spoilt Trumps this game (one call each). */
  spoiltCalled: boolean[];
  penalties: Penalty[];
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
  /** Rule options for upcoming games (change with withRules). */
  rules: RuleOptions;
  /** The physical order of the 32 cards after the last game, top first. Slap shuffling starts from it. */
  pile: Card[] | null;
  /** Consecutive 4-card redeals called from the same seat (three in a row earns a riffle shuffle). */
  redealStreak: { seat: Seat; count: number } | null;
}
