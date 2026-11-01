// What one seat is allowed to know: everything a player at the table can see
// or remember, and nothing else. Bots, the UI and the RL encoder only ever get
// this, never the full state.
//
// "Remember" matters: the rules only let you physically inspect the last trick,
// but a player with a perfect memory knows every card they saw played, so the
// view keeps the full history.
import { encodeAction } from './actions';
import { pointsOf, suitOf, type Card, type Suit } from './cards';
import { legalActions, thresholdFor, toAct } from './game';
import { nextSeat, teamOf, type Seat, type Team } from './seats';
import { PCC, type Action, type GameEnd, type HighBid, type MatchState, type Penalty, type Phase, type RuleOptions, type Speech, type TrickCard } from './types';

export interface SeenCard {
  seat: Seat;
  /** null when it went face down and this seat never got to see it. */
  card: Card | null;
  faceDown: boolean;
  /** A face-down trump that was shown to everyone when the trick was resolved. */
  revealed: boolean;
}

export interface SeenTrick {
  round: number;
  leader: Seat;
  /** In play order, starting with the leader. */
  cards: SeenCard[];
  winner: Seat;
  /** Points of the cards this seat saw. Equal to the trick's real points unless some face-down card stayed hidden. */
  visiblePoints: number;
  /** This trick is where closed trump got revealed. */
  revealedTrump: boolean;
}

export interface PlayerView {
  /** Whose view this is. */
  seat: Seat;
  gameNumber: number;
  dealer: Seat;
  /** The player to the dealer's right: speaks first in both betting rounds and leads round 1. */
  priority: Seat;
  phase: Phase;
  /** Stone left per team (team = seat % 2). */
  stone: [number, number];
  matchWinner: Team | null;
  /** Outcomes of the earlier games in this match, oldest first. */
  history: GameEnd[];
  /** House-rule options in force for this game. */
  rules: RuleOptions;

  /** My cards (not including my folded trump card while it sits on the table). */
  hand: Card[];
  /** Cards in hand per seat. */
  handCounts: number[];
  /** Whose decision it is (null once the game is over). */
  toAct: Seat | null;
  /** My legal actions. Empty unless it's my turn. */
  legal: Action[];
  /** The same actions as numbers 0..ACTION_COUNT-1 (see actions.ts), same order. */
  legalIds: number[];

  /** The betting round in progress (or the last one played). */
  bidding: { stage: 4 | 8; turn: Seat; speaker: Seat; high: HighBid | null; speeches: Speech[] };
  /** Every speech from both betting rounds, in order. */
  auction: Speech[];
  /** Winning 4-card bid, once 4-card betting is over. */
  bid4: HighBid | null;
  /** Winning 8-card bid, if anyone bid on 8 cards. */
  bid8: HighBid | null;
  /** The bid being played for: bid8 if there is one, else bid4. value is PCC (999) for a PCC bid. */
  contract: HighBid | null;
  /** PCC: the trumper's partner, who sits this game out. */
  pccOut: Seat | null;
  /** Points each team needs to win the game (bid / 305 - bid), per team. Null before a contract, and for PCC. */
  thresholds: [number, number] | null;

  trump: {
    /** The trumper (the contract holder once trump is chosen). */
    seat: Seat;
    /** Trump is open: declared open, or revealed by a cut. */
    open: boolean;
    /** It was declared open before play (as opposed to revealed by a cut). */
    declaredOpen: boolean;
    /** Known to the trumper always, to everyone once trump is open. */
    suit: Suit | null;
    /** The folded trump card is still face down on the table. */
    indicatorOnTable: boolean;
    /** That face-down card, while it's on the table. Only the trumper sees it. */
    indicator: Card | null;
    /** Which card was folded: the trumper always knows; everyone knows once it was flipped, shown or played face up. */
    folded: Card | null;
    /** Round in which a cut revealed trump, or null. */
    revealedInRound: number | null;
    /** The trump card shown to the table on an open declaration or for PCC, or null. */
    shown: Card | null;
    /** Open trump declared with priority: round 1 must be led with a trump. */
    mustLeadTrump: boolean;
  } | null;

  play: {
    /** 1-8 during play (9 after the last trick). */
    round: number;
    leader: Seat;
    turn: Seat;
    /** The trick in progress, in play order. */
    trick: SeenCard[];
    /** Suit of the card led to the trick in progress, or null before the lead. */
    ledSuit: Suit | null;
    /** Only the most recent completed trick may be inspected at the table... */
    lastTrick: SeenTrick | null;
    /** ...but players may remember everything they saw: every completed trick, as this seat saw it. */
    tricks: SeenTrick[];
    /** Tricks won per team. */
    tricksWon: [number, number];
    /** Points per team from the cards this seat saw. The real totals are in `end` once the game is over. */
    visiblePoints: [number, number];
    /** Per seat: face-down cards they played that this seat never saw. */
    unseenFaceDown: number[];
  } | null;

