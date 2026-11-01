// The public face of the engine: start a match, ask whose turn it is and what
// they may do, apply an action, deal the next game. Everything is pure: apply()
// returns a new MatchState and never touches the one passed in.
import { PACK, suitOf } from './cards';
import { applySpeech, legalBiddingActions, newBidding } from './bidding';
import { applyPlay, newPlay, playOptions } from './play';
import { makeRng } from './rng';
import { nextSeat, otherTeam, teamOf, type Seat, type Team } from './seats';
import type { Action, GameEnd, GameState, MatchState } from './types';

export const START_STONE = 10;

/** Stone for making / failing a bid: [win, loss]. */
export function stoneAtStake(bid: number): [number, number] {
  if (bid >= 250) return [3, 4];
  if (bid >= 200) return [2, 3];
  return [1, 2];
}

function deal(number: number, dealer: Seat, rngState: number): { game: GameState; rng: number } {
  const rng = makeRng(rngState);
  const deck = rng.shuffle(PACK);
  const hands: GameState['hands'] = [[], [], [], []];
  // 4 each, starting to the dealer's right, dealer last.
  for (let i = 0; i < 4; i++) hands[nextSeat(dealer, i + 1)] = deck.slice(i * 4, i * 4 + 4);
  return {
    rng: rng.state,
    game: {
      number,
      dealer,
      phase: 'bid4',
      hands,
      stock: deck.slice(16),
      bidding: newBidding(4, dealer),
      bid4: null,
      bid8: null,
      trump: null,
      play: null,
      end: null,
    },
  };
}

export interface MatchOptions {
  /** Who deals the first game. Defaults to a random seat. */
  dealer?: Seat;
  stone?: [number, number];
}

export function newMatch(seed: number, opts: MatchOptions = {}): MatchState {
  const rng = makeRng(seed);
  const dealer = opts.dealer ?? (rng.int(4) as Seat);
  const { game, rng: after } = deal(1, dealer, rng.state);
  return { seed, rng: after, stone: opts.stone ?? [START_STONE, START_STONE], game, history: [], winner: null, steps: 0 };
}

/** Deals the next game once the current one is over and nobody has won the match. */
export function nextGame(m: MatchState): MatchState {
  if (m.game.phase !== 'over' || m.winner !== null) throw new Error('The current game is still going, or the match is over.');
  // A redeal keeps the same dealer; everything else moves the deal one seat anticlockwise.
  const dealer = m.game.end?.kind === 'redeal' ? m.game.dealer : nextSeat(m.game.dealer);
  const { game, rng } = deal(m.game.number + 1, dealer, m.rng);
  return { ...m, game, rng };
}

/** Whose decision it is, or null when the game is over. */
export function toAct(g: GameState): Seat | null {
  switch (g.phase) {
    case 'bid4':
    case 'bid8': return g.bidding.speaker;
    case 'trump4': return g.bid4!.seat;
    case 'trump8': return g.bid8!.seat;
    case 'declare': return g.trump!.seat;
    case 'play': return g.play!.turn;
    case 'over': return null;
  }
}

/** Everything the player to move may do right now. Empty when the game is over. */
export function legalActions(g: GameState): Action[] {
  switch (g.phase) {
    case 'bid4':
    case 'bid8': return legalBiddingActions(g);
    case 'trump4':
    case 'trump8': return g.hands[toAct(g)!].map((card) => ({ type: 'trump', card }));
    case 'declare': return [{ type: 'declare', open: false }, { type: 'declare', open: true }];
    case 'play': return playOptions(g).map((o) => ({ type: 'play', card: o.card }));
    case 'over': return [];
  }
}

export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'bid': return a.value === (b as typeof a).value;
    case 'trump':
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
    case 'play':
      if (applyPlay(g, action.card)) score(m);
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
      trump: g.trump && { ...g.trump },
      play: g.play && {
        ...g.play,
        trick: g.play.trick.map((c) => ({ ...c })),
        tricks: [...g.play.tricks], // finished tricks are never modified
        points: [g.play.points[0], g.play.points[1]],
      },
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

function chooseTrump(g: GameState, card: GameState['hands'][number][number]) {
  const seat = toAct(g)!;
  g.hands[seat] = g.hands[seat].filter((c) => c !== card);
  g.trump = { seat, suit: suitOf(card), indicator: card, open: false, mustLeadTrump: false };
  if (g.phase === 'trump4') {
    for (let i = 0; i < 4; i++) {
      const s = nextSeat(g.dealer, i + 1);
      g.hands[s] = [...g.hands[s], ...g.stock.slice(i * 4, i * 4 + 4)];
    }
    g.stock = [];
    g.bidding = newBidding(8, g.dealer);
    g.phase = 'bid8';
  } else {
    g.phase = 'declare';
  }
}

function declare(g: GameState, open: boolean) {
  const t = g.trump!;
  g.play = newPlay(g);
  g.phase = 'play';
  if (!open) return;
  // Open trump: the folded card goes back into the trumper's hand and the suit is known.
  // A trumper who also has priority must then lead trump in round 1.
  g.hands[t.seat].push(t.indicator!);
  t.indicator = null;
  t.open = true;
  t.mustLeadTrump = g.play.leader === t.seat;
}

function score(m: MatchState) {
  const g = m.game;
  const bid = g.bid8 ?? g.bid4!;
  const bidTeam = teamOf(bid.seat);
  const points = g.play!.points;
  const made = points[bidTeam] >= bid.value;
  const [win, loss] = stoneAtStake(bid.value);
  // Whoever wins the game gives away stone from their own pile; nobody's pile ever grows.
  // Bid made: the bidding team gives away the win amount. Bid failed: the opponents give
  // away the loss amount (rules.md calls that the bidding team "receiving" stone).
  const giver: Team = made ? bidTeam : otherTeam(bidTeam);
  const moved = Math.min(made ? win : loss, m.stone[giver]);
  m.stone[giver] -= moved;
  finish(m, { kind: 'played', bid, bidTeam, points: [points[0], points[1]], made, giver, stone: moved });
  if (m.stone[giver] === 0) m.winner = giver;
}

function finish(m: MatchState, end: GameEnd) {
  m.game.phase = 'over';
  m.game.end = end;
  m.history.push(end);
}
