// Building the deck for a deal.
//
// 'random' shuffles all 32 cards uniformly. 'slap' simulates the house way of
// shuffling (rules.md, Dealing): start from the order the cards were gathered
// in after the last game, do 1-3 slap shuffles (pull a packet from the middle,
// slap it on top), then the player on the dealer's left cuts once or declines.
// Light shuffling keeps clumps from the last game together, which is the point:
// it encourages bigger bids. After three redeals in a row from the same seat,
// one riffle shuffle breaks the clumps up (the riffle remedy).
import { PACK, type Card } from './cards';
import type { Rng } from './rng';
import type { GameState, RuleOptions } from './types';

export function buildDeck(rng: Rng, rules: RuleOptions, pile: Card[] | null, riffle: boolean): Card[] {
  if (rules.shuffle === 'random' || !pile || pile.length !== 32) return rng.shuffle(PACK);
  let deck = [...pile];
  if (riffle) deck = riffleShuffle(deck, rng);
  const slaps = [1, 2, 2, 3][rng.int(4)]; // two is typical
  for (let i = 0; i < slaps; i++) deck = slap(deck, rng);
  if (rng.int(4) !== 0) {
    // Cut: lift a chunk off the top and put the rest on it. One time in four, a tap (no cut).
    const at = 4 + rng.int(25);
    deck = [...deck.slice(at), ...deck.slice(0, at)];
  }
  return deck;
}

/** Pull a packet of 3-8 cards from the middle and slap it on top. */
function slap(deck: Card[], rng: Rng): Card[] {
  const size = 3 + rng.int(6);
  const start = 6 + rng.int(32 - 12 - size);
  return [...deck.slice(start, start + size), ...deck.slice(0, start), ...deck.slice(start + size)];
}

/** Split roughly in half and interleave in small runs. */
function riffleShuffle(deck: Card[], rng: Rng): Card[] {
  const cut = 13 + rng.int(7);
  const a = deck.slice(0, cut), b = deck.slice(cut), out: Card[] = [];
  while (a.length || b.length) {
    const from = !b.length || (a.length && rng.int(2) === 0) ? a : b;
    out.push(...from.splice(0, 1 + rng.int(2)));
  }
  return out;
}

/**
 * The order the cards are gathered in when a game ends: tricks in the order
 * they were won (each trick's cards in play order), then anything still in
 * hands (games that ended early, the PCC partner's hand) and the undealt stock.
 */
export function gatherPile(g: GameState): Card[] {
  const pile: Card[] = [];
  for (const tr of g.play?.tricks ?? []) for (const c of tr.cards) pile.push(c.card);
  for (const c of g.play?.trick ?? []) pile.push(c.card);
  for (const h of g.hands) pile.push(...h);
  if (g.trump?.indicator) pile.push(g.trump.indicator);
  pile.push(...g.stock);
  return pile;
}
