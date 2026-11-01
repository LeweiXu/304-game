// Turns a PlayerView into a fixed-length Float32 vector for a neural network.
//
// Everything is relative to the seat being encoded: "rel 0" is me, rel 1 is
// the player on my right (next to act after me), rel 2 my partner, rel 3 on my
// left. That way one network can play any seat.
//
// The encoder only reads the PlayerView, so it can never see hidden cards, and
// the same code can run in the browser when a trained model is deployed.
import { BID_VALUES, PACK, PCC, type Card, type PlayerView, type Seat } from '../../engine/src';

const CARD_INDEX = Object.fromEntries(PACK.map((c, i) => [c, i])) as Record<Card, number>;
/** Bid value slots: the 15 numeric bids, then PCC. */
const BID_INDEX = { ...Object.fromEntries(BID_VALUES.map((v, i) => [v, i])), [PCC]: BID_VALUES.length } as Record<number, number>;
const BID_SLOTS = BID_VALUES.length + 1; // 16
const PHASES = ['bid4', 'trump4', 'bid8', 'trump8', 'declare', 'show', 'play', 'over'] as const;
const SUIT_INDEX = { c: 0, d: 1, h: 2, s: 3 } as const;
/** Speeches kept per betting round. Real auctions are far shorter; if one ever runs longer, the latest are kept. */
export const AUCTION_SLOTS = 24;
const SPEECH_SIZE = 4 + 3 + BID_SLOTS + 1;
const TRICK_SIZE = 4 + 4 + 1 + 1 + 4 * 33;

