// The public face of the engine: start a match, ask whose turn it is and what
// they may do, apply an action, deal the next game. Everything is pure: apply()
// returns a new MatchState and never touches the one passed in.
import { suitOf, type Card, type Suit } from './cards';
import { applySpeech, legalBiddingActions, newBidding } from './bidding';
import { applyPlay, newPlay, playOptions, pointsSeenBy, trickSize } from './play';
import { makeRng } from './rng';
import { buildDeck, gatherPile } from './shuffle';
import { nextSeat, otherTeam, partnerOf, teamOf, type Seat, type Team } from './seats';
import { DEFAULT_RULES, PCC, type Action, type GameEnd, type GameState, type MatchState, type RuleOptions } from './types';

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
 * An absolute hand is guaranteed to win all 8 rounds whatever the deal, however
 * the others play, and whoever leads. That only holds for all eight trumps: with
 * any non-trump card, some deal lets an opponent lead that suit (or lets you be
 * forced to lead it) while another opponent, void in it, cuts with an outstanding
 * trump. Only the trumper can hold all eight trumps (one of them is the folded card).
 */
export function isAbsoluteHand(cards: readonly Card[], trump: Suit): boolean {
  return cards.length === 8 && cards.every((c) => suitOf(c) === trump);
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
      spoiltCalled: [false, false, false, false],
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
  // A redeal keeps the same dealer; everything else moves the deal one seat anticlockwise.
  const dealer = m.game.end?.kind === 'redeal' ? m.game.dealer : nextSeat(m.game.dealer);
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

/** Everything the player to move may do right now. Empty when the game is over. */
export function legalActions(g: GameState): Action[] {
  switch (g.phase) {
    case 'bid4':
    case 'bid8': return legalBiddingActions(g);
    case 'trump4':
    case 'trump8': return g.hands[toAct(g)!].map((card) => ({ type: 'trump', card }));
    case 'declare': {
      const out: Action[] = [{ type: 'declare', open: false }, { type: 'declare', open: true }];
      if (isAbsoluteHand(trumperCards(g), g.trump!.suit)) out.push({ type: 'absolute' });
      return out;
    }
    case 'show': {
      const t = g.trump!;
      const out: Action[] = g.hands[t.seat].filter((c) => suitOf(c) === t.suit).map((card) => ({ type: 'show', card }));
      if (isAbsoluteHand(trumperCards(g), t.suit)) out.push({ type: 'absolute' });
      return out;
    }
    case 'play': {
      const out: Action[] = playOptions(g).map((o) => ({ type: 'play', card: o.card }));
      const p = g.play!;
      const seat = p.turn;
      // Spoilt Trumps: anyone, once per game, any time before the last card of round 8.
      const lastCard = p.round === 8 && p.trick.length === trickSize(g) - 1;
      if (!g.spoiltCalled[seat] && !lastCard) out.push({ type: 'spoilt' });
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
  return legalActions(g).some((l) => sameAction(l, a));
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
    case 'spoilt':
      callSpoilt(m);
      break;
    case 'claim':
      score(m, g.play!.turn);
      break;
    case 'play':
      if (applyPlay(g, action.card)) score(m, null);
      break;
  }
  return m;
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
      spoiltCalled: [...g.spoiltCalled],
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
    // Nothing outranks a PCC bid made on 4 cards, so 8-card betting is skipped.
    if (isPcc(g)) return startPcc(g);
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
}

/**
 * Spoilt Trumps: right if the trumping team's opponents held no trump at all
 * in the cards they were dealt. A right call voids the game; a wrong one costs
 * the caller's team 1 stone (their opponents give one away) and play goes on.
 */
function callSpoilt(m: MatchState) {
  const g = m.game;
  const t = g.trump!;
  const seat = g.play!.turn;
  g.spoiltCalled[seat] = true;
  const trumpTeam = teamOf(t.seat);
  const spoilt = [0, 1, 2, 3].every((s) => teamOf(s as Seat) === trumpTeam || !g.dealt![s].some((c) => suitOf(c) === t.suit));
  if (spoilt) finish(m, { kind: 'spoilt', seat });
  else g.penalties.push({ seat, reason: 'falseSpoilt', stone: 1 });
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
  if (!pcc && tricks[bidTeam] === 8 && isAbsoluteHand(g.dealt![g.trump!.seat], g.trump!.suit)) {
    return finish(m, { kind: 'absolute', seat: g.trump!.seat, how: 'claim' });
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
