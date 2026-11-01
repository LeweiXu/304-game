// The public face of the engine: start a match, ask whose turn it is and what
// they may do, apply an action, deal the next game. Everything is pure: apply()
// returns a new MatchState and never touches the one passed in.
import { handPoints, powerOf, sortHand, suitOf, type Card, type Suit } from './cards';
import { findGuaranteedOrder, orderGuarantees } from './caps';
import { applySpeech, legalBiddingActions, newBidding } from './bidding';
import { applyPlay, newPlay, playOptions, pointsSeenBy, trickSize } from './play';
import { makeRng } from './rng';
import { buildDeck, gatherPile } from './shuffle';
import { nextSeat, otherTeam, partnerOf, teamOf, type Seat, type Team } from './seats';
import { DEFAULT_RULES, PCC, type Action, type GameEnd, type GameState, type MatchState, type RuleOptions } from './types';
import { viewFor } from './view';

/** Node budgets for the caps solver: small when checking every turn for a missed chance, big when judging a call.
 * Bots should search with TRACK_BUDGET too, so they never miss a chance the engine would hold against them. */
export const TRACK_BUDGET = 20_000;
const JUDGE_BUDGET = 2_000_000;

export const START_STONE = 10;

/** Stone for making / failing a bid: [win, loss]. PCC is 5 either way (house rule). */
export function stoneAtStake(bid: number): [number, number] {
  if (bid === PCC) return [5, 5];
  if (bid >= 250) return [3, 4];
  if (bid >= 200) return [2, 3];
  return [1, 2];
}

/** Points a team needs to win the game: the bid for the bidding team, 304 - bid + 1 for the opposition. */
export function thresholdFor(bid: number, isBidTeam: boolean): number {
  return isBidTeam ? bid : 305 - bid;
}

/**
 * An absolute hand wins all 8 rounds before play begins, whatever the deal and
 * however the others play. Two shapes qualify (rules.md, Absolute Hand):
 *
 * 1. All eight trumps. Wins whoever leads.
 * 2. With priority (you lead round 1): leading trumps from the top draws every
 *    outstanding trump, and everything left is a winner. With o trumps out, the
 *    worst case is one opponent holding all o, so your first o trumps must each
 *    beat every outstanding trump: you hold the top o trumps. Then each other
 *    suit you hold must be its top cards in sequence (J, 9, A, ...), so nothing
 *    left out there can beat them once trumps are gone.
 */
export function isAbsoluteHand(cards: readonly Card[], trump: Suit, hasPriority: boolean): boolean {
  if (cards.length !== 8) return false;
  const trumps = cards.filter((c) => suitOf(c) === trump);
  if (trumps.length === 8) return true;
  if (!hasPriority) return false;
  const out = 8 - trumps.length;
  const held = new Set(trumps.map(powerOf));
  for (let pw = 0; pw < out; pw++) if (!held.has(pw)) return false; // need the top `out` trumps
  const bySuit = new Map<Suit, number[]>();
  for (const c of cards) if (suitOf(c) !== trump) bySuit.set(suitOf(c), [...(bySuit.get(suitOf(c)) ?? []), powerOf(c)]);
  for (const powers of bySuit.values()) {
    const sorted = [...powers].sort((a, b) => a - b);
    if (sorted.some((pw, i) => pw !== i)) return false; // must be J, 9, A, ... with no gap
  }
  return true;
}

function deal(m: Pick<MatchState, 'rng' | 'rules' | 'pile'>, number: number, dealer: Seat, riffle: boolean): { game: GameState; rng: number } {
  const rng = makeRng(m.rng);
  const deck = buildDeck(rng, m.rules, m.pile, riffle);
  const hands: GameState['hands'] = [[], [], [], []];
  // 4 each, starting to the dealer's right, dealer last.
  for (let i = 0; i < 4; i++) hands[nextSeat(dealer, i + 1)] = deck.slice(i * 4, i * 4 + 4);
  return {
    rng: rng.state,
    game: {
      number,
      rules: m.rules,
      dealer,
      phase: 'bid4',
      hands,
      stock: deck.slice(16),
      bidding: newBidding(4, dealer),
      auction: [],
      bid4: null,
      bid8: null,
      trump: null,
      play: null,
      pccOut: null,
      dealt: null,
      capsFirst: [null, null, null, null],
      balanceFirst: [null, null, null, null],
      balanceCalled: [false, false, false, false],
      balanceClaimed: null,
      penalties: [],
      end: null,
    },
  };
}