/** Name, size and meaning of every block, in order. Offsets are computed below. */
const BLOCKS: [name: string, size: number, meaning: string][] = [
  ['hand', 32, 'my cards, one bit per card (PACK order)'],
  ['indicator', 32, 'my face-down trump card, if I am the trumper and it is still on the table'],
  ['phase', 8, 'one-hot: bid4, trump4, bid8, trump8, declare, show, play, over'],
  ['rules', 4, 'house-rule options in force: [caps, claim balance, claim threshold, slap shuffling]'],
  ['dealer', 4, 'dealer, one-hot by relative seat'],
  ['priority', 4, 'priority player (dealer\'s right: speaks first, leads round 1), relative seat'],
  ['to_act', 4, 'who is to act, one-hot by relative seat'],
  ['stone', 2, 'stone left for my team and the other team, divided by 10'],
  ['hand_counts', 4, 'cards in hand per relative seat, divided by 8'],
  ['bid_stage', 2, 'current betting round is the 4-card / 8-card one'],
  ['high_value', 17, 'current high bid in this betting round: one-hot over the 15 bid values then PCC, last slot = no bid'],
  ['high_seat', 4, 'holder of the current high bid, relative seat'],
  ['bid4_value', 17, 'winning 4-card bid, same encoding (last slot = none yet)'],
  ['bid4_seat', 4, 'winner of the 4-card bid, relative seat'],
  ['bid8_value', 17, 'winning 8-card bid, same encoding'],
  ['bid8_seat', 4, 'winner of the 8-card bid, relative seat'],
  ['pcc', 5, 'PCC: [partner sitting out, by relative seat (4), the contract is PCC]'],
  ['thresholds', 2, 'points my team / the other team needs to win the game, divided by 304 (zero before a contract and for PCC)'],
  ['speeches', 20, 'per relative seat: [has spoken this round, last speech was bid, pass, partner, none]'],
  ['speaking_for_partner', 1, 'I am bidding in my partner\'s seat after they said "partner"'],
  ['auction4', AUCTION_SLOTS * SPEECH_SIZE, `every 4-card speech in order, ${AUCTION_SLOTS} slots of [relative seat 4, bid/pass/partner 3, bid value 16 (15 numeric then PCC), spoke in partner's seat 1]; unused slots zero`],
  ['auction8', AUCTION_SLOTS * SPEECH_SIZE, 'every 8-card speech in order, same encoding'],
  ['trumper', 5, 'trumper by relative seat, last slot = none yet'],
  ['trump_suit', 5, 'trump suit if I know it (I am trumper or trump is open), last slot = unknown'],
  ['trump_flags', 4, '[trump is open, it was declared open (not revealed by a cut), the folded trump is still on the table, I am the trumper]'],
  ['folded_card', 32, 'which card the trumper folded, if I know it (I am the trumper, or it was flipped on a cut reveal or played face up)'],
  ['shown_card', 32, 'the trump card the trumper showed the table on an open declaration or for PCC'],
  ['round', 8, 'current round 1-8, one-hot (all zero outside play)'],
  ['leader', 4, 'leader of the current trick, relative seat'],
  ['led_suit', 4, 'suit led to the current trick (all zero before the lead)'],
  ['trick', 136, 'current trick, per relative seat: [played, played face down and hidden from me, card 32 bits]'],
  ['tricks', 8 * TRICK_SIZE, `every completed trick, slot r-1 for round r: [leader 4, winner 4, points I saw /304, trump revealed here 1, per relative seat: card 32 + face down and unseen 1]`],
  ['seen', 128, 'per relative seat: every card I have seen them play this game (a summary of the tricks block plus the current trick)'],
  ['hidden_counts', 4, 'per relative seat: face-down cards they played that I never saw, divided by 8'],
  ['tricks_won', 2, 'tricks won by my team / the other team, divided by 8'],
  ['points', 2, 'points I can see each team has won, divided by 304'],
  ['spoilt_called', 4, 'per relative seat: has called Spoilt Trumps this game'],
  ['penalties', 2, 'penalty stone pending against my team / the other team this game, divided by 4'],
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
  const bidSlot = (v: number | undefined) => (v === undefined ? BID_SLOTS : BID_INDEX[v]);
  const myTeam = me % 2;

  for (const c of view.hand) o[at('hand') + CARD_INDEX[c]] = 1;
  if (view.trump?.indicator) o[at('indicator') + CARD_INDEX[view.trump.indicator]] = 1;
  o[at('phase') + PHASES.indexOf(view.phase)] = 1;
  const r = view.rules;
  o[at('rules')] = r.caps ? 1 : 0;
  o[at('rules') + 1] = r.claimBalance ? 1 : 0;
  o[at('rules') + 2] = r.claimThreshold ? 1 : 0;
  o[at('rules') + 3] = r.shuffle === 'slap' ? 1 : 0;
  o[at('dealer') + rel(view.dealer)] = 1;
  o[at('priority') + rel(view.priority)] = 1;
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
  if (view.pccOut !== null) o[at('pcc') + rel(view.pccOut)] = 1;
  if (view.contract?.value === PCC) o[at('pcc') + 4] = 1;
  if (view.thresholds) {
    o[at('thresholds')] = view.thresholds[myTeam] / 304;
    o[at('thresholds') + 1] = view.thresholds[1 - myTeam] / 304;
  }
  const last: (string | null)[] = [null, null, null, null];
  for (const sp of b.speeches) last[rel(sp.seat)] = sp.action;
  for (let r = 0; r < 4; r++) {
    const k = at('speeches') + r * 5;
    o[k] = last[r] ? 1 : 0;
    o[k + 1 + (last[r] === 'bid' ? 0 : last[r] === 'pass' ? 1 : last[r] === 'partner' ? 2 : 3)] = 1;
  }
  if (b.speaker !== b.turn && b.speaker === me) o[at('speaking_for_partner')] = 1;
  for (const stage of [4, 8] as const) {
    const speeches = view.auction.filter((sp) => sp.stage === stage).slice(-AUCTION_SLOTS);
    speeches.forEach((sp, k) => {
      const q = at(stage === 4 ? 'auction4' : 'auction8') + k * SPEECH_SIZE;
      o[q + rel(sp.seat)] = 1;
      o[q + 4 + (sp.action === 'bid' ? 0 : sp.action === 'pass' ? 1 : 2)] = 1;
      if (sp.value !== undefined) o[q + 7 + BID_INDEX[sp.value]] = 1;
      if (sp.inSeat !== undefined) o[q + 7 + BID_SLOTS] = 1;
    });
  }

  const t = view.trump;
  o[at('trumper') + (t ? rel(t.seat) : 4)] = 1;
  o[at('trump_suit') + (t?.suit ? SUIT_INDEX[t.suit] : 4)] = 1;
  if (t) {
    o[at('trump_flags')] = t.open ? 1 : 0;
    o[at('trump_flags') + 1] = t.declaredOpen ? 1 : 0;
    o[at('trump_flags') + 2] = t.indicatorOnTable ? 1 : 0;
    o[at('trump_flags') + 3] = t.seat === me ? 1 : 0;
    if (t.folded) o[at('folded_card') + CARD_INDEX[t.folded]] = 1;
    if (t.shown) o[at('shown_card') + CARD_INDEX[t.shown]] = 1;
  }

  const p = view.play;
  if (p) {
    if (view.phase === 'play') o[at('round') + Math.min(p.round, 8) - 1] = 1;
    o[at('leader') + rel(p.leader)] = 1;
    if (p.ledSuit) o[at('led_suit') + SUIT_INDEX[p.ledSuit]] = 1;
    for (const c of p.trick) {
      const k = at('trick') + rel(c.seat) * 34;
      o[k] = 1;
      if (c.card === null) o[k + 1] = 1;
      else o[k + 2 + CARD_INDEX[c.card]] = 1;
    }
    for (const tr of p.tricks) {
      const q = at('tricks') + (tr.round - 1) * TRICK_SIZE;
      o[q + rel(tr.leader)] = 1;
      o[q + 4 + rel(tr.winner)] = 1;
      o[q + 8] = tr.visiblePoints / 304;
      o[q + 9] = tr.revealedTrump ? 1 : 0;
      for (const c of tr.cards) {
        const k = q + 10 + rel(c.seat) * 33;
        if (c.card === null) o[k + 32] = 1;
        else o[k + CARD_INDEX[c.card]] = 1;
      }
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
  for (let s = 0; s < 4; s++) if (view.spoiltCalled[s]) o[at('spoilt_called') + rel(s as Seat)] = 1;
  for (const pen of view.penalties) o[at('penalties') + (pen.seat % 2 === myTeam ? 0 : 1)] += pen.stone / 4;
  return o;
}
