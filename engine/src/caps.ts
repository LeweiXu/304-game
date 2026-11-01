// The caps / claim-balance solver.
//
// Question (rules.md, Caps > Precise definition): it's `view.seat`'s turn. Is
// there a fixed order of all their remaining cards such that, in every deal of
// the unseen cards consistent with what they know, and for every legal play by
// the other players (partner included), playing that order wins every remaining
// round for their team?
//
// How: the other players' cards are not dealt up front. Whenever another player
// plays, the search picks the card from the pool of cards this seat hasn't seen,
// as long as the rest of the pool can still be dealt consistently (hand sizes,
// known voids, hidden face-down cards, the trumper's folded card). That checks a
// tiny flow problem (4 suits into a handful of "slots"). With the order fixed,
// this seat makes no choices, so "every deal and every play" becomes one
// depth-first search for a single losing line. Unseen cards that no known card
// separates in rank behave identically, so only the highest and lowest of each
// such run are tried.
//
// A search can be capped with a node budget; running out returns 'unknown'.
import { PACK, SUITS, type Card, type Suit } from './cards';
import { nextSeat, teamOf, type Seat } from './seats';
import type { PlayerView } from './view';

const SUIT_INDEX: Record<Suit, number> = { c: 0, d: 1, h: 2, s: 3 };
/** Card index = suit * 8 + power (0 = J, the strongest). Matches PACK order. */
const idx = (c: Card) => PACK.indexOf(c);
const suitOfI = (i: number) => i >> 3;
const powerOfI = (i: number) => i & 7;
const ALL_SUITS = 15;

class OutOfBudget extends Error {}

/** Everything the solver needs, taken from one seat's view. */
interface Info {
  me: Seat;
  team: number;
  /** Seats in play order that take part (a PCC partner sits out). */
  active: Seat[];
  mine: number[];
  /** My folded trump card while it's on the table (I'm the trumper). */
  myIndicator: number | null;
  trumper: Seat;
  trumpKnown: number | null;
  open: boolean;
  mustLeadTrump: boolean;
  round: number;
  /** The last completed trick was led by the trumper with a trump (exhausted-trumps rule). */
  lastTrumperTrumpLead: boolean;
  trick: { seat: Seat; card: number }[];
  leader: Seat;
  pool: number[];
  /** Cards other players are known to hold (the trumper's shown / flipped folded card). */
  knownHeld: Map<Seat, number[]>;
  handCap: Map<Seat, number>;
  foldedCap: number;
  voids: Map<Seat, number>;
  /** Led suits of tricks in which someone played a card face down that I never saw. */
  hiddenLed: number[];
}

function readView(v: PlayerView): Info | null {
  const p = v.play, t = v.trump;
  if (!p || !t || v.phase !== 'play' || v.toAct !== v.seat) return null;
  const me = v.seat;
  const active = [0, 1, 2, 3].filter((s) => s !== v.pccOut) as Seat[];
  const seen = new Set<number>();
  const mine = v.hand.map(idx);
  const myIndicator = t.seat === me && t.indicator ? idx(t.indicator) : null;
  if (myIndicator !== null) mine.push(myIndicator);
  mine.forEach((c) => seen.add(c));

  const voids = new Map<Seat, number>(active.map((s) => [s, 0]));
  const hiddenLed: number[] = [];
  const allTricks = [...p.tricks.map((tr) => tr.cards), p.trick];
  for (const [ti, cards] of allTricks.entries()) {
    if (!cards.length) continue;
    const led = suitOfI(idx(cards[0].card!));
    const finished = ti < p.tricks.length;
    for (const c of cards) {
      if (c.card) seen.add(idx(c.card));
      if (c.seat === me) continue;
      if (c.card === null) {
        // Finished tricks: an unseen face-down card is a non-trump (trumps get revealed). The trick in
        // progress: it could still be a cut, so the search chooses it.
        if (finished) hiddenLed.push(led);
        voids.set(c.seat, voids.get(c.seat)! | (1 << led));
      } else if (suitOfI(idx(c.card)) !== led) {
        voids.set(c.seat, voids.get(c.seat)! | (1 << led));
      }
    }
  }
  // The trumper's in-hand void in trump doesn't stop them holding the folded card (handled as its own slot).

  const knownHeld = new Map<Seat, number[]>();
  if (t.seat !== me) {
    const held: number[] = [];
    for (const c of [t.shown, t.indicatorOnTable ? null : t.folded]) {
      if (c && !seen.has(idx(c)) && !held.includes(idx(c))) held.push(idx(c));
    }
    held.forEach((c) => seen.add(c));
    if (held.length) knownHeld.set(t.seat, held);
  }

  const handCap = new Map<Seat, number>();
  for (const s of active) if (s !== me) handCap.set(s, v.handCounts[s] - (knownHeld.get(s)?.length ?? 0));
  const foldedCap = t.seat !== me && t.indicatorOnTable ? 1 : 0;
  const pool: number[] = [];
  for (let i = 0; i < 32; i++) if (!seen.has(i)) pool.push(i);

  const last = p.tricks.at(-1);
  return {
    me, team: teamOf(me), active, mine, myIndicator,
    trumper: t.seat,
    trumpKnown: t.suit ? SUIT_INDEX[t.suit] : null,
    open: t.open,
    mustLeadTrump: t.mustLeadTrump,
    round: p.round,
    lastTrumperTrumpLead: !!last && last.leader === t.seat && t.suit !== null && last.cards[0].card!.endsWith(t.suit),
    trick: p.trick.map((c) => ({ seat: c.seat, card: c.card ? idx(c.card) : -1 })),
    leader: p.leader,
    pool, knownHeld, handCap, foldedCap, voids, hiddenLed,
  };
}

