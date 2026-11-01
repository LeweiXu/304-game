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
returns one combined batch.

Every step returns freshly allocated arrays (safe to keep, e.g. in a replay
buffer), filled straight from the pipe with no intermediate copies.
"""
from __future__ import annotations

import fcntl
import json
import struct
import subprocess
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np

SERVER = Path(__file__).resolve().parents[2] / "dist" / "server.mjs"

_INIT, _RESET, _STEP, _STATS, _CLOSE, _VIEWS = 1, 2, 3, 4, 5, 6
_F_SETPIPE_SZ = 1031  # Linux: grow the pipe buffer so big batches need fewer syscalls


@dataclass
class Batch:
    obs: np.ndarray  # (n, obs_size) float32, for the seat to act
    mask: np.ndarray  # (n, action_count) uint8, 1 = legal
    seat: np.ndarray  # (n,) int8, absolute seat to act (0-3)
    reward: np.ndarray  # (n, 4) float32, per absolute seat, for the game that just ended
    done: np.ndarray  # (n,) bool, a game ended this step (obs is already the next game's)


def _empty_batch(n: int, obs_size: int, action_count: int) -> Batch:
    return Batch(
        obs=np.empty((n, obs_size), dtype=np.float32),
        mask=np.empty((n, action_count), dtype=np.uint8),
        seat=np.empty(n, dtype=np.int8),
        reward=np.empty((n, 4), dtype=np.float32),
        done=np.empty(n, dtype=np.bool_),
    )


def _slice(b: Batch, lo: int, hi: int) -> Batch:
    return Batch(obs=b.obs[lo:hi], mask=b.mask[lo:hi], seat=b.seat[lo:hi], reward=b.reward[lo:hi], done=b.done[lo:hi])


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
        # bufsize=0: unbuffered, so readinto goes straight from the pipe into numpy memory.
        self._proc = subprocess.Popen([node, str(path)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=0)
        for f in (self._proc.stdin, self._proc.stdout):
            try:
                fcntl.fcntl(f.fileno(), _F_SETPIPE_SZ, 1 << 20)
            except OSError:
                pass  # not Linux, or above pipe-max-size: just slower
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
        self._send(_RESET)
        return self._recv_batch()

    def step(self, actions: Iterable[int]) -> Batch:
        self.step_async(actions)
        return self.step_wait()

    def step_async(self, actions: Iterable[int]) -> None:
        a = np.ascontiguousarray(np.asarray(actions), dtype="<i4")
        if a.shape != (self.num_envs,):
            raise ValueError(f"expected {self.num_envs} actions, got shape {a.shape}")
        self._send(_STEP, a.tobytes())

    def step_wait(self, out: Batch | None = None) -> Batch:
        return self._recv_batch(out)

    def stats(self) -> dict:
        return json.loads(self._call(_STATS))

    def views(self) -> list[dict]:
        """The full engine PlayerView (as a dict) for the seat to act in every slot.

        Everything that seat can see or remember: hand, auction, every trick, trump
        details, legal actions (`legalIds` are the action numbers). Much slower than
        `obs`; meant for debugging, logging, or trying a different encoding in Python.
        """
        return json.loads(self._call(_VIEWS))

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

    def _read_into(self, view: memoryview) -> None:
        got, n = 0, len(view)
        while got < n:
            k = self._proc.stdout.readinto(view[got:])
            if not k:
                raise EOFError("environment server exited")
            got += k

    def _header(self) -> int:
        head = bytearray(8)
        self._read_into(memoryview(head))
        status, n = struct.unpack("<II", head)
        if status != 0:
            msg = bytearray(n)
            self._read_into(memoryview(msg))
            raise RuntimeError(f"environment server error: {json.loads(msg)}")
        return n

    def _call(self, cmd: int, payload: bytes = b"") -> bytearray:
        self._send(cmd, payload)
        data = bytearray(self._header())
        self._read_into(memoryview(data))
        return data

    def _recv_batch(self, out: Batch | None = None) -> Batch:
        b = out if out is not None else _empty_batch(self.num_envs, self.obs_size, self.action_count)
        n = self._header()
        expected = b.obs.nbytes + b.reward.nbytes + b.mask.nbytes + b.seat.nbytes + b.done.nbytes
        if n != expected:
            raise RuntimeError(f"batch size mismatch: got {n} bytes, expected {expected}")
        for arr in (b.obs, b.reward, b.mask, b.seat, b.done.view(np.uint8)):
            self._read_into(memoryview(arr).cast("B"))
        return b


class MultiVecEnv:
    """Several VecEnv workers (one Node process each) stepped in parallel."""

    def __init__(self, workers: int, num_envs: int = 256, seed: int = 0, **kwargs):
        self.envs = [VecEnv(num_envs=num_envs, seed=seed * 1000 + w, **kwargs) for w in range(workers)]
        self.per_env = num_envs
        self.num_envs = workers * num_envs
        self.obs_size = self.envs[0].obs_size
        self.action_count = self.envs[0].action_count
        self.layout = self.envs[0].layout
        # Reading replies is mostly waiting on pipes, which releases the GIL, so threads overlap them.
        self._pool = ThreadPoolExecutor(max_workers=workers)

    def reset(self) -> Batch:
        for e in self.envs:
            e._send(_RESET)
        return self._collect()

    def step(self, actions: np.ndarray) -> Batch:
        a = np.asarray(actions)
        for w, e in enumerate(self.envs):
            e.step_async(a[w * self.per_env:(w + 1) * self.per_env])  # all workers start at once...
        return self._collect()  # ...then their replies are read in parallel

    def _collect(self) -> Batch:
        b = _empty_batch(self.num_envs, self.obs_size, self.action_count)
        jobs = [
            self._pool.submit(e._recv_batch, _slice(b, w * self.per_env, (w + 1) * self.per_env))
            for w, e in enumerate(self.envs)
        ]
        for j in jobs:
            j.result()
        return b

    def stats(self) -> list[dict]:
        return [e.stats() for e in self.envs]

    def views(self) -> list[dict]:
        return [v for e in self.envs for v in e.views()]

    def close(self) -> None:
        for e in self.envs:
            e.close()
        self._pool.shutdown(wait=False)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