export interface MatchOptions {
  /** Who deals the first game. Defaults to a random seat. */
  dealer?: Seat;
  stone?: [number, number];
  rules?: Partial<RuleOptions>;
}

export function newMatch(seed: number, opts: MatchOptions = {}): MatchState {
  const rng = makeRng(seed);
  const dealer = opts.dealer ?? (rng.int(4) as Seat);
  const rules = { ...DEFAULT_RULES, ...opts.rules };
  const { game, rng: after } = deal({ rng: rng.state, rules, pile: null }, 1, dealer, false);
  return {
    seed, rng: after, stone: opts.stone ?? [START_STONE, START_STONE], game, history: [], winner: null, steps: 0,
    rules, pile: null, redealStreak: null,
  };
}

/** Changes the rule options for the games still to be dealt. The game in progress keeps its rules. */
export function withRules(m: MatchState, rules: Partial<RuleOptions>): MatchState {
  return { ...m, rules: { ...m.rules, ...rules } };
}

/** Deals the next game once the current one is over and nobody has won the match. */
export function nextGame(m: MatchState): MatchState {
  if (m.game.phase !== 'over' || m.winner !== null) throw new Error('The current game is still going, or the match is over.');
  // A redeal (asked for, or Spoilt Trumps) keeps the same dealer; everything else moves the deal on.
  const kind = m.game.end?.kind;
  const dealer = kind === 'redeal' || kind === 'spoilt' ? m.game.dealer : nextSeat(m.game.dealer);
  // Riffle remedy: three redeals in a row from the same seat.
  const riffle = (m.redealStreak?.count ?? 0) >= 3;
  const { game, rng } = deal(m, m.game.number + 1, dealer, riffle);
  return { ...m, game, rng, redealStreak: riffle ? null : m.redealStreak };
}

/** Whose decision it is, or null when the game is over. */
export function toAct(g: GameState): Seat | null {
  switch (g.phase) {
    case 'bid4':
    case 'bid8': return g.bidding.speaker;
    case 'trump4': return g.bid4!.seat;
    case 'trump8': return g.bid8!.seat;
    case 'declare':
    case 'show': return g.trump!.seat;
    case 'play': return g.play!.turn;
    case 'over': return null;
  }
}

const contract = (g: GameState) => g.bid8 ?? g.bid4;
const isPcc = (g: GameState) => contract(g)?.value === PCC;

/** The trumper's full 8 cards right now (hand plus the folded card if it's still on the table). */
function trumperCards(g: GameState): Card[] {
  const t = g.trump!;
  return t.indicator ? [...g.hands[t.seat], t.indicator] : [...g.hands[t.seat]];
}

/** The trumper leads round 1: they have priority, or it's PCC. */
const trumperLeads = (g: GameState) => g.trump!.seat === nextSeat(g.dealer) || isPcc(g);

/** Has `team` won every round played so far? */
function sweptSoFar(g: GameState, team: Team): boolean {
  return (g.play?.tricks ?? []).every((tr) => teamOf(tr.winner) === team);
}

/** Cards played so far this game: identifies a play turn. */
const turnId = (g: GameState) => (g.play ? g.play.tricks.length * trickSize(g) + g.play.trick.length : 0);

/** Everything the player to move may do right now. Empty when the game is over. */
export function legalActions(g: GameState): Action[] {
  switch (g.phase) {
    case 'bid4':
    case 'bid8': return legalBiddingActions(g);
    case 'trump4':
    case 'trump8': return g.hands[toAct(g)!].map((card) => ({ type: 'trump', card }));
    case 'declare': {
      const out: Action[] = [{ type: 'declare', open: false }, { type: 'declare', open: true }];
      if (isAbsoluteHand(trumperCards(g), g.trump!.suit, trumperLeads(g))) out.push({ type: 'absolute' });
      return out;
    }
    case 'show': {
      const t = g.trump!;
      const out: Action[] = g.hands[t.seat].filter((c) => suitOf(c) === t.suit).map((card) => ({ type: 'show', card }));
      if (isAbsoluteHand(trumperCards(g), t.suit, trumperLeads(g))) out.push({ type: 'absolute' });
      return out;
    }
    case 'play': {
      const out: Action[] = playOptions(g).map((o) => ({ type: 'play', card: o.card }));
      const seat = g.play!.turn;
      if (!isPcc(g)) {
        const swept = sweptSoFar(g, teamOf(seat));
        // Caps can be called on your own turn while your team has won every round so far.
        if (g.rules.caps && swept) out.push({ type: 'caps' });
        // Claim balance covers the rest (once caps can't apply), one call per seat.
        if (g.rules.claimBalance && !(g.rules.caps && swept) && !g.balanceCalled[seat]) out.push({ type: 'balance' });
      }
      if (g.rules.claimThreshold && canClaimThreshold(g, seat)) out.push({ type: 'claim' });
      return out;
    }
    case 'over': return [];
  }
}

