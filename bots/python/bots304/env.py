"""Talks to the Node environment server (bots/dist/server.mjs) over pipes.

The rules engine is TypeScript, so instead of porting it, each VecEnv runs one
Node process holding `num_envs` games. Every call sends one action per game and
gets back numpy arrays for the whole batch, so the per-move cost of crossing
the process boundary is spread over the batch.

    env = VecEnv(num_envs=256, seed=0)          # self-play: all four seats are the agent
    b = env.reset()
    while training:
        actions = policy(b.obs, b.mask)         # int array, shape (num_envs,)
        b = env.step(actions)
        # b.reward[i] has one entry per absolute seat; nonzero only when b.done[i]

MultiVecEnv runs several of these in parallel (one Node process each) and
concatenates the results.
"""
from __future__ import annotations

import json
import struct
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np

SERVER = Path(__file__).resolve().parents[2] / "dist" / "server.mjs"

_INIT, _RESET, _STEP, _STATS, _CLOSE = 1, 2, 3, 4, 5


@dataclass
class Batch:
    obs: np.ndarray  # (n, obs_size) float32, for the seat to act
    mask: np.ndarray  # (n, action_count) uint8, 1 = legal
    seat: np.ndarray  # (n,) int8, absolute seat to act (0-3)
    reward: np.ndarray  # (n, 4) float32, per absolute seat, for the game that just ended
    done: np.ndarray  # (n,) bool, a game ended this step (obs is already the next game's)


class VecEnv:
    def __init__(
        self,
        num_envs: int = 256,
        seed: int = 0,
        agent_seats: Sequence[int] = (0, 1, 2, 3),
        opponent: str = "naive",
        check_legal: bool = False,
        node: str = "node",
        server: str | Path | None = None,
    ):
        path = Path(server) if server else SERVER
        if not path.exists():
            raise FileNotFoundError(f"{path} is missing. Build it: cd bots && npm install && npm run build")
        self._proc = subprocess.Popen([node, str(path)], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        cfg = {
            "numEnvs": num_envs,
            "seed": seed,
            "agentSeats": list(agent_seats),
            "opponent": opponent,
            "checkLegal": check_legal,
        }
        info = json.loads(self._call(_INIT, json.dumps(cfg).encode()))
        self.num_envs: int = info["numEnvs"]
        self.obs_size: int = info["obsSize"]
        self.action_count: int = info["actionCount"]
        self.layout: list[dict] = info["layout"]

    # -- public API ---------------------------------------------------------

    def reset(self) -> Batch:
        return self._batch(self._call(_RESET))

    def step(self, actions: Iterable[int]) -> Batch:
        self.step_async(actions)
        return self.step_wait()

    def step_async(self, actions: Iterable[int]) -> None:
        a = np.ascontiguousarray(np.asarray(actions), dtype="<i4")
        if a.shape != (self.num_envs,):
            raise ValueError(f"expected {self.num_envs} actions, got shape {a.shape}")
        self._send(_STEP, a.tobytes())

    def step_wait(self) -> Batch:
        return self._batch(self._recv())

    def stats(self) -> dict:
        return json.loads(self._call(_STATS))

    def close(self) -> None:
        if self._proc.poll() is None:
            try:
                self._call(_CLOSE)
            except (BrokenPipeError, EOFError, RuntimeError):
                pass
            self._proc.wait(timeout=5)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def __del__(self):
        try:
            if self._proc.poll() is None:
                self._proc.kill()
        except Exception:
            pass

    # -- wire protocol ------------------------------------------------------

    def _send(self, cmd: int, payload: bytes = b"") -> None:
        self._proc.stdin.write(struct.pack("<II", cmd, len(payload)) + payload)
        self._proc.stdin.flush()

    def _read_exact(self, n: int) -> bytearray:
        buf = bytearray(n)
        view = memoryview(buf)
        got = 0
        while got < n:
            k = self._proc.stdout.readinto(view[got:])
            if not k:
                raise EOFError("environment server exited")
            got += k
        return buf

    def _recv(self) -> bytearray:
        status, n = struct.unpack("<II", self._read_exact(8))
        data = self._read_exact(n)
        if status != 0:
            raise RuntimeError(f"environment server error: {json.loads(data)}")
        return data

    def _call(self, cmd: int, payload: bytes = b"") -> bytearray:
        self._send(cmd, payload)
        return self._recv()

    def _batch(self, data: bytearray) -> Batch:
        n, o, a = self.num_envs, self.obs_size, self.action_count
        at = 0
        obs = np.frombuffer(data, dtype="<f4", count=n * o, offset=at).reshape(n, o)
        at += n * o * 4
        reward = np.frombuffer(data, dtype="<f4", count=n * 4, offset=at).reshape(n, 4)
        at += n * 16
        mask = np.frombuffer(data, dtype=np.uint8, count=n * a, offset=at).reshape(n, a)
        at += n * a
        seat = np.frombuffer(data, dtype=np.int8, count=n, offset=at)
        at += n
        done = np.frombuffer(data, dtype=np.uint8, count=n, offset=at).astype(bool)
        return Batch(obs=obs, mask=mask, seat=seat, reward=reward, done=done)


class MultiVecEnv:
    """Several VecEnv workers (one Node process each) stepped in parallel."""

    def __init__(self, workers: int, num_envs: int = 256, seed: int = 0, **kwargs):
        self.envs = [VecEnv(num_envs=num_envs, seed=seed * 1000 + w, **kwargs) for w in range(workers)]
        self.num_envs = workers * num_envs
        self.obs_size = self.envs[0].obs_size
        self.action_count = self.envs[0].action_count
        self.layout = self.envs[0].layout

    def reset(self) -> Batch:
        return _concat([e.reset() for e in self.envs])

    def step(self, actions: np.ndarray) -> Batch:
        chunks = np.split(np.asarray(actions), len(self.envs))
        for e, a in zip(self.envs, chunks):
            e.step_async(a)  # all workers run at once...
        return _concat([e.step_wait() for e in self.envs])  # ...then collect

    def stats(self) -> list[dict]:
        return [e.stats() for e in self.envs]

    def close(self) -> None:
        for e in self.envs:
            e.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def _concat(batches: list[Batch]) -> Batch:
    return Batch(*(np.concatenate([getattr(b, f) for b in batches]) for f in ("obs", "mask", "seat", "reward", "done")))
