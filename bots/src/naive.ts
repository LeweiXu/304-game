// A simple rule-based bot. It only sees its own PlayerView and always picks
// one of view.legal, so it can't cheat or make an illegal move.
//
// Bidding: open with a decent 4-card hand, rarely compete, almost never bid on 8.
// Trump: longest suit, fold its weakest card.
// Play: win cheaply when it can, feed points to a winning partner, cut only
// when there are points worth taking, otherwise throw the cheapest card.
import {
  beats, handPoints, partnerOf, pointsOf, powerOf, rankOf, suitOf, teamOf,
  type Action, type Card, type PlayerView, type Rng, type Suit,
} from '../../engine/src';

export function naiveBot(v: PlayerView, rng: Rng): Action {
  if (!v.legal.length) throw new Error('naiveBot called when it is not its turn');
  switch (v.phase) {
    case 'bid4': return bid4(v, rng);
    case 'bid8': return bid8(v);
    case 'trump4':
    case 'trump8': return { type: 'trump', card: chooseTrumpCard(v.hand) };
    case 'declare': return { type: 'declare', open: false };
    case 'play': return { type: 'play', card: chooseCard(v) };
    default: return v.legal[0];
  }
}

const has = (v: PlayerView, type: Action['type']) => v.legal.some((a) => a.type === type);
const lowestBid = (v: PlayerView): Action | null =>
  v.legal.filter((a): a is { type: 'bid'; value: number } => a.type === 'bid').sort((a, b) => a.value - b.value)[0] ?? null;

function suitGroups(hand: readonly Card[]) {
  const groups = new Map<Suit, Card[]>();
  for (const c of hand) groups.set(suitOf(c), [...(groups.get(suitOf(c)) ?? []), c]);
  return [...groups.entries()].map(([suit, cards]) => ({ suit, cards, points: handPoints(cards) }));
}

function strength(hand: readonly Card[]): number {
  const best = suitGroups(hand).sort((a, b) => b.cards.length - a.cards.length || b.points - a.points)[0];
  let score = handPoints(hand);
  if (best.cards.length >= 2) score += 10;
  if (best.cards.some((c) => rankOf(c) === 'J')) score += 10;
  return score;
}

function bid4(v: PlayerView, rng: Rng): Action {
  if (has(v, 'redeal')) return { type: 'redeal' };
  const high = v.bidding.high;
  if (high && teamOf(high.seat) === teamOf(v.seat)) return { type: 'pass' };
  const bid = lowestBid(v);
  if (!bid || bid.type !== 'bid') return { type: 'pass' };
  const score = strength(v.hand) + rng.int(11) - 5; // a little variety
  if (!high && score >= 50) return bid;
  if (high && score >= 70 && bid.value <= 180) return bid;
  return { type: 'pass' };
}

function bid8(v: PlayerView): Action {
  const bidTeam = v.bid4 ? teamOf(v.bid4.seat) : null;
  const ours = bidTeam === teamOf(v.seat);
  if (!ours && has(v, 'passOn')) return { type: 'passOn' };
  const bid = lowestBid(v);
  const long = suitGroups(v.hand).some((g) => g.cards.length >= 4 && g.cards.some((c) => rankOf(c) === 'J'));
  if (!ours && bid && handPoints(v.hand) >= 110 && long) return bid;
  return { type: 'pass' };
}

function chooseTrumpCard(hand: readonly Card[]): Card {
  const best = suitGroups(hand).sort((a, b) => b.cards.length - a.cards.length || b.points - a.points)[0];
  return weakest(best.cards);
}

/** Cheapest card: fewest points, then lowest rank. */
const cheapKey = (c: Card) => pointsOf(c) * 10 - powerOf(c);
const cheapest = (cards: readonly Card[]) => [...cards].sort((a, b) => cheapKey(a) - cheapKey(b))[0];
const priciest = (cards: readonly Card[]) => [...cards].sort((a, b) => cheapKey(b) - cheapKey(a))[0];
const weakest = (cards: readonly Card[]) => [...cards].sort((a, b) => powerOf(b) - powerOf(a))[0];

function chooseCard(v: PlayerView): Card {
  const p = v.play!;
  const legal = v.legal.flatMap((a) => (a.type === 'play' ? [a.card] : []));
  if (legal.length === 1) return legal[0];
  const trump = v.trump?.suit ?? null;
  const knownTrump = v.trump?.open ? trump : null; // what counts as trump for everyone right now
  const indicator = v.trump?.indicator ?? null;

  // Leading: cash a Jack if we have one, otherwise lead cheap.
  if (p.trick.length === 0) {
    const jacks = legal.filter((c) => rankOf(c) === 'J' && c !== indicator);
    return jacks.length ? jacks[0] : cheapest(legal);
  }

  const visible = p.trick.filter((c) => c.card !== null) as { seat: PlayerView['seat']; card: Card }[];
  const led = suitOf(p.trick[0].card!);
  let best = visible[0];
  for (const c of visible) if (beats(c.card, best.card, led, knownTrump)) best = c;
  const partnerWinning = best.seat === partnerOf(v.seat);
  const trickPoints = visible.reduce((n, c) => n + pointsOf(c.card), 0);
  const following = legal.every((c) => suitOf(c) === led) && legal.some((c) => c !== indicator);

  if (following) {
    if (partnerWinning) return powerOf(best.card) === 0 ? priciest(legal) : cheapest(legal);
    const winners = legal.filter((c) => beats(c, best.card, led, knownTrump));
    return winners.length ? cheapest(winners) : cheapest(legal);
  }

  // Can't follow suit.
  const worthIt = !partnerWinning && trickPoints >= 10;
  if (indicator && legal.includes(indicator)) {
    if (worthIt) return indicator; // cut with the folded trump
    const minus = legal.filter((c) => c !== indicator);
    return minus.length ? cheapest(minus) : indicator;
  }
  if (knownTrump) {
    const cutters = legal.filter((c) => suitOf(c) === knownTrump && beats(c, best.card, led, knownTrump));
    if (worthIt && cutters.length) return cheapest(cutters);
    const discards = legal.filter((c) => suitOf(c) !== knownTrump);
    return cheapest(discards.length ? discards : legal);
  }
  // Closed trump and we don't know the suit: just minus something cheap.
  const discards = trump ? legal.filter((c) => suitOf(c) !== trump) : legal;
  return cheapest(discards.length ? discards : legal);
}