/** Claim threshold: from what `seat` can see, their team has already reached the points it needs. */
function canClaimThreshold(g: GameState, seat: Seat): boolean {
  const bid = contract(g);
  if (!bid || bid.value === PCC) return false; // PCC is decided by tricks, not points
  const team = teamOf(seat);
  return pointsSeenBy(g, seat)[team] >= thresholdFor(bid.value, team === teamOf(bid.seat));
}

export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'bid': return a.value === (b as typeof a).value;
    case 'trump':
    case 'show':
    case 'play': return a.card === (b as typeof a).card;
    case 'declare': return a.open === (b as typeof a).open;
    default: return true;
  }
}

export function isLegal(g: GameState, a: Action): boolean {
  if (!legalActions(g).some((l) => sameAction(l, a))) return false;
  if (a.type === 'caps' && a.order) {
    // A declared order has to list exactly the caller's remaining cards.
    const mine = remainingCards(g, g.play!.turn);
    return a.order.length === mine.length && mine.every((c) => a.order!.includes(c));
  }
  return true;
}

/** A seat's unplayed cards, including the folded trump if it's theirs and still on the table. */
function remainingCards(g: GameState, seat: Seat): Card[] {
  const t = g.trump;
  return t && t.seat === seat && t.indicator ? [...g.hands[seat], t.indicator] : [...g.hands[seat]];
}

/** Applies the action for whoever is to move. Throws on an illegal action. Never changes `m`. */
export function apply(m: MatchState, action: Action): MatchState {
  if (!isLegal(m.game, action)) throw new Error(`Illegal action ${JSON.stringify(action)} in phase ${m.game.phase}`);
  return step(cloneMatch(m), action);
}

/**
 * The fast path for training loops and search: applies the action by changing
 * `m` in place, with no legality check and no copy. Only use it when you own
 * `m` and already know the action is legal (e.g. it came from a legal mask).
 * Returns `m`.
 */
export function step(m: MatchState, action: Action): MatchState {
  m.steps += 1;
  const g = m.game;

  switch (action.type) {
    case 'redeal':
      finish(m, { kind: 'redeal', seat: g.bidding.speaker });
      break;
    case 'passOn':
      finish(m, { kind: 'passOn', reason: 'lowPoints8', seat: g.bidding.speaker });
      break;
    case 'bid':
    case 'pcc':
    case 'pass':
    case 'partner':
      if (applySpeech(g, action)) endBidding(m);
      break;
    case 'trump':
      chooseTrump(g, action.card);
      break;
    case 'declare':
      declare(g, action.open);
      break;
    case 'show':
      g.trump!.shown = action.card;
      beginPlay(g);
      break;
    case 'absolute':
      finish(m, { kind: 'absolute', seat: g.trump!.seat, how: 'goodwill' });
      break;
    case 'caps':
      judgeCaps(m, action.order ?? null);
      break;
    case 'balance':
      judgeBalance(m);
      break;
    case 'claim':
      score(m, g.play!.turn);
      break;
    case 'play':
      if (applyPlay(g, action.card) || decided(g)) score(m, null);
      break;
  }
  // Spoilt Trumps ends the game inside beginPlay, which has no MatchState: record it here.
  if (g.phase === 'over' && g.end && m.history.at(-1) !== g.end) finish(m, g.end);
  if (g.phase === 'play') trackOpportunities(m);
  return m;
}

/**
 * The result can't change any more: one team has reached its points threshold
 * and caps no longer matters (caps off, or both teams have won a round). Not
 * with the claim-threshold option, where players have to claim it themselves.
 */
