// Names and wording for the table. The human always sits at seat 0.
import { PCC, type Card, type GameEnd, type Penalty, type Seat, type Speech, type Suit } from '@engine';

export const HUMAN: Seat = 0;

export const SEAT_NAMES: Record<Seat, string> = { 0: 'You', 1: 'East', 2: 'North', 3: 'West' };
/** Where each seat sits on screen, seen from seat 0. */
export const SEAT_POSITION: Record<Seat, 'bottom' | 'right' | 'top' | 'left'> = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' };

export const SUIT_SYMBOL: Record<Suit, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };
export const SUIT_NAME: Record<Suit, string> = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
export const isRed = (s: Suit) => s === 'd' || s === 'h';

const BID_NAMES: Record<number, string> = { 220: 'Honest', 225: 'Honest 5', 230: 'Honest 10', 235: 'Honest 15', 240: 'Honest 20', 245: 'Honest 25' };
/** "160", or "220 (Honest)". */
export const bidLabel = (v: number) => (v === PCC ? 'PCC' : BID_NAMES[v] ? `${v} (${BID_NAMES[v]})` : String(v));

export function speechLabel(s: Speech): string {
  if (s.action === 'bid') return s.value === PCC ? 'PCC' : String(s.value);
  if (s.action === 'partner') return 'Partner';
  return 'Pass';
}

export const teamName = (team: number) => (team === 0 ? 'You and North' : 'East and West');

export function endSummary(end: GameEnd): string {
  switch (end.kind) {
    case 'redeal': return `${SEAT_NAMES[end.seat]} asked for a redeal (under 15 points on 4 cards). Same dealer deals again.`;
    case 'passOn': return end.reason === 'noBids'
      ? 'Nobody bid, so the deal passes to the next dealer.'
      : `${SEAT_NAMES[end.seat]} passed on (under 25 points on 8 cards). The deal moves on.`;
    case 'absolute': return end.how === 'goodwill'
      ? `${SEAT_NAMES[end.seat]} declared an absolute hand (all eight trumps). Goodwill: the deal passes on, no stone changes hands.`
      : `${SEAT_NAMES[end.seat]} held all eight trumps, so the other side claims an absolute hand: the game becomes a pass-on.`;
    case 'spoilt': return `${SEAT_NAMES[end.seat]} called Spoilt Trumps correctly: the trumping team's opponents were dealt no trumps. The game is void.`;
    case 'played': {
      const who = teamName(end.bidTeam);
      if (end.pcc) {
        return end.made
          ? `${who} took all 8 rounds on PCC and gave away ${end.stone} stone.`
          : `${who} lost a round on PCC, so ${teamName(1 - end.bidTeam)} give away ${end.stone} stone.`;
      }
      const claim = end.claimedBy !== null ? `${SEAT_NAMES[end.claimedBy]} claimed the threshold. ` : '';
      return claim + (end.made
        ? `${who} made ${end.bid.value} with ${end.points[end.bidTeam]} points and gave away ${end.stone} stone.`
        : `${who} needed ${end.bid.value} but took ${end.points[end.bidTeam]}, so ${teamName(1 - end.bidTeam)} give away ${end.stone} stone.`);
    }
  }
}

export function penaltySummary(p: Penalty): string {
  return `${SEAT_NAMES[p.seat]} called Spoilt Trumps wrongly: ${teamName(1 - (p.seat % 2))} give away ${p.stone} stone.`;
}

export const cardLabel = (c: Card) => `${c.slice(0, -1)}${SUIT_SYMBOL[c.slice(-1) as Suit]}`;
