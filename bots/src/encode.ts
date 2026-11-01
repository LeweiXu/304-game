// Turns a PlayerView into a fixed-length Float32 vector for a neural network.
//
// Everything is relative to the seat being encoded: "rel 0" is me, rel 1 is
// the player on my right (next to act after me), rel 2 my partner, rel 3 on my
// left. That way one network can play any seat.
//
// The encoder only reads the PlayerView, so it can never see hidden cards, and
// the same code can run in the browser when a trained model is deployed.
import { BID_VALUES, PACK, type Card, type PlayerView, type Seat } from '../../engine/src';

const CARD_INDEX = Object.fromEntries(PACK.map((c, i) => [c, i])) as Record<Card, number>;
const BID_INDEX = Object.fromEntries(BID_VALUES.map((v, i) => [v, i])) as Record<number, number>;
const PHASES = ['bid4', 'trump4', 'bid8', 'trump8', 'declare', 'play', 'over'] as const;
const SUIT_INDEX = { c: 0, d: 1, h: 2, s: 3 } as const;

/** Name, size and meaning of every block, in order. Offsets are computed below. */
const BLOCKS: [name: string, size: number, meaning: string][] = [
  ['hand', 32, 'my cards, one bit per card (PACK order)'],
  ['indicator', 32, 'my face-down trump card, if I am the trumper and it is still on the table'],
  ['phase', 7, 'one-hot: bid4, trump4, bid8, trump8, declare, play, over'],
  ['dealer', 4, 'dealer, one-hot by relative seat'],
  ['to_act', 4, 'who is to act, one-hot by relative seat'],
  ['stone', 2, 'stone left for my team and the other team, divided by 10'],
  ['hand_counts', 4, 'cards in hand per relative seat, divided by 8'],
  ['bid_stage', 2, 'current betting round is the 4-card / 8-card one'],
  ['high_value', 16, 'current high bid in this betting round: one-hot over the 15 bid values, last slot = no bid'],
  ['high_seat', 4, 'holder of the current high bid, relative seat'],
  ['bid4_value', 16, 'winning 4-card bid, same encoding (last slot = none yet)'],
  ['bid4_seat', 4, 'winner of the 4-card bid, relative seat'],
  ['bid8_value', 16, 'winning 8-card bid, same encoding'],
  ['bid8_seat', 4, 'winner of the 8-card bid, relative seat'],
  ['speeches', 20, 'per relative seat: [has spoken this round, last speech was bid, pass, partner, none]'],
  ['speaking_for_partner', 1, 'I am bidding in my partner\'s seat after they said "partner"'],
  ['trumper', 5, 'trumper by relative seat, last slot = none yet'],
  ['trump_suit', 5, 'trump suit if I know it (I am trumper or trump is open), last slot = unknown'],
  ['trump_flags', 3, '[trump is open, the folded trump is still on the table, I am the trumper]'],
  ['round', 8, 'current round 1-8, one-hot (all zero outside play)'],
  ['leader', 4, 'leader of the current trick, relative seat'],
  ['trick', 136, 'current trick, per relative seat: [played, played face down and hidden from me, card 32 bits]'],
  ['seen', 128, 'per relative seat: every card I have seen them play this game (face up, revealed, or my own)'],
  ['hidden_counts', 4, 'per relative seat: face-down cards they played that I never saw, divided by 8'],
  ['tricks_won', 2, 'tricks won by my team / the other team, divided by 8'],
  ['points', 2, 'points I can see each team has won, divided by 304'],
];

export const OBS_LAYOUT: { name: string; offset: number; size: number; meaning: string }[] = [];
{
  let offset = 0;
  for (const [name, size, meaning] of BLOCKS) {
    OBS_LAYOUT.push({ name, offset, size, meaning });
    offset += size;
  }
}
export const OBS_SIZE = OBS_LAYOUT.reduce((n, b) => n + b.size, 0);
const AT = Object.fromEntries(OBS_LAYOUT.map((b) => [b.name, b.offset])) as Record<string, number>;