function decided(g: GameState): boolean {
  if (g.rules.claimThreshold || isPcc(g)) return false;
  const p = g.play!;
  const bid = contract(g)!;
  const bidTeam = teamOf(bid.seat);
  const reached = p.points[bidTeam] >= bid.value || p.points[otherTeam(bidTeam)] >= thresholdFor(bid.value, false);
  if (!reached) return false;
  if (!g.rules.caps) return true;
  const won = [false, false];
  for (const tr of p.tricks) won[teamOf(tr.winner)] = true;
  return won[0] && won[1];
}

/**
 * At the start of each play turn, note whether the player to act could call caps
 * (or claim the balance) now. That's how late caps and missed claims are judged
 * later. The solver only sees that player's view.
 */
function trackOpportunities(m: MatchState) {
  const g = m.game;
  if (isPcc(g)) return;
  const seat = g.play!.turn;
  const team = teamOf(seat);
  const swept = sweptSoFar(g, team);
  const capsChance = g.rules.caps && swept && g.capsFirst[seat] === null;
  const balanceChance = g.rules.claimBalance && !(g.rules.caps && swept) && g.balanceFirst[seat] === null;
  if (!capsChance && !balanceChance) return;
  const found = findGuaranteedOrder(viewFor(m, seat), TRACK_BUDGET);
  if (!Array.isArray(found)) return; // none, or couldn't tell in budget: no penalty on a maybe
  if (capsChance) g.capsFirst[seat] = turnId(g);
  if (balanceChance) g.balanceFirst[seat] = turnId(g);
}

/** Caps outcomes in stone (rules.md, Caps): [giving team, amount]. */
function capsStone(g: GameState, team: Team, result: 'correct' | 'late' | 'wrong', beforeRound7: boolean): [Team, number] {
  const bid = contract(g)!;
  const bidTeam = teamOf(bid.seat);
  const [win, loss] = stoneAtStake(bid.value);
  if (result === 'wrong') return [otherTeam(team), 5]; // the caller's team "receives" 5
  const bonus = result === 'correct' && beforeRound7 ? 1 : 0;
  if (team === bidTeam) {
    return result === 'correct' ? [bidTeam, win + bonus] : [otherTeam(bidTeam), loss + 1];
  }
  // External caps (the opposition): correct = the betting team loses (+1 early); late = the betting team wins + 1.
  return result === 'correct' ? [team, loss + bonus] : [bidTeam, win + 1];
}

function endWithCaps(m: MatchState, seat: Seat | null, team: Team, result: 'correct' | 'late' | 'wrong', order: Card[] | null) {
  const g = m.game;
  const bid = contract(g)!;
  const round = g.play!.round;
  const [giver, amount] = capsStone(g, team, result, round <= 6);
  const moved = Math.min(amount, m.stone[giver]);
  m.stone[giver] -= moved;
  finish(m, { kind: 'caps', seat, team, result, order, round, bid, bidTeam: teamOf(bid.seat), giver, stone: moved });
}

/** A caps call: judge the declared order (or find one if none was given). */
function judgeCaps(m: MatchState, declared: Card[] | null) {
  const g = m.game;
  const seat = g.play!.turn;
  const team = teamOf(seat);
  const view = viewFor(m, seat);
  const found = findGuaranteedOrder(view, JUDGE_BUDGET);
  const order = declared ?? (Array.isArray(found) ? found : sortHand(remainingCards(g, seat)));
  const sure = declared ? orderGuarantees(view, declared, JUDGE_BUDGET) : found !== null;
  if (sure === false) {
    // The declared order doesn't guarantee the sweep (whether or not some other order would have): wrong caps.
    return endWithCaps(m, seat, team, 'wrong', order);
  }
  // Guaranteed (or too big to refute: benefit of the doubt). Late if this player had an earlier chance.
  const first = g.capsFirst[seat];
  endWithCaps(m, seat, team, first !== null && first < turnId(g) ? 'late' : 'correct', order);
}

