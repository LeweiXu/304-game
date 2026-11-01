// Cards are plain strings like 'Jc', '10h', '7s': cheap to compare, copy,
// store in sets and send over the wire.

export type Suit = 'c' | 'd' | 'h' | 's';
export type Rank = 'J' | '9' | 'A' | '10' | 'K' | 'Q' | '8' | '7';
export type Card = `${Rank}${Suit}`;

export const SUITS: readonly Suit[] = ['c', 'd', 'h', 's'];
/** Highest first. Same order in every suit. */
export const RANKS: readonly Rank[] = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'];

const POINTS: Record<Rank, number> = { J: 30, '9': 20, A: 11, '10': 10, K: 3, Q: 2, '8': 0, '7': 0 };

export const PACK: readonly Card[] = SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}` as Card));

export const rankOf = (c: Card): Rank => c.slice(0, -1) as Rank;
export const suitOf = (c: Card): Suit => c[c.length - 1] as Suit;
/** 0 is the strongest (J), 7 the weakest (7). */
export const powerOf = (c: Card): number => RANKS.indexOf(rankOf(c));
export const pointsOf = (c: Card): number => POINTS[rankOf(c)];
export const handPoints = (cards: readonly Card[]): number => cards.reduce((n, c) => n + pointsOf(c), 0);

/** Does `a` beat `b`, given the led suit and the trump suit (null if no trump counts)? */
export function beats(a: Card, b: Card, led: Suit, trump: Suit | null): boolean {
  const at = suitOf(a) === trump, bt = suitOf(b) === trump;
  if (at !== bt) return at;
  if (at) return powerOf(a) < powerOf(b);
  const al = suitOf(a) === led, bl = suitOf(b) === led;
  if (al !== bl) return al;
  return al && powerOf(a) < powerOf(b);
}

/** Index of the winning card among `cards`. */
export function winningIndex(cards: readonly Card[], led: Suit, trump: Suit | null): number {
  let best = 0;
  for (let i = 1; i < cards.length; i++) if (beats(cards[i], cards[best], led, trump)) best = i;
  return best;
}

/** Display order: by suit, then strongest first. */
export function sortHand(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b)) || powerOf(a) - powerOf(b));
}
