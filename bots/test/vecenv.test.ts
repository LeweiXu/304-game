import { describe, expect, it } from 'vitest';
import { ACTION_COUNT, makeRng } from '../../engine/src';
import { OBS_SIZE } from '../src/encode';
import { VecEnv } from '../src/vecenv';

/** Random legal action per slot, read straight from the mask. */
function randomActions(env: VecEnv, rng: ReturnType<typeof makeRng>): Int32Array {
  const out = new Int32Array(env.numEnvs);
  for (let i = 0; i < env.numEnvs; i++) {
    const legal: number[] = [];
    for (let a = 0; a < ACTION_COUNT; a++) if (env.mask[i * ACTION_COUNT + a]) legal.push(a);
    out[i] = legal[rng.int(legal.length)];
  }
  return out;
}

describe('VecEnv', () => {
  it('self-play: every slot always waits on a legal decision, rewards are zero-sum and only at done', () => {
    const env = new VecEnv({ numEnvs: 16, seed: 1, checkLegal: true, rules: { caps: false } });
    env.reset();
    const rng = makeRng(2);
    let dones = 0;
    for (let t = 0; t < 2000; t++) {
      env.step(randomActions(env, rng));
      for (let i = 0; i < env.numEnvs; i++) {
        const r = env.reward.subarray(i * 4, i * 4 + 4);
        expect(r[0] + r[1] + r[2] + r[3]).toBe(0);
        expect(r[0]).toBe(r[2]); // partners share a reward
        if (!env.done[i]) expect([...r].every((x) => x === 0)).toBe(true);
        dones += env.done[i];
        expect(env.mask.subarray(i * ACTION_COUNT, (i + 1) * ACTION_COUNT).some((x) => x === 1)).toBe(true);
      }
    }
    expect(dones).toBeGreaterThan(100);
    expect(env.obs.length).toBe(16 * OBS_SIZE);
  });

  it('only ever asks the agent seats when the rest are bots', () => {
    const env = new VecEnv({ numEnvs: 8, seed: 3, agentSeats: [0, 2], opponent: 'naive', checkLegal: true, rules: { caps: false } });
    env.reset();
    const rng = makeRng(4);
    for (let t = 0; t < 1000; t++) {
      env.step(randomActions(env, rng));
      for (let i = 0; i < env.numEnvs; i++) expect([0, 2]).toContain(env.seat[i]);
    }
    expect(env.stats.botSteps).toBeGreaterThan(0);
  });

  it('runs with house-rule options switched on', () => {
    const env = new VecEnv({ numEnvs: 8, seed: 11, checkLegal: true, rules: { shuffle: 'slap', claimThreshold: true } });
    env.reset();
    const rng = makeRng(12);
    for (let t = 0; t < 1500; t++) env.step(randomActions(env, rng));
    expect(env.views().every((v) => v.rules.shuffle === 'slap' && v.rules.claimThreshold)).toBe(true);
    expect(env.stats.games).toBeGreaterThan(20);
  });

  it('is deterministic for a seed', () => {
    const run = () => {
      const env = new VecEnv({ numEnvs: 4, seed: 9, agentSeats: [0], opponent: 'naive', rules: { caps: false } });
      env.reset();
      const rng = makeRng(5);
      for (let t = 0; t < 300; t++) env.step(randomActions(env, rng));
      return [Array.from(env.obs), Array.from(env.seat), { ...env.stats }];
    };
    expect(run()).toEqual(run());
  });

  it('rejects an illegal action when checking is on', () => {
    const env = new VecEnv({ numEnvs: 1, seed: 1, checkLegal: true });
    env.reset();
    const illegal = env.mask.findIndex((x) => x === 0);
    expect(() => env.step([illegal])).toThrow(/not legal/);
  });
});