/** A claim-balance call. Right: the claimer's team takes every remaining card. Wrong: 1 stone, play goes on. */
function judgeBalance(m: MatchState) {
  const g = m.game;
  const seat = g.play!.turn;
  const team = teamOf(seat);
  const found = findGuaranteedOrder(viewFor(m, seat), JUDGE_BUDGET);
  if (found === null) {
    g.balanceCalled[seat] = true;
    g.penalties.push({ seat, reason: 'balanceWrong', stone: 1 });
    return;
  }
  const firsts = [0, 1, 2, 3].filter((s) => teamOf(s as Seat) === team).map((s) => g.balanceFirst[s]).filter((x): x is number => x !== null);
  if (firsts.length && Math.min(...firsts) < turnId(g)) g.penalties.push({ seat, reason: 'balanceLate', stone: 1 });
  // The rest of the rounds go to the claiming team.
  const p = g.play!;
  const rest = [...g.hands.filter((_, s) => s !== g.pccOut).flat(), ...(g.trump?.indicator ? [g.trump.indicator] : []), ...p.trick.map((c) => c.card)];
  p.points[team] += handPoints(rest);
  g.balanceClaimed = team;
  score(m, null);
}

/** Deep copy of the parts step() may change. Plain data, so this is all it takes. */
export function cloneMatch(m: MatchState): MatchState {
  const g = m.game;
  const b = g.bidding;
  return {
    ...m,
    stone: [m.stone[0], m.stone[1]],
    history: [...m.history],
    game: {
      ...g,
      hands: g.hands.map((h) => [...h]),
      stock: [...g.stock],
      bidding: { ...b, spoken: [...b.spoken], skipOnce: [...b.skipOnce], speeches: [...b.speeches] },
      auction: [...g.auction],
      trump: g.trump && { ...g.trump },
      play: g.play && {
        ...g.play,
        trick: g.play.trick.map((c) => ({ ...c })),
        tricks: [...g.play.tricks], // finished tricks are never modified
        points: [g.play.points[0], g.play.points[1]],
      },
      capsFirst: [...g.capsFirst],
      balanceFirst: [...g.balanceFirst],
      balanceCalled: [...g.balanceCalled],
      penalties: [...g.penalties],
      // rules, dealt, pile and redealStreak are replaced, never mutated, so sharing them is safe.
    },
  };
}

function endBidding(m: MatchState) {
  const g = m.game;
  const high = g.bidding.high;
  if (g.bidding.stage === 4) {
    if (!high) return finish(m, { kind: 'passOn', reason: 'noBids' });
    g.bid4 = high;
    g.phase = 'trump4';
    return;
  }
  if (high) {
    // An 8-card bid supersedes the 4-card one: the old trumper picks their card back up.
    g.bid8 = high;
    const t = g.trump!;
    if (t.indicator) g.hands[t.seat].push(t.indicator);
    g.trump = null;
    g.phase = 'trump8';
  } else {
    g.phase = 'declare';
  }
}

function chooseTrump(g: GameState, card: Card) {
  const seat = toAct(g)!;
  g.hands[seat] = g.hands[seat].filter((c) => c !== card);
  g.trump = {
    seat, suit: suitOf(card), indicator: card, folded: card,
    open: false, declaredOpen: false, foldedPublic: false, shown: null, mustLeadTrump: false,
  };
  if (g.phase === 'trump4') {
    for (let i = 0; i < 4; i++) {
      const s = nextSeat(g.dealer, i + 1);
      g.hands[s] = [...g.hands[s], ...g.stock.slice(i * 4, i * 4 + 4)];
    }
    g.stock = [];
    g.bidding = newBidding(8, g.dealer);
    g.phase = 'bid8';
  } else if (isPcc(g)) {
    startPcc(g);
  } else {
    g.phase = 'declare';
  }
}

/** PCC: the partner sits out and the trumper plays open trump, showing a trump card before play. */
function startPcc(g: GameState) {
  const t = g.trump!;
  g.pccOut = partnerOf(t.seat);
  openTrump(g);
  g.phase = 'show';
}

/** Open trump: the folded card goes back into the trumper's hand and the suit is public. */
function openTrump(g: GameState) {
  const t = g.trump!;
  g.hands[t.seat].push(t.indicator!);
  t.indicator = null;
  t.open = true;
  t.declaredOpen = true;
}

function declare(g: GameState, open: boolean) {
  if (!open) return beginPlay(g);
  openTrump(g);
  // A trumper with priority reveals by leading trump in round 1. Anyone else shows
  // a trump card of their choice to the table first (the 'show' phase).
  if (nextSeat(g.dealer) === g.trump!.seat) {
    g.trump!.mustLeadTrump = true;
    beginPlay(g);
  } else {
    g.phase = 'show';
  }
}

