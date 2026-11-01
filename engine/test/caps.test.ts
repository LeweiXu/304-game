import { describe, expect, it } from 'vitest';
import {
  apply, legalActions, makeRng, newMatch, nextGame, suitOf, teamOf, toAct, viewFor,
  type Card, type MatchState, type Seat,
} from '../src';
import { findGuaranteedOrder, orderGuarantees } from '../src/caps';

/** Random games, stopped at play turns where the player to act has at most `maxCards` cards. */
function positions(count: number, maxCards: number, seed: number): MatchState[] {
  const out: MatchState[] = [];
  const rng = makeRng(seed);
  for (let s = 1; out.length < count; s++) {
    let m = newMatch(seed * 1000 + s, { rules: { caps: false } });
    for (let i = 0; i < 500 && out.length < count; i++) {
      if (m.game.phase === 'over') { if (m.winner !== null) break; m = nextGame(m); continue; }
      const g = m.game;
      if (g.phase === 'play' && g.pccOut === null) {
        const me = toAct(g)!;
        const n = g.hands[me].length + (g.trump!.seat === me && g.trump!.indicator ? 1 : 0);
        if (n <= maxCards && rng.int(3) === 0) out.push(m);
      }
      const legal = legalActions(g).filter((a) => a.type !== 'caps' && a.type !== 'balance' && a.type !== 'claim');
      m = apply(m, legal[rng.int(legal.length)]);
    }
  }
  return out;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/**
 * Brute force: every way to redistribute the other players' current cards that
 * respects hand sizes, the voids they've shown, and cards known to be held;
 * every legal play by the engine's real rules; every order.
 */
function bruteHasOrder(m: MatchState): boolean {
  const g = m.game;
  const me = toAct(g)!;
  const team = teamOf(me);
  const view = viewFor(m, me);
  const t = g.trump!;
  const others = ([0, 1, 2, 3] as Seat[]).filter((s) => s !== me);
  // Voids from what everyone has seen played (same facts the solver uses).
  const voids = new Map<Seat, Set<string>>(others.map((s) => [s, new Set()]));
  for (const cards of [...view.play!.tricks.map((tr) => tr.cards), view.play!.trick]) {
    if (!cards.length) continue;
    const led = suitOf(cards[0].card!);
    for (const c of cards) if (c.seat !== me && (c.card === null || suitOf(c.card) !== led)) voids.get(c.seat)!.add(led);
  }
  const fixed = new Map<Seat, Card[]>();
  if (t.seat !== me) {
    const held = [view.trump!.shown, view.trump!.indicatorOnTable ? null : view.trump!.folded]
      .filter((c): c is Card => !!c && g.hands[t.seat].includes(c));
    if (held.length) fixed.set(t.seat, [...new Set(held)]);
  }
  const pool = others.flatMap((s) => g.hands[s]).filter((c) => ![...fixed.values()].flat().includes(c));
  const counts = others.map((s) => g.hands[s].length - (fixed.get(s)?.length ?? 0));

  const worlds: Card[][][] = [];
  const assign = (i: number, rest: Card[], acc: Card[][]) => {
    if (i === others.length) { if (!rest.length) worlds.push(acc.map((h) => [...h])); return; }
    const s = others[i];
    const choose = (start: number, picked: Card[]) => {
      if (picked.length === counts[i]) {
        if (picked.some((c) => voids.get(s)!.has(suitOf(c)))) return;
        assign(i + 1, rest.filter((c) => !picked.includes(c)), [...acc, [...picked, ...(fixed.get(s) ?? [])]]);
        return;
      }
      for (let j = start; j < rest.length; j++) choose(j + 1, [...picked, rest[j]]);
    };
    choose(0, []);
  };
  assign(0, pool, []);

  const mine = [...g.hands[me], ...(t.seat === me && t.indicator ? [t.indicator] : [])];
  const loses = (x: MatchState, order: Card[], k: number): boolean => {
    const xg = x.game;
    if (xg.phase !== 'play') return false;
    const s = toAct(xg)!;
    const plays = legalActions(xg).filter((a) => a.type === 'play');
    const before = xg.play!.tricks.length;
    const step = (a: { type: 'play'; card: Card }) => {
      const y = apply(x, a);
      const yt = y.game.play?.tricks ?? [];
      if (yt.length > before && teamOf(yt.at(-1)!.winner) !== team) return true;
      if (y.game.phase === 'over') return false; // the last trick's winner was checked just above
      return loses(y, order, s === me ? k + 1 : k);
    };
    if (s === me) {
      if (k >= order.length) return false;
      const a = plays.find((p) => p.type === 'play' && p.card === order[k]) as { type: 'play'; card: Card } | undefined;
      return !a || step(a);
    }
    return plays.some((a) => step(a as { type: 'play'; card: Card }));
  };
  return permutations(mine).some((order) =>
    worlds.every((w) => {
      const x = JSON.parse(JSON.stringify(m)) as MatchState;
      // Play every remaining round out: no early end (claimThreshold disables it), no solver calls in apply.
      x.game.rules = { ...x.game.rules, caps: false, claimThreshold: true, claimBalance: false };
      others.forEach((s, i) => { x.game.hands[s] = w[i]; });
      return !loses(x, order, 0);
    }));
}

describe('caps solver vs brute force', () => {
  it('agrees exactly when the player sees everything relevant (open trump, or they are the trumper)', () => {
    let checked = 0, positive = 0;
    for (const m of positions(250, 3, 7)) {
      const me = toAct(m.game)!;
      const t = m.game.trump!;
      const hidden = viewFor(m, me).play!.tricks.some((tr) => tr.cards.some((c) => c.card === null))
        || viewFor(m, me).play!.trick.some((c) => c.card === null);
      if (!(t.open || t.seat === me) || hidden) continue;
      const fast = findGuaranteedOrder(viewFor(m, me));
      const slow = bruteHasOrder(m);
      expect(fast !== null && fast !== 'unknown', `seed position ${checked}`).toBe(slow);
      checked++;
      if (slow) positive++;
    }
    expect(checked).toBeGreaterThan(60);
    expect(positive).toBeGreaterThan(5); // the test sees both answers
  });

  it('agrees on 4-card positions too', () => {
    let checked = 0;
    for (const m of positions(20, 4, 13)) {
      const me = toAct(m.game)!;
      const t = m.game.trump!;
      const v = viewFor(m, me);
      const hidden = v.play!.tricks.some((tr) => tr.cards.some((c) => c.card === null)) || v.play!.trick.some((c) => c.card === null);
      if (!(t.open || t.seat === me) || hidden) continue;
      const fast = findGuaranteedOrder(v);
      expect(fast !== null && fast !== 'unknown').toBe(bruteHasOrder(m));
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  }, 120_000);

  it('never claims a guarantee that brute force can break (closed trump, partial information)', () => {
    for (const m of positions(150, 3, 11)) {
      const me = toAct(m.game)!;
      const fast = findGuaranteedOrder(viewFor(m, me));
      if (fast && fast !== 'unknown') {
        expect(bruteHasOrder(m)).toBe(true);
        expect(orderGuarantees(viewFor(m, me), fast)).toBe(true);
      }
    }
  });
});

