# bots

Everything that plays 304: the bots themselves, and the environment used to train new ones with RL. The rules come from `../engine`; nothing here re-implements them.

```
src/naive.ts      simple rule-based bot (the current opponent on the website)
src/encode.ts     PlayerView -> fixed-size Float32 observation, seat-relative
src/vecenv.ts     a batch of games stepped together, bots fill non-agent seats
src/server.ts     the batch as a child process speaking a binary protocol over stdin/stdout
python/bots304/   Python client: VecEnv (one Node worker) and MultiVecEnv (several)
python/bench.py   environment throughput with random legal actions
```

## Setup

```bash
# TypeScript side (Node 22+ locally; the built server also runs on Node 18)
npm install
npm test              # vitest: bot matches, encoder, VecEnv
npm run build         # -> dist/server.mjs, which Python launches

# Python side (3.10+)
python3 -m venv ~/venvs/304-bots
~/venvs/304-bots/bin/pip install -e "python[dev]"
~/venvs/304-bots/bin/python -m pytest python/tests
~/venvs/304-bots/bin/python python/bench.py
```

Rebuild `dist/server.mjs` after changing anything in `src/` or `../engine/src/`, or Python will keep running the old code.

## Using it from Python

```python
from bots304 import MultiVecEnv

env = MultiVecEnv(workers=8, num_envs=256, seed=0)   # 2048 games, self-play on all four seats
b = env.reset()
while True:
    actions = policy(b.obs, b.mask, b.seat)          # one int per game, must be legal in b.mask
    b = env.step(actions)
    # b.reward: (n, 4) per absolute seat, nonzero only where b.done
```

- One episode is one game (deal to scoring). Slots auto-reset: when `done[i]` is set, `obs[i]` is already the first decision of the next game.
- `agent_seats=[0, 2]` with `opponent="naive"` trains one team against the naive bot; the default `[0, 1, 2, 3]` is self-play. `opponent="random"` plays uniformly random legal moves.
- Rewards are stone given away, zero-sum per game: the team that gave away k stone gets +k on both seats, the other team -k (caps outcomes included). A claim-balance penalty adds -1 / +1. Pass-ons, redeals, absolute hands and Spoilt Trumps give 0.
- The engine's default rules have caps on, which runs the caps solver; `rules={"caps": False}` is much faster.
- `check_legal=True` makes the server reject illegal actions instead of trusting the mask.
- `rules={...}` sets house-rule options for every match, e.g. `{"shuffle": "slap", "claimThreshold": True}`.
- The observation layout (block names, offsets, meanings) comes back as `env.layout`.
- `env.views()` returns the full structured view (everything the seat to act can see or remember) as dicts. Slower; for debugging or trying other encodings.

## Wire protocol

Frames are `[u32 cmd/status][u32 length][payload]`, little-endian, over the child's stdin/stdout. Commands: 1 INIT (JSON config), 2 RESET, 3 STEP (int32 actions), 4 STATS, 5 CLOSE, 6 VIEWS (JSON PlayerViews). A batch reply is `obs f32 | reward f32 | mask u8 | seat i8 | done u8`, back to back. Details in `src/server.ts`.

## Speed

Random legal actions, no network, on the dev machine (Core Ultra 7 265K, 20 cores):

| setup | agent decisions/s | games/s |
|---|---|---|
| self-play, caps off, 1 worker x 256 games | ~110k | ~8k |
| self-play, caps off, 16 x 256 | ~415k | ~30k |
| self-play, caps on, 16 x 256 (random agents call caps a lot) | ~65k | ~5k |
| one agent seat vs naive bots, 16 x 256 | ~240k | ~29k |

The observation is 2847 floats (about 11 KB per game per step), so past about 8 workers memory bandwidth on the Python side is the limit. Replies are read straight into the final numpy arrays by parallel threads, with no extra copies. That's far more than a GPU learner will consume.