function beginPlay(g: GameState) {
  const t = g.trump!;
  g.dealt = g.hands.map((h, s) => (s === t.seat && t.indicator ? [...h, t.indicator] : [...h]));
  g.play = newPlay(g);
  g.phase = 'play';
  // Spoilt Trumps: the trumping team's opponents were dealt no trump at all. Checked
  // automatically once trump is final; the cards are thrown in and the same dealer redeals.
  const trumpTeam = teamOf(t.seat);
  const spoilt = [0, 1, 2, 3].every((s) => teamOf(s as Seat) === trumpTeam || !g.dealt![s].some((c) => suitOf(c) === t.suit));
  if (spoilt) {
    g.phase = 'over';
    g.end = { kind: 'spoilt' };
  }
}

function score(m: MatchState, claimedBy: Seat | null) {
  const g = m.game;
  const bid = contract(g)!;
  const pcc = bid.value === PCC;
  const bidTeam = teamOf(bid.seat);
  const p = g.play!;
  const tricks: [number, number] = [0, 0];
  for (const tr of p.tricks) tricks[teamOf(tr.winner)] += 1;

  // The opposition lost every round: if the trumper's hand was absolute, they claim it and the game becomes a pass-on.
  if (!pcc && tricks[bidTeam] === 8 && isAbsoluteHand(g.dealt![g.trump!.seat], g.trump!.suit, trumperLeads(g))) {
    return finish(m, { kind: 'absolute', seat: g.trump!.seat, how: 'claim' });
  }
  // A sweep nobody called, though someone on that team had a caps chance: late caps.
  if (!pcc && g.rules.caps && claimedBy === null && g.balanceClaimed === null) {
    for (const team of [0, 1] as Team[]) {
      if (tricks[team] !== 8) continue;
      const missed = [0, 1, 2, 3].some((s) => teamOf(s as Seat) === team && g.capsFirst[s] !== null);
      if (missed) return endWithCaps(m, null, team, 'late', null);
    }
  }

  let made: boolean;
  if (pcc) made = tricks[bidTeam] === 8;
  else if (claimedBy !== null) made = teamOf(claimedBy) === bidTeam; // a claim is only offered once the threshold is reached
  else made = p.points[bidTeam] >= bid.value;

  const [win, loss] = stoneAtStake(bid.value);
  // Whoever wins the game gives away stone from their own pile; nobody's pile ever grows.
  // Bid made: the bidding team gives away the win amount. Bid failed: the opponents give
  // away the loss amount (rules.md calls that the bidding team "receiving" stone).
  const giver: Team = made ? bidTeam : otherTeam(bidTeam);
  const moved = Math.min(made ? win : loss, m.stone[giver]);
  m.stone[giver] -= moved;
  finish(m, {
    kind: 'played', bid, bidTeam, points: [p.points[0], p.points[1]], made, giver, stone: moved,
    pcc, claimedBy, tricks,
  });
}

function finish(m: MatchState, end: GameEnd) {
  const g = m.game;
  g.phase = 'over';
  g.end = end;
  m.history.push(end);
  // Claim balance: a team that had a chance to claim and never did pays 1 stone.
  if (g.rules.claimBalance && g.play) {
    for (const team of [0, 1] as Team[]) {
      if (g.balanceClaimed === team) continue;
      const seat = ([0, 1, 2, 3] as Seat[]).find((s) => teamOf(s) === team && g.balanceFirst[s] !== null);
      if (seat !== undefined) g.penalties.push({ seat, reason: 'balanceMissed', stone: 1 });
    }
  }
  // Penalties are settled at the end of the game: the offender's opponents give away stone.
  for (const pen of g.penalties) {
    const giver = otherTeam(teamOf(pen.seat));
    m.stone[giver] -= Math.min(pen.stone, m.stone[giver]);
  }
  if (m.stone[0] === 0) m.winner = 0;
  else if (m.stone[1] === 0) m.winner = 1;
  m.pile = gatherPile(g);
  m.redealStreak = end.kind === 'redeal'
    ? { seat: end.seat, count: m.redealStreak?.seat === end.seat ? m.redealStreak.count + 1 : 1 }
    : null;
}
