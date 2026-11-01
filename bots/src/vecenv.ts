// A batch of 304 games stepped together, for RL training.
//
// Each slot runs an endless series of matches. One "episode" is one game (deal
// to scoring). Seats not in `agentSeats` are played by a built-in bot, so after
// every step each slot is parked at a decision for one of the agent seats.
//
// After reset() or step() the public buffers hold, for every slot i:
//   obs[i]     observation for the seat to act (see encode.ts)
//   mask[i]    1 for each legal action (see engine/src/actions.ts)
//   seat[i]    which seat is acting (absolute 0-3)
//   reward[i]  4 numbers, one per absolute seat, for the game that just ended
//   done[i]    1 if a game ended during this step (obs then belongs to the next game)
//
// Rewards are zero-sum: when a game is played out, the team that gave away
// stone gets +stone for both its seats and the other team gets -stone.
// Pass-ons and redeals give 0. Nothing in between: reward only arrives at done.
import {
  ACTION_COUNT, decodeAction, isLegal, legalActions, legalMask, makeRng, mixSeed, newMatch, nextGame, step, teamOf, toAct, viewFor,
  type MatchState, type Seat,
} from '../../engine/src';
import { encodeView, OBS_SIZE } from './encode';
import { naiveBot } from './naive';

export type Opponent = 'naive' | 'random';

export interface VecEnvConfig {
  numEnvs: number;
  seed?: number;
  /** Seats the learner controls. Default: all four (pure self-play). */
  agentSeats?: Seat[];
  /** Who plays the other seats. */
  opponent?: Opponent;
  /** Throw if an action isn't legal. Costs a little; handy while developing. */
  checkLegal?: boolean;
}

export class VecEnv {
  readonly numEnvs: number;
  readonly obs: Float32Array;
  readonly mask: Uint8Array;
  readonly seat: Int8Array;
  readonly reward: Float32Array;
  readonly done: Uint8Array;
  /** Running totals, handy for logging: games finished, games played out, matches finished. */
  readonly stats = { games: 0, played: 0, matches: 0, agentSteps: 0, botSteps: 0 };

  private readonly agent: boolean[];
  private readonly opponent: Opponent;
  private readonly checkLegal: boolean;
  private readonly seed: number;
  private matches: MatchState[] = [];
  private matchCounter = 0;

  constructor(cfg: VecEnvConfig) {
    this.numEnvs = cfg.numEnvs;
    this.seed = cfg.seed ?? 0;
    const seats = cfg.agentSeats ?? [0, 1, 2, 3];
    if (!seats.length) throw new Error('agentSeats must name at least one seat');
    this.agent = [0, 1, 2, 3].map((s) => seats.includes(s as Seat));
    this.opponent = cfg.opponent ?? 'naive';
    this.checkLegal = cfg.checkLegal ?? false;
    this.obs = new Float32Array(this.numEnvs * OBS_SIZE);
    this.mask = new Uint8Array(this.numEnvs * ACTION_COUNT);
    this.seat = new Int8Array(this.numEnvs);
    this.reward = new Float32Array(this.numEnvs * 4);
    this.done = new Uint8Array(this.numEnvs);
  }

  reset(): void {
    this.reward.fill(0);
    this.done.fill(0);
    this.matches = [];
    for (let i = 0; i < this.numEnvs; i++) {
      this.matches.push(this.freshMatch());
      this.settle(i);
      this.write(i);
    }
  }

  /** One action per slot, as action indices. */
  step(actions: ArrayLike<number>): void {
    if (actions.length !== this.numEnvs) throw new Error(`expected ${this.numEnvs} actions, got ${actions.length}`);
    this.reward.fill(0);
    this.done.fill(0);
    for (let i = 0; i < this.numEnvs; i++) {
      const m = this.matches[i];
      const action = decodeAction(actions[i]);
      if (this.checkLegal && !isLegal(m.game, action)) {
        throw new Error(`slot ${i}: action ${actions[i]} (${JSON.stringify(action)}) is not legal`);
      }
      step(m, action);
      this.stats.agentSteps++;
      this.settle(i);
      this.write(i);
    }
  }

  /** Plays bot seats and deals new games until slot i waits on an agent decision. */
  private settle(i: number): void {
    for (;;) {
      let m = this.matches[i];
      const g = m.game;
      if (g.phase === 'over') {
        this.finishGame(i, m);
        m = m.winner !== null ? this.freshMatch() : nextGame(m);
        this.matches[i] = m;
        continue;
      }
      const s = toAct(g)!;
      if (this.agent[s]) return;
      step(m, this.botAction(m, s));
      this.stats.botSteps++;
    }
  }

  private finishGame(i: number, m: MatchState) {
    this.done[i] = 1;
    this.stats.games++;
    const end = m.game.end!;
    if (end.kind === 'played') {
      this.stats.played++;
      for (let s = 0; s < 4; s++) this.reward[i * 4 + s] += teamOf(s as Seat) === end.giver ? end.stone : -end.stone;
    }
    if (m.winner !== null) this.stats.matches++;
  }

  private botAction(m: MatchState, s: Seat) {
    const rng = makeRng(mixSeed(this.seed, m.seed, m.steps));
    if (this.opponent === 'naive') return naiveBot(viewFor(m, s), rng);
    const legal = legalActions(m.game);
    return legal[rng.int(legal.length)];
  }

  private freshMatch(): MatchState {
    return newMatch(mixSeed(this.seed, ++this.matchCounter));
  }

  private write(i: number) {
    const m = this.matches[i];
    const s = toAct(m.game)!;
    this.seat[i] = s;
    encodeView(viewFor(m, s), this.obs, i * OBS_SIZE);
    legalMask(m.game, this.mask.subarray(i * ACTION_COUNT, (i + 1) * ACTION_COUNT));
  }
}
