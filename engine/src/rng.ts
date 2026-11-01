// Small seeded RNG (mulberry32). The whole state is one 32-bit number, so it
// can live inside the game state and keep the engine pure: same state in,
// same state out.

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Shuffled copy. */
  shuffle<T>(items: readonly T[]): T[];
  /** Current internal state, to store back into game state. */
  readonly state: number;
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    shuffle<T>(items: readonly T[]) {
      const a = [...items];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    get state() { return s; },
  };
}

/** Mix numbers into one seed (for deriving per-decision bot seeds). */
export function mixSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
