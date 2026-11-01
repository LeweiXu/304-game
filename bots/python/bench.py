"""Environment throughput: random legal actions, no neural network.

    python bench.py                    # a few worker counts
    python bench.py --workers 8 --envs 512 --steps 500
"""
import argparse
import time

import numpy as np

from bots304 import MultiVecEnv


def random_actions(mask: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    return np.argmax(rng.random(mask.shape) * mask, axis=1).astype(np.int32)


def run(workers: int, envs: int, steps: int, opponent: str, agent_seats, caps: bool) -> None:
    rng = np.random.default_rng(0)
    with MultiVecEnv(workers, num_envs=envs, opponent=opponent, agent_seats=agent_seats, rules={"caps": caps}) as env:
        b = env.reset()
        for _ in range(20):  # warm up
            b = env.step(random_actions(b.mask, rng))
        t0 = time.perf_counter()
        games = 0
        for _ in range(steps):
            b = env.step(random_actions(b.mask, rng))
            games += int(b.done.sum())
        dt = time.perf_counter() - t0
    n = workers * envs * steps
    print(f"workers={workers:<3} envs/worker={envs:<5} agent decisions/s={n / dt:>11,.0f}   games/s={games / dt:>9,.0f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, nargs="*", default=[1, 2, 4, 8, 16])
    ap.add_argument("--envs", type=int, default=256)
    ap.add_argument("--steps", type=int, default=300)
    ap.add_argument("--opponent", default="naive", choices=["naive", "random"])
    ap.add_argument("--agent-seats", type=int, nargs="*", default=[0, 1, 2, 3])
    ap.add_argument("--caps", action="store_true", help="caps rules on (the engine runs the caps solver every turn)")
    a = ap.parse_args()
    for w in a.workers:
        run(w, a.envs, a.steps, a.opponent, a.agent_seats, a.caps)
