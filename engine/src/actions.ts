// A fixed numbering of every possible action, so a learning agent can treat
// the action space as 0..ACTION_COUNT-1 with a legal-action mask.
//
//   0-14    bid 160 ... 250 (BID_VALUES order)
//   15      pcc
//   16-19   pass, partner, redeal, passOn
//   20-21   declare closed, declare open
//   22-24   absolute, spoilt, claim
//   25-56   trump <card>   (PACK order)
//   57-88   show <card>
//   89-120  play <card>
import { PACK, type Card } from './cards';
import { BID_VALUES } from './bidding';
import { legalActions } from './game';
import type { Action, GameState } from './types';

const SIMPLE = ['pass', 'partner', 'redeal', 'passOn'] as const;
const CALLS = ['absolute', 'spoilt', 'claim'] as const;
const BID_BASE = 0;
const PCC_ID = BID_BASE + BID_VALUES.length;
const SIMPLE_BASE = PCC_ID + 1;
const DECLARE_BASE = SIMPLE_BASE + SIMPLE.length;
const CALL_BASE = DECLARE_BASE + 2;
const TRUMP_BASE = CALL_BASE + CALLS.length;
const SHOW_BASE = TRUMP_BASE + PACK.length;
const PLAY_BASE = SHOW_BASE + PACK.length;
export const ACTION_COUNT = PLAY_BASE + PACK.length;

// Lookup tables so encoding is a property read rather than a search.
const CARD_INDEX = Object.fromEntries(PACK.map((c, i) => [c, i])) as Record<Card, number>;
const BID_INDEX = Object.fromEntries(BID_VALUES.map((v, i) => [v, i])) as Record<number, number>;

export function encodeAction(a: Action): number {
  switch (a.type) {
    case 'bid': return BID_BASE + BID_INDEX[a.value];
    case 'pcc': return PCC_ID;
    case 'pass':
    case 'partner':
    case 'redeal':
    case 'passOn': return SIMPLE_BASE + SIMPLE.indexOf(a.type);
    case 'declare': return DECLARE_BASE + (a.open ? 1 : 0);
    case 'absolute':
    case 'spoilt':
    case 'claim': return CALL_BASE + CALLS.indexOf(a.type);
    case 'trump': return TRUMP_BASE + CARD_INDEX[a.card];
    case 'show': return SHOW_BASE + CARD_INDEX[a.card];
    case 'play': return PLAY_BASE + CARD_INDEX[a.card];
  }
}

export function decodeAction(i: number): Action {
  if (i < PCC_ID) return { type: 'bid', value: BID_VALUES[i - BID_BASE] };
  if (i === PCC_ID) return { type: 'pcc' };
  if (i < DECLARE_BASE) return { type: SIMPLE[i - SIMPLE_BASE] };
  if (i < CALL_BASE) return { type: 'declare', open: i - DECLARE_BASE === 1 };
  if (i < TRUMP_BASE) return { type: CALLS[i - CALL_BASE] };
  if (i < SHOW_BASE) return { type: 'trump', card: PACK[i - TRUMP_BASE] as Card };
  if (i < PLAY_BASE) return { type: 'show', card: PACK[i - SHOW_BASE] as Card };
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
