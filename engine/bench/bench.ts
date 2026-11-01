// Engine speed check. Run: npm run bench
import { apply, cloneMatch, legalActions, legalMask, makeRng, newMatch, step, toAct, viewFor, type MatchState } from '../src';

function time(label: string, fn: () => number, unit: string) {
  fn(); // warm up the JIT
  const t0 = performance.now();
  const n = fn();
  const ms = performance.now() - t0;
  console.log(`${label.padEnd(44)} ${(n / (ms / 1000)).toFixed(0).padStart(10)} ${unit}/s   (${(ms * 1000 / n).toFixed(2)} µs each)`);
}

/** Play `games` games with uniformly random legal moves. Returns steps taken. */
function randomGames(games: number): number {
  const rng = makeRng(1);
  let steps = 0;
  for (let i = 0; i < games; i++) {
    let m = newMatch(i + 1);
    while (m.game.phase !== 'over') {
      const legal = legalActions(m.game);
      m = apply(m, legal[rng.int(legal.length)]);
      steps++;
    }
  }
  return steps;
}

/** Same, but stepping in place without validation: the training-loop path. */
function randomGamesFast(games: number): number {
  const rng = makeRng(1);
  let steps = 0;
  for (let i = 0; i < games; i++) {
    const m = newMatch(i + 1);
    while (m.game.phase !== 'over') {
      const legal = legalActions(m.game);
      step(m, legal[rng.int(legal.length)]);
      steps++;
    }
  }
  return steps;
}

// A pile of mid-game states to time single calls against.
const states: MatchState[] = [];
{
  const rng = makeRng(9);
  for (let i = 0; states.length < 2000; i++) {
    let m = newMatch(i + 1);
    while (m.game.phase !== 'over') {
      if (m.game.phase === 'play' && rng.int(4) === 0) states.push(m);
      const legal = legalActions(m.game);
      m = apply(m, legal[rng.int(legal.length)]);
    }
  }
}
const REPS = 50;
const each = (fn: (m: MatchState) => void) => () => { for (let r = 0; r < REPS; r++) for (const m of states) fn(m); return REPS * states.length; };

const stepsPerGame = randomGames(2000) / 2000;
console.log(`avg actions per game (random play): ${stepsPerGame.toFixed(1)}\n`);
time('random legal moves: actions', () => randomGames(5000), 'actions');
time('random legal moves, step in place: actions', () => randomGamesFast(5000), 'actions');
console.log('');
time('legalActions (play phase)', each((m) => { legalActions(m.game); }), 'calls');
time('apply (play phase, first legal move)', each((m) => { apply(m, legalActions(m.game)[0]); }), 'calls');
time('step (play phase, on a copy)', each((m) => { step(cloneMatch(m), legalActions(m.game)[0]); }), 'calls');
time('cloneMatch', each((m) => { cloneMatch(m); }), 'calls');
time('legalMask (play phase)', each((m) => { legalMask(m.game); }), 'calls');
time('viewFor (play phase)', each((m) => { viewFor(m, toAct(m.game)!); }), 'calls');
