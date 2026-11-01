// Trick play, including closed-trump face-down rules (§T-1 to §T-6),
// folded-card resolution and exhausted trumps. Works on a draft GameState.
import { pointsOf, suitOf, winningIndex, type Card, type Suit } from './cards';
import { nextSeat, SEATS, teamOf, type Seat } from './seats';
import type { GameState, PlayState, TrickCard } from './types';

export interface PlayOption { card: Card; faceDown: boolean }

export function newPlay(g: GameState): PlayState {
  // Priority leads round 1, except in PCC, where the trumper does.
  const first = g.pccOut !== null ? g.trump!.seat : nextSeat(g.dealer);
  return { round: 1, leader: first, turn: first, trick: [], tricks: [], points: [0, 0] };
}

/** The next player to act after `s`, skipping a PCC partner who sits out. */
export function nextActive(g: GameState, s: Seat): Seat {
  const n = nextSeat(s);
  return n === g.pccOut ? nextSeat(n) : n;
}

/** Cards in a full trick: 4, or 3 in PCC. */
export const trickSize = (g: GameState) => (g.pccOut === null ? 4 : 3);

/**
 * Points per team from the cards `viewer` has seen (their own and face-up cards,
 * revealed trumps, and every folded card once a trick is over if they're the
 * trumper). Matches PlayerView.play.visiblePoints.
 */
export function pointsSeenBy(g: GameState, viewer: Seat): [number, number] {
  const out: [number, number] = [0, 0];
  const trumper = g.trump?.seat;
  for (const tr of g.play?.tricks ?? []) {
    for (const c of tr.cards) {
      if (!c.faceDown || c.revealed || c.seat === viewer || viewer === trumper) out[teamOf(tr.winner)] += pointsOf(c.card);
    }
  }
  return out;
}

export const ledSuit = (trick: readonly TrickCard[]): Suit | null => (trick.length ? suitOf(trick[0].card) : null);

/** Every card the player to move may play, and whether it goes face down. */
export function playOptions(g: GameState): PlayOption[] {
  const p = g.play!, t = g.trump!;
  const seat = p.turn;
  const hand = g.hands[seat];
  const isTrumper = seat === t.seat;
  const indicator = isTrumper ? t.indicator : null;
  const up = (cards: readonly Card[]) => cards.map((card) => ({ card, faceDown: false }));
  const down = (cards: readonly Card[]) => cards.map((card) => ({ card, faceDown: true }));

  // §T-2: the folded trump can be played as the trumper's last card in round 8.
  if (hand.length === 0 && indicator) return up([indicator]);

  const trumps = hand.filter((c) => suitOf(c) === t.suit);
  const nonTrumps = hand.filter((c) => suitOf(c) !== t.suit);

  if (p.trick.length === 0) {
    if (t.open) {
      if (t.mustLeadTrump && p.round === 1 && trumps.length) return up(trumps);
      if (isTrumper && g.pccOut === null && trumpsExhausted(g) && trumps.length) return up(trumps); // not in PCC
    } else if (isTrumper && p.round === 1 && nonTrumps.length) {
      return up(nonTrumps); // §T-1: no trump lead from priority in round 1 of closed trump
    }
    return up(hand);
  }

  const led = ledSuit(p.trick)!;
  const follow = hand.filter((c) => suitOf(c) === led); // the folded trump doesn't count (§T-5, §T-6)
  if (follow.length) return up(follow);
  if (t.open) return up(hand);

  // Closed trump and void in the led suit: the card goes face down.
  if (!isTrumper) return down(hand);
  const cut = indicator && led !== t.suit ? [indicator] : []; // §T-2, §T-6
  const options = [...down(cut), ...down(nonTrumps)]; // §T-3 cut or minus, §T-4 no folding in-hand trumps
  return options.length ? options : up(hand);
}

/**
 * Exhausted trumps: the trumper led trump last round and nobody else could
 * answer it, so while they hold trump they have to keep leading it.
 */
function trumpsExhausted(g: GameState): boolean {
  const p = g.play!, t = g.trump!;
  const last = p.tricks.at(-1);
  if (!last || last.leader !== t.seat || suitOf(last.cards[0].card) !== t.suit) return false;
  return SEATS.every((s) => s === t.seat || s === g.pccOut || !g.hands[s].some((c) => suitOf(c) === t.suit));
}

/** Plays a card for the player to move. Returns true when the game's play is over (8 tricks, or a lost PCC). */
export function applyPlay(g: GameState, card: Card): boolean {
  const p = g.play!, t = g.trump!;
  const option = playOptions(g).find((o) => o.card === card);
  if (!option) throw new Error(`Illegal play ${card} by seat ${p.turn}`);
  const seat = p.turn;

  if (seat === t.seat && card === t.indicator) {
    t.indicator = null;
    if (!option.faceDown) { t.open = true; t.foldedPublic = true; } // played face up as the last card: a reveal
  } else {
    g.hands[seat] = g.hands[seat].filter((c) => c !== card);
  }
  p.trick.push({ seat, card, faceDown: option.faceDown, revealed: false });

  if (p.trick.length < trickSize(g)) {
    p.turn = nextActive(g, seat);
    return false;
  }
  resolveTrick(g);
  if (g.pccOut !== null && teamOf(p.tricks.at(-1)!.winner) !== teamOf(t.seat)) return true; // PCC lost: no need to play on
  return p.round > 8;
}

function resolveTrick(g: GameState) {
  const p = g.play!, t = g.trump!;
  let revealedTrump = false;

  // Folded cards: if any is a trump, all folded trumps are shown and trump is open.
  const foldedTrumps = p.trick.filter((c) => c.faceDown && suitOf(c.card) === t.suit);
  if (foldedTrumps.length && !t.open) {
    revealedTrump = true;
    t.open = true;
    t.foldedPublic = true; // the folded card is flipped face up for everyone
    if (t.indicator) {
      g.hands[t.seat].push(t.indicator); // shown, then picked up into the trumper's hand
      t.indicator = null;
    }
  }
  for (const c of foldedTrumps) c.revealed = true;
  t.mustLeadTrump = false;

  // Face-down non-trumps are never the led suit, so they can't win.
  const led = suitOf(p.trick[0].card);
  const winner = p.trick[winningIndex(p.trick.map((c) => c.card), led, t.suit)].seat;
  const points = p.trick.reduce((n, c) => n + pointsOf(c.card), 0);
  p.points[teamOf(winner)] += points;
  p.tricks.push({ round: p.round, leader: p.leader, cards: p.trick, winner, points, revealedTrump });

  p.round += 1;
  p.trick = [];
  p.leader = winner;
  p.turn = winner;
}