  /** Spoilt Trumps calls so far this game, per seat (a call is public). */
  spoiltCalled: boolean[];
  /** Penalties handed out this game, settled when it ends. */
  penalties: Penalty[];
  /** How the game ended (full points included), once phase is 'over'. */
  end: GameEnd | null;
}

/**
 * A face-down card is visible to the player who played it, to everyone once
 * it's revealed as a trump, and to the trumper once the trick is finished
 * (the trumper inspects every folded card when resolving a round).
 */
function see(c: TrickCard, viewer: Seat, trumper: Seat | null, finished: boolean): SeenCard {
  const visible = !c.faceDown || c.revealed || c.seat === viewer || (finished && viewer === trumper);
  return { seat: c.seat, card: visible ? c.card : null, faceDown: c.faceDown, revealed: c.revealed };
}

export function viewFor(m: MatchState, seat: Seat): PlayerView {
  const g = m.game;
  const t = g.trump;
  const p = g.play;
  const actor = toAct(g);
  const trumper = t?.seat ?? null;
  const tricks: SeenTrick[] = (p?.tricks ?? []).map((tr) => {
    const cards = tr.cards.map((c) => see(c, seat, trumper, true));
    return {
      round: tr.round, leader: tr.leader, cards, winner: tr.winner, revealedTrump: tr.revealedTrump,
      visiblePoints: cards.reduce((n, c) => n + (c.card ? pointsOf(c.card) : 0), 0),
    };
  });
  const trick = (p?.trick ?? []).map((c) => see(c, seat, trumper, false));
  const tricksWon: [number, number] = [0, 0];
  const visiblePoints: [number, number] = [0, 0];
  const unseenFaceDown = [0, 0, 0, 0];
  for (const tr of tricks) {
    tricksWon[teamOf(tr.winner)] += 1;
    visiblePoints[teamOf(tr.winner)] += tr.visiblePoints;
    for (const c of tr.cards) if (c.card === null) unseenFaceDown[c.seat] += 1;
  }
  for (const c of trick) if (c.card === null) unseenFaceDown[c.seat] += 1;
  const legal = actor === seat ? legalActions(g) : [];
  const contract = g.bid8 ?? g.bid4;

  return {
    seat,
    gameNumber: g.number,
    dealer: g.dealer,
    priority: nextSeat(g.dealer),
    phase: g.phase,
    stone: [m.stone[0], m.stone[1]],
    matchWinner: m.winner,
    history: [...m.history.slice(0, g.phase === 'over' ? -1 : undefined)],
    rules: { ...g.rules },
    hand: [...g.hands[seat]],
    handCounts: g.hands.map((h) => h.length),
    toAct: actor,
    legal,
    legalIds: legal.map(encodeAction),
    bidding: {
      stage: g.bidding.stage, turn: g.bidding.turn, speaker: g.bidding.speaker,
      high: g.bidding.high, speeches: [...g.bidding.speeches],
    },
    auction: [...g.auction],
    bid4: g.bid4,
    bid8: g.bid8,
    contract,
    pccOut: g.pccOut,
    thresholds: contract && contract.value !== PCC && g.phase !== 'bid4' && g.phase !== 'bid8'
      ? [0, 1].map((team) => thresholdFor(contract.value, team === teamOf(contract.seat))) as [number, number]
      : null,
    trump: t && {
      seat: t.seat,
      open: t.open,
      declaredOpen: t.declaredOpen,
      suit: t.open || t.seat === seat ? t.suit : null,
      indicatorOnTable: t.indicator !== null,
      indicator: t.seat === seat ? t.indicator : null,
      folded: t.seat === seat || t.foldedPublic ? t.folded : null,
      revealedInRound: p?.tricks.find((tr) => tr.revealedTrump)?.round ?? null,
      shown: t.shown,
      mustLeadTrump: t.mustLeadTrump && (p?.round ?? 1) === 1,
    },
    play: p && {
      round: p.round, leader: p.leader, turn: p.turn,
      trick,
      ledSuit: p.trick.length ? suitOf(p.trick[0].card) : null,
      lastTrick: tricks.at(-1) ?? null,
      tricks, tricksWon, visiblePoints, unseenFaceDown,
    },
    spoiltCalled: [...g.spoiltCalled],
    penalties: [...g.penalties],
    end: g.end,
  };
}
