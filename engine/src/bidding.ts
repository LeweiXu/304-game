// Betting on 4 and 8 cards. Rule numbers refer to public/rules.md.
// Functions here work on a draft GameState that game.ts has already copied.
import { handPoints } from './cards';
import { nextSeat, partnerOf, type Seat } from './seats';
import type { Action, Bidding, GameState } from './types';

export const MIN_BID_4 = 160;
export const MIN_BID_8 = 220; // "Honest" (house rule)
export const MAX_BID = 250; // only PCC goes higher, and PCC isn't implemented yet
const FIRST_SPEECH_LIMIT = { 4: 200, 8: 250 } as const;
const REDEAL_UNDER = 15;
const PASS_ON_8_UNDER = 25;

/** Every bid value that exists: 160-190 in tens, then 200-250 in fives. */
export const BID_VALUES: readonly number[] = [160, 170, 180, 190, ...Array.from({ length: 11 }, (_, i) => 200 + i * 5)];

export function newBidding(stage: 4 | 8, dealer: Seat): Bidding {
  const first = nextSeat(dealer); // betting starts to the dealer's right, both rounds
  return {
    stage,
    turn: first,
    speaker: first,
    high: null,
    spoken: [false, false, false, false],
    passes: 0,
    skipOnce: [false, false, false, false],
    partneredBy: null,
    speeches: [],
  };
}

/** Legal bid values for whoever is speaking now. */
export function legalBidValues(g: GameState): number[] {
  const b = g.bidding;
  const s = b.speaker;
  const firstSpeech = !b.spoken[s];
  const partnerHolds = b.high !== null && b.high.seat === partnerOf(s);
  // §B-6/7 (4 cards) and §B-8/9 (8 cards): low bids only on your first speech,
  // and never to undercut your own partner.
  const floor = firstSpeech && !partnerHolds ? 0 : FIRST_SPEECH_LIMIT[b.stage];
  let above = b.high?.value ?? 0;
  if (b.stage === 8 && g.bid4 && g.bid4.value >= MIN_BID_8) above = Math.max(above, g.bid4.value);
  const min = b.stage === 4 ? MIN_BID_4 : MIN_BID_8;
  return BID_VALUES.filter((v) => v >= min && v > above && v >= floor);
}

export function legalBiddingActions(g: GameState): Action[] {
  const b = g.bidding;
  const s = b.speaker;
  const out: Action[] = legalBidValues(g).map((value) => ({ type: 'bid', value }));
  out.push({ type: 'pass' });

  const speakingForPartner = s !== b.turn;
  if (b.stage === 4 && !speakingForPartner && !b.spoken[s] && !b.spoken[partnerOf(s)]) {
    // Partnering: only the player to the dealer's right or across from the dealer,
    // on their first speech. No partner-back (the partner speaks for them instead).
    if (s === nextSeat(g.dealer) || s === nextSeat(g.dealer, 2)) out.push({ type: 'partner' });
  }
  if (b.stage === 4 && canRedeal(g, s)) out.push({ type: 'redeal' });
  if (b.stage === 8 && !b.spoken[s] && handPoints(g.hands[s]) < PASS_ON_8_UNDER) out.push({ type: 'passOn' });
  return out;
}

/** Priority player (or their partner, if priority partnered to them) holding under 15. */
function canRedeal(g: GameState, s: Seat): boolean {
  const priority = nextSeat(g.dealer);
  const eligible = s === priority || (g.bidding.partneredBy === priority && s === partnerOf(priority));
  return eligible && handPoints(g.hands[s]) < REDEAL_UNDER;
}

/** Applies a bet, pass or partner call. Returns true once bidding is over. */
export function applySpeech(g: GameState, action: Action): boolean {
  const b = g.bidding;
  const s = b.speaker;
  const inSeat = s !== b.turn ? b.turn : undefined;

  if (action.type === 'partner') {
    b.speeches.push({ seat: s, action: 'partner' });
    b.spoken[s] = true;
    b.partneredBy = s;
    b.speaker = partnerOf(s); // partner speaks right now, in s's seat
    b.skipOnce[partnerOf(s)] = true; // §B-1
    return false;
  }

  if (action.type === 'bid') {
    b.high = { seat: s, value: action.value };
    b.passes = 0; // §B-5
    b.speeches.push({ seat: s, action: 'bid', value: action.value, inSeat });
  } else {
    b.passes += 1;
    b.speeches.push({ seat: s, action: 'pass', inSeat });
  }
  b.spoken[s] = true;

  // §B-4: everyone has had a first speech and three passes in a row since the last bid.
  if (b.spoken.every(Boolean) && b.passes >= 3) return true;

  // Move on from the seat whose turn it was, skipping silently (§B-3).
  let next = nextSeat(b.turn);
  for (let i = 0; i < 4; i++) {
    if (b.skipOnce[next]) { b.skipOnce[next] = false; next = nextSeat(next); continue; } // §B-1
    if (b.high?.seat === next) { next = nextSeat(next); continue; } // §B-2
    break;
  }
  b.turn = next;
  b.speaker = next;
  return false;
}