// ---------------------------------------------------------------------------
// Consistency: can the remaining pool still be dealt into the slots?
// ---------------------------------------------------------------------------

/** Max flow from 4 suits into slots (cap, allowed-suit mask). True if every pool card fits. */
function feasible(suitCounts: number[], slots: [number, number][]): boolean {
  const total = suitCounts[0] + suitCounts[1] + suitCounts[2] + suitCounts[3];
  let capTotal = 0;
  for (const [cap] of slots) capTotal += cap;
  if (capTotal !== total) return false;
  // Tiny graph: source -> suits -> slots -> sink. Augmenting paths by DFS.
  const n = slots.length;
  const flow = slots.map(() => [0, 0, 0, 0]);
  const used = slots.map(() => 0);
  const left = [...suitCounts];
  const augment = (suit: number, seen: boolean[]): boolean => {
    for (let j = 0; j < n; j++) {
      if (seen[j] || !(slots[j][1] & (1 << suit))) continue;
      seen[j] = true;
      if (used[j] < slots[j][0]) { used[j]++; flow[j][suit]++; return true; }
      for (let s2 = 0; s2 < 4; s2++) {
        if (flow[j][s2] > 0 && s2 !== suit && augment(s2, seen)) { flow[j][s2]--; flow[j][suit]++; return true; }
      }
    }
    return false;
  };
  for (let s = 0; s < 4; s++) {
    while (left[s] > 0) {
      if (!augment(s, new Array(n).fill(false))) return false;
      left[s]--;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------

interface State {
  pool: number; // bitmask of unseen cards still unplaced
  handCap: Map<Seat, number>;
  foldedCap: number;
  voids: Map<Seat, number>;
  knownHeld: Map<Seat, number[]>;
  trick: { seat: Seat; card: number; down: boolean }[];
  /** Unseen face-down cards in the trick in progress not yet chosen by the search. */
  pending: number;
  leader: Seat;
  open: boolean;
  myIndicatorDown: boolean;
  myIdx: number;
  myLeft: number; // bitmask of my unplayed cards
  round: number;
  lastTrumperTrumpLead: boolean;
}

class Search {
  private nodes = 0;
  private memo = new Set<string>();
  constructor(private info: Info, private trump: number, private budget: number) {}

  /** True if some consistent deal and legal play beats `order` (using only its first `prefix` cards). */
  fails(order: number[], prefix: number): boolean {
    this.memo.clear();
    const i = this.info;
    let pool = 0;
    for (const c of i.pool) pool |= 1 << c;
    let myLeft = 0;
    for (const c of i.mine) myLeft |= 1 << c;
    const st: State = {
      pool: pool >>> 0,
      handCap: new Map(i.handCap),
      foldedCap: i.foldedCap,
      voids: new Map(i.voids),
      knownHeld: new Map([...i.knownHeld].map(([s, cs]) => [s, [...cs]])),
      trick: i.trick.map((c) => ({ seat: c.seat, card: c.card, down: c.card < 0 })),
      pending: i.trick.filter((c) => c.card < 0).length,
      leader: i.leader,
      open: i.open,
      myIndicatorDown: i.myIndicator !== null,
      myIdx: 0,
      myLeft: myLeft >>> 0,
      round: i.round,
      lastTrumperTrumpLead: i.lastTrumperTrumpLead,
    };
    if (!this.consistent(st)) return false; // this trump suit is impossible from what I know: no world to lose in
    return this.fillHidden(st, 0, order, prefix);
  }

  /** Face-down cards in the trick in progress that I haven't seen: the adversary picks them first. */
  private fillHidden(st: State, from: number, order: number[], prefix: number): boolean {
    const k = st.trick.findIndex((c, j) => j >= from && c.card < 0);
    if (k < 0) return this.dfs(st, order, prefix);
    const entry = st.trick[k];
    const led = suitOfI(st.trick[0].card);
    const T = this.trump;
    // A trumper whose folded card is still on the table can only have folded a non-trump (§T-4).
    const noTrump = entry.seat === this.info.trumper && st.foldedCap > 0;
    for (let suit = 0; suit < 4; suit++) {
      if (suit === led || (noTrump && suit === T)) continue;
      for (let pw = 0; pw < 8; pw++) {
        const c = suit * 8 + pw;
        if (!(st.pool & (1 << c))) continue;
        const prevPool = st.pool;
        st.pool = (st.pool & ~(1 << c)) >>> 0;
        st.pending--;
        entry.card = c;
        const ok = this.consistent(st) && this.fillHidden(st, k + 1, order, prefix);
        entry.card = -1;
        st.pending++;
        st.pool = prevPool;
        if (ok) return true;
      }
    }
    return false;
  }

  private slots(st: State): [number, number][] {
    const out: [number, number][] = [];
    const T = 1 << this.trump;
    for (const [s, cap] of st.handCap) out.push([cap, ALL_SUITS & ~st.voids.get(s)!]);
    if (st.foldedCap) out.push([st.foldedCap, T]);
    for (const led of this.info.hiddenLed) out.push([1, ALL_SUITS & ~(1 << led) & ~T]);
    if (st.pending > 0) {
      const led = suitOfI(st.trick[0].card);
      out.push([st.pending, ALL_SUITS & ~(1 << led)]);
    }
    return out;
  }

  private consistent(st: State): boolean {
    const counts = [0, 0, 0, 0];
    for (let c = 0; c < 32; c++) if (st.pool & (1 << c)) counts[suitOfI(c)]++;
    return feasible(counts, this.slots(st));
  }

  private nextToAct(st: State): Seat {
    const last = st.trick.length ? st.trick[st.trick.length - 1].seat : null;
    if (last === null) return st.leader;
    let s = nextSeat(last);
    while (!this.info.active.includes(s)) s = nextSeat(s);
    return s;
  }

  private key(st: State, myIdx: number): string {
    let k = `${st.pool}|${st.foldedCap}|${st.leader}|${myIdx}|${st.open ? 1 : 0}${st.myIndicatorDown ? 1 : 0}|${st.round}|`;
    for (const [s, cap] of st.handCap) k += `${s}:${cap}:${st.voids.get(s)},`;
    for (const c of st.trick) k += `${c.seat}${c.card}${c.down ? 'd' : ''};`;
    for (const [s, cs] of st.knownHeld) k += `${s}k${cs.join('.')}`;
    return k;
  }

  /**
   * A sure win: all my remaining cards are trumps and each beats every trump still
   * out there. Then whatever is led I either follow trump or cut, and nobody can
   * beat me, so every order wins every round. (Open trump, or I'm not the trumper:
   * a closed trumper's in-hand trumps can't always be played.)
   */
  private sureWin(st: State): boolean {
    const info = this.info, T = this.trump;
    if (!st.open && info.me === info.trumper) return false;
    let myWeakest = -1;
    for (let c = 0; c < 32; c++) {
      if (!(st.myLeft & (1 << c))) continue;
      if (suitOfI(c) !== T) return false;
      myWeakest = Math.max(myWeakest, powerOfI(c));
    }
    if (myWeakest < 0) return false;
    // Strongest trump still out: in the pool (incl. a folded card), held as a known card, or in the trick.
    let theirBest = 8;
    for (let pw = 0; pw < 8; pw++) if (st.pool & (1 << (T * 8 + pw))) { theirBest = pw; break; }
    for (const cs of st.knownHeld.values()) for (const c of cs) if (suitOfI(c) === T) theirBest = Math.min(theirBest, powerOfI(c));
    for (const c of st.trick) if (c.seat !== info.me && c.card >= 0 && suitOfI(c.card) === T) theirBest = Math.min(theirBest, powerOfI(c.card));
    return myWeakest < theirBest;
  }

  private dfs(st: State, order: number[], prefix: number): boolean {
    if (++this.nodes > this.budget) throw new OutOfBudget();
    const info = this.info;
    // Only before I've played to the current trick: a card I've already played can still lose it.
    if (!st.trick.some((c) => c.seat === info.me) && this.sureWin(st)) return false;
    const size = info.active.length;
    if (st.trick.length === size) return this.resolve(st, order, prefix);
    const seat = this.nextToAct(st);

    if (seat === info.me) {
      if (st.myIdx >= order.length) return false; // ran out of cards: the line is complete
      if (st.myIdx >= prefix) return false; // beyond the part of the order being tested
      const card = order[st.myIdx];
      if (!this.myLegal(st, card)) return true; // the declared order would be illegal here
      const down = this.wouldBeDown(st, info.me, card);
      const saved = { myLeft: st.myLeft, myIndicatorDown: st.myIndicatorDown };
      st.myLeft = (st.myLeft & ~(1 << card)) >>> 0;
      if (card === info.myIndicator) st.myIndicatorDown = false;
      st.trick.push({ seat, card, down });
      st.myIdx++;
      const r = this.dfs(st, order, prefix);
      st.myIdx--;
      st.trick.pop();
      st.myLeft = saved.myLeft;
      st.myIndicatorDown = saved.myIndicatorDown;
      return r;
    }

    const k = this.key(st, st.myIdx);
    if (this.memo.has(k)) return false;
    for (const opt of this.options(st, seat)) {
      if (this.applyOption(st, seat, opt, () => this.dfs(st, order, prefix))) return true;
    }
    this.memo.add(k);
    return false;
  }

  private resolve(st: State, order: number[], prefix: number): boolean {
    const T = this.trump;
    const led = suitOfI(st.trick[0].card);
    let best = st.trick[0];
    for (const c of st.trick) {
      const cs = suitOfI(c.card), bs = suitOfI(best.card);
      const beats = cs === T ? bs !== T || powerOfI(c.card) < powerOfI(best.card)
        : bs !== T && cs === led && (bs !== led || powerOfI(c.card) < powerOfI(best.card));
      if (beats) best = c;
    }
    if (teamOf(best.seat) !== this.info.team) return true; // lost a round: the order fails
    // Reveal: a face-down trump opens trump; the folded card goes back to the trumper's hand.
    const saved = { trick: st.trick, leader: st.leader, open: st.open, foldedCap: st.foldedCap, round: st.round,
      handCap: new Map(st.handCap), myIndicatorDown: st.myIndicatorDown, last: st.lastTrumperTrumpLead };
    const revealed = !st.open && st.trick.some((c) => c.down && suitOfI(c.card) === T);
    if (revealed) {
      st.open = true;
      if (st.foldedCap) { st.handCap.set(this.info.trumper, st.handCap.get(this.info.trumper)! + st.foldedCap); st.foldedCap = 0; }
      if (st.myIndicatorDown) st.myIndicatorDown = false;
    }
    st.lastTrumperTrumpLead = st.trick[0].seat === this.info.trumper && led === T;
    st.trick = [];
    st.leader = best.seat;
    st.round++;
    const r = st.myIdx >= order.length || st.myIdx >= prefix ? false : this.dfs(st, order, prefix);
    st.trick = saved.trick; st.leader = saved.leader; st.open = saved.open; st.foldedCap = saved.foldedCap;
    st.round = saved.round; st.handCap = saved.handCap; st.myIndicatorDown = saved.myIndicatorDown; st.lastTrumperTrumpLead = saved.last;
    return r;
  }

  /** Is `card` a legal play for me right now (mirrors play.ts playOptions)? */
  private myLegal(st: State, card: number): boolean {
    const info = this.info, T = this.trump;
    const ind = st.myIndicatorDown ? info.myIndicator : null;
    const hand: number[] = [];
    for (let c = 0; c < 32; c++) if (st.myLeft & (1 << c) && c !== ind) hand.push(c);
    if (ind !== null && hand.length === 0) return card === ind;
    const isTrumper = info.me === info.trumper;
    const trumps = hand.filter((c) => suitOfI(c) === T);
    const nonTrumps = hand.filter((c) => suitOfI(c) !== T);
    if (st.trick.length === 0) {
      if (card === ind) return false;
      if (st.open) {
        if (info.mustLeadTrump && st.round === 1 && trumps.length) return suitOfI(card) === T;
        if (isTrumper && st.lastTrumperTrumpLead && trumps.length && !this.poolHasSuit(st, T) && nonTrumps.length) return suitOfI(card) === T;
      } else if (isTrumper && st.round === 1 && nonTrumps.length) {
        return suitOfI(card) !== T;
      }
      return true;
    }
    const led = suitOfI(st.trick[0].card);
    const follow = hand.filter((c) => suitOfI(c) === led);
    if (follow.length) return follow.includes(card);
    if (st.open || !isTrumper) return card !== ind;
    const opts = [...(ind !== null && led !== T ? [ind] : []), ...nonTrumps];
    return opts.length ? opts.includes(card) : card !== ind;
  }

  private poolHasSuit(st: State, suit: number): boolean {
    return ((st.pool >>> (suit * 8)) & 0xff) !== 0;
  }

  private wouldBeDown(st: State, seat: Seat, card: number): boolean {
    if (st.open || st.trick.length === 0) return false;
    const led = suitOfI(st.trick[0].card);
    if (seat === this.info.me) {
      const ind = st.myIndicatorDown ? this.info.myIndicator : null;
      for (let c = 0; c < 32; c++) if (st.myLeft & (1 << c) && c !== ind && suitOfI(c) === led) return false;
      return true;
    }
    return suitOfI(card) !== led;
  }

  /** Candidate plays for another player: pool runs (top and bottom of each), known cards, or the folded card. */
  private options(st: State, seat: Seat): { card: number; from: 'pool' | 'known' | 'folded'; voidLed: boolean }[] {
    const info = this.info, T = this.trump;
    const led = st.trick.length ? suitOfI(st.trick[0].card) : -1;
    const v = st.voids.get(seat)!;
    const known = st.knownHeld.get(seat) ?? [];
    const out: { card: number; from: 'pool' | 'known' | 'folded'; voidLed: boolean }[] = [];
    const isTrumper = seat === info.trumper;

    const poolReps = (suit: number): number[] => {
      // Runs of pool cards not separated by any card outside the pool.
      const reps: number[] = [];
      let runStart = -1, runEnd = -1;
      for (let pw = 0; pw < 8; pw++) {
        const c = suit * 8 + pw;
        if (st.pool & (1 << c)) {
          if (runStart < 0) runStart = c;
          runEnd = c;
        } else if (runStart >= 0) {
          reps.push(runStart); if (runEnd !== runStart) reps.push(runEnd);
          runStart = -1;
        }
      }
      if (runStart >= 0) { reps.push(runStart); if (runEnd !== runStart) reps.push(runEnd); }
      return reps;
    };
    const handCap = st.handCap.get(seat)!;

    if (led < 0) {
      // Leading: any card they could hold.
      for (const c of known) out.push({ card: c, from: 'known', voidLed: false });
      if (handCap > 0) {
        for (let s = 0; s < 4; s++) if (!(v & (1 << s))) for (const c of poolReps(s)) out.push({ card: c, from: 'pool', voidLed: false });
      }
      return this.orderOptions(st, seat, out);
    }

    const knownLed = known.filter((c) => suitOfI(c) === led);
    // Follow suit.
    for (const c of knownLed) out.push({ card: c, from: 'known', voidLed: false });
    if (!(v & (1 << led)) && handCap > 0) for (const c of poolReps(led)) out.push({ card: c, from: 'pool', voidLed: false });
    // Or be void in the led suit (impossible if known to hold one).
    if (knownLed.length === 0) {
      const closedTrumper = isTrumper && !st.open;
      for (const c of known) out.push({ card: c, from: 'known', voidLed: true });
      if (handCap > 0) {
        for (let s = 0; s < 4; s++) {
          if (s === led || (v & (1 << s))) continue;
          if (closedTrumper && s === T) continue; // §T-4: no folding an in-hand trump
          for (const c of poolReps(s)) out.push({ card: c, from: 'pool', voidLed: true });
        }
      }
      if (closedTrumper && st.foldedCap && led !== T) for (const c of poolReps(T)) out.push({ card: c, from: 'folded', voidLed: true });
    }
    return this.orderOptions(st, seat, out);
  }

  /** Try likely losing lines first: opponents high, partner low. */
  private orderOptions(_st: State, seat: Seat, opts: { card: number; from: 'pool' | 'known' | 'folded'; voidLed: boolean }[]) {
    const opp = teamOf(seat) !== this.info.team;
    const T = this.trump;
    const score = (c: number) => (suitOfI(c) === T ? 8 : 0) + (8 - powerOfI(c));
    return opts.sort((a, b) => (opp ? score(b.card) - score(a.card) : score(a.card) - score(b.card)));
  }

  private applyOption(st: State, seat: Seat, opt: { card: number; from: 'pool' | 'known' | 'folded'; voidLed: boolean }, next: () => boolean): boolean {
    const led = st.trick.length ? suitOfI(st.trick[0].card) : -1;
    const prevVoid = st.voids.get(seat)!;
    const prevCap = st.handCap.get(seat)!;
    const prevFolded = st.foldedCap;
    const prevPool = st.pool;
    const prevKnown = st.knownHeld.get(seat);
    if (opt.voidLed && led >= 0) st.voids.set(seat, prevVoid | (1 << led));
    if (opt.from === 'pool') { st.pool = (st.pool & ~(1 << opt.card)) >>> 0; st.handCap.set(seat, prevCap - 1); }
    else if (opt.from === 'folded') { st.pool = (st.pool & ~(1 << opt.card)) >>> 0; st.foldedCap = 0; }
    else st.knownHeld.set(seat, prevKnown!.filter((c) => c !== opt.card));
    let r = false;
    if (this.consistent(st)) {
      const down = !st.open && led >= 0 && opt.voidLed;
      st.trick.push({ seat, card: opt.card, down });
      r = next();
      st.trick.pop();
    }
    st.voids.set(seat, prevVoid);
    st.handCap.set(seat, prevCap);
    st.foldedCap = prevFolded;
    st.pool = prevPool;
    if (prevKnown) st.knownHeld.set(seat, prevKnown); else st.knownHeld.delete(seat);
    return r;
  }
}

function trumpCandidates(info: Info): number[] {
  if (info.trumpKnown !== null) return [info.trumpKnown];
  // I don't know trump (closed, not the trumper): any suit that still has unseen cards could be it.
  return [0, 1, 2, 3].filter((s) => info.pool.some((c) => suitOfI(c) === s));
}

export type SolveResult = Card[] | null | 'unknown';

/** Does this exact order guarantee every remaining round? true / false / 'unknown' (budget ran out). */
export function orderGuarantees(view: PlayerView, order: readonly Card[], budget = 1_000_000): boolean | 'unknown' {
  const info = readView(view);
  if (!info) return false;
  const o = order.map(idx);
  if (o.length !== info.mine.length || o.some((c) => !info.mine.includes(c))) return false;
  try {
    for (const T of trumpCandidates(info)) if (new Search(info, T, budget).fails(o, o.length)) return false;
    return true;
  } catch (e) {
    if (e instanceof OutOfBudget) return 'unknown';
    throw e;
  }
}

/**
 * Finds an order of `view.seat`'s remaining cards that guarantees their team
 * wins every remaining round, or null if none exists. 'unknown' if the node
 * budget ran out first.
 */
export function findGuaranteedOrder(view: PlayerView, budget = 1_000_000): SolveResult {
  const info = readView(view);
  if (!info) return null;
  const searches = trumpCandidates(info).map((T) => new Search(info, T, budget));
  // Try strong cards first: trumps high to low (if known), then everything else high to low.
  const T = info.trumpKnown;
  const ranked = [...info.mine].sort((a, b) => {
    const ta = suitOfI(a) === T ? 0 : 1, tb = suitOfI(b) === T ? 0 : 1;
    return ta - tb || powerOfI(a) - powerOfI(b) || a - b;
  });
  const order: number[] = [];
  const used = new Set<number>();
  const extend = (): boolean => {
    if (order.length === ranked.length) return true;
    for (const c of ranked) {
      if (used.has(c)) continue;
      order.push(c); used.add(c);
      if (!searches.some((s) => s.fails(order, order.length)) && extend()) return true;
      order.pop(); used.delete(c);
    }
    return false;
  };
  try {
    return extend() ? order.map((i) => PACK[i] as Card) : null;
  } catch (e) {
    if (e instanceof OutOfBudget) return 'unknown';
    throw e;
  }
}

void SUITS;
