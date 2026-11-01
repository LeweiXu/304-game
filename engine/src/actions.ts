// A fixed numbering of every possible action, so a learning agent can treat
// the action space as 0..ACTION_COUNT-1 with a legal-action mask.
import { PACK, type Card } from './cards';
import { BID_VALUES } from './bidding';
import { legalActions } from './game';
import type { Action, GameState } from './types';

const SIMPLE = ['pass', 'partner', 'redeal', 'passOn'] as const;
const BID_BASE = 0;
const SIMPLE_BASE = BID_BASE + BID_VALUES.length;
const DECLARE_BASE = SIMPLE_BASE + SIMPLE.length;
const TRUMP_BASE = DECLARE_BASE + 2;
const PLAY_BASE = TRUMP_BASE + PACK.length;
export const ACTION_COUNT = PLAY_BASE + PACK.length;

// Lookup tables so encoding is a property read rather than a search.
const CARD_INDEX = Object.fromEntries(PACK.map((c, i) => [c, i])) as Record<Card, number>;
const BID_INDEX = Object.fromEntries(BID_VALUES.map((v, i) => [v, i])) as Record<number, number>;

export function encodeAction(a: Action): number {
  switch (a.type) {
    case 'bid': return BID_BASE + BID_INDEX[a.value];
    case 'pass':
    case 'partner':
    case 'redeal':
    case 'passOn': return SIMPLE_BASE + SIMPLE.indexOf(a.type);
    case 'declare': return DECLARE_BASE + (a.open ? 1 : 0);
    case 'trump': return TRUMP_BASE + CARD_INDEX[a.card];
    case 'play': return PLAY_BASE + CARD_INDEX[a.card];
  }
}

export function decodeAction(i: number): Action {
  if (i < SIMPLE_BASE) return { type: 'bid', value: BID_VALUES[i - BID_BASE] };
  if (i < DECLARE_BASE) return { type: SIMPLE[i - SIMPLE_BASE] };
  if (i < TRUMP_BASE) return { type: 'declare', open: i - DECLARE_BASE === 1 };
  if (i < PLAY_BASE) return { type: 'trump', card: PACK[i - TRUMP_BASE] as Card };
  if (i < ACTION_COUNT) return { type: 'play', card: PACK[i - PLAY_BASE] as Card };
  throw new Error(`No action ${i}`);
}

/** 1 where the action is legal for the player to move, else 0. Pass `out` to reuse a buffer. */
export function legalMask(g: GameState, out?: Uint8Array): Uint8Array {
  const mask = out ?? new Uint8Array(ACTION_COUNT);
  if (out) mask.fill(0);
  for (const a of legalActions(g)) mask[encodeAction(a)] = 1;
  return mask;
}