/** Writes the observation for `view.seat` into `out` at `base` (allocates if `out` is omitted). */
export function encodeView(view: PlayerView, out?: Float32Array, base = 0): Float32Array {
  const o = out ?? new Float32Array(OBS_SIZE);
  o.fill(0, base, base + OBS_SIZE);
  const me = view.seat;
  const rel = (s: Seat) => (s - me + 4) % 4;
  const at = (name: string) => base + AT[name];
  const bidSlot = (v: number | undefined) => (v === undefined ? 15 : BID_INDEX[v]);
  const myTeam = me % 2;

  for (const c of view.hand) o[at('hand') + CARD_INDEX[c]] = 1;
  if (view.trump?.indicator) o[at('indicator') + CARD_INDEX[view.trump.indicator]] = 1;
  o[at('phase') + PHASES.indexOf(view.phase)] = 1;
  o[at('dealer') + rel(view.dealer)] = 1;
  if (view.toAct !== null) o[at('to_act') + rel(view.toAct)] = 1;
  o[at('stone')] = view.stone[myTeam] / 10;
  o[at('stone') + 1] = view.stone[1 - myTeam] / 10;
  for (let s = 0; s < 4; s++) o[at('hand_counts') + rel(s as Seat)] = view.handCounts[s] / 8;

  const b = view.bidding;
  o[at('bid_stage') + (b.stage === 4 ? 0 : 1)] = 1;
  o[at('high_value') + bidSlot(b.high?.value)] = 1;
  if (b.high) o[at('high_seat') + rel(b.high.seat)] = 1;
  o[at('bid4_value') + bidSlot(view.bid4?.value)] = 1;
  if (view.bid4) o[at('bid4_seat') + rel(view.bid4.seat)] = 1;
  o[at('bid8_value') + bidSlot(view.bid8?.value)] = 1;
  if (view.bid8) o[at('bid8_seat') + rel(view.bid8.seat)] = 1;
  const last: (string | null)[] = [null, null, null, null];
  for (const sp of b.speeches) last[rel(sp.seat)] = sp.action;
  for (let r = 0; r < 4; r++) {
    const k = at('speeches') + r * 5;
    o[k] = last[r] ? 1 : 0;
    o[k + 1 + (last[r] === 'bid' ? 0 : last[r] === 'pass' ? 1 : last[r] === 'partner' ? 2 : 3)] = 1;
  }
  if (b.speaker !== b.turn && b.speaker === me) o[at('speaking_for_partner')] = 1;

  const t = view.trump;
  o[at('trumper') + (t ? rel(t.seat) : 4)] = 1;
  o[at('trump_suit') + (t?.suit ? SUIT_INDEX[t.suit] : 4)] = 1;
  if (t) {
    o[at('trump_flags')] = t.open ? 1 : 0;
    o[at('trump_flags') + 1] = t.indicatorOnTable ? 1 : 0;
    o[at('trump_flags') + 2] = t.seat === me ? 1 : 0;
  }

  const p = view.play;
  if (p) {
    if (view.phase === 'play') o[at('round') + Math.min(p.round, 8) - 1] = 1;
    o[at('leader') + rel(p.leader)] = 1;
    for (const c of p.trick) {
      const k = at('trick') + rel(c.seat) * 34;
      o[k] = 1;
      if (c.card === null) o[k + 1] = 1;
      else o[k + 2 + CARD_INDEX[c.card]] = 1;
    }
    for (const tr of p.tricks) {
      for (const c of tr.cards) {
        if (c.card !== null) o[at('seen') + rel(c.seat) * 32 + CARD_INDEX[c.card]] = 1;
        else o[at('hidden_counts') + rel(c.seat)] += 1 / 8;
      }
    }
    for (const c of p.trick) if (c.card !== null) o[at('seen') + rel(c.seat) * 32 + CARD_INDEX[c.card]] = 1;
    o[at('tricks_won')] = p.tricksWon[myTeam] / 8;
    o[at('tricks_won') + 1] = p.tricksWon[1 - myTeam] / 8;
    o[at('points')] = p.visiblePoints[myTeam] / 304;
    o[at('points') + 1] = p.visiblePoints[1 - myTeam] / 304;
  }
  return o;
}
