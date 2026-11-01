import numpy as np
import pytest

from bots304 import MultiVecEnv, VecEnv
from bots304.env import SERVER

pytestmark = pytest.mark.skipif(not SERVER.exists(), reason="run `npm run build` in bots/ first")


def random_actions(mask, rng):
    return np.argmax(rng.random(mask.shape) * mask, axis=1).astype(np.int32)


def test_shapes_and_layout():
    with VecEnv(num_envs=8, seed=1) as env:
        b = env.reset()
        assert b.obs.shape == (8, env.obs_size) and b.obs.dtype == np.float32
        assert b.mask.shape == (8, env.action_count)
        assert sum(block["size"] for block in env.layout) == env.obs_size
        assert (b.mask.sum(axis=1) > 0).all()


def test_self_play_rewards_are_zero_sum_and_only_at_done():
    rng = np.random.default_rng(0)
    with VecEnv(num_envs=32, seed=2, check_legal=True) as env:
        b = env.reset()
        dones = 0
        for _ in range(500):
            b = env.step(random_actions(b.mask, rng))
            assert np.allclose(b.reward.sum(axis=1), 0)
            assert np.all(b.reward[~b.done] == 0)
            assert np.all(b.reward[:, 0] == b.reward[:, 2])  # partners share
            dones += b.done.sum()
        assert dones > 50
        assert env.stats()["games"] == dones


def test_bots_fill_other_seats():
    rng = np.random.default_rng(1)
    with VecEnv(num_envs=8, seed=3, agent_seats=[0], opponent="naive") as env:
        b = env.reset()
        for _ in range(200):
            assert np.all(b.seat == 0)
            b = env.step(random_actions(b.mask, rng))


def test_illegal_action_raises_when_checking():
    with VecEnv(num_envs=1, seed=4, check_legal=True) as env:
        b = env.reset()
        illegal = int(np.flatnonzero(b.mask[0] == 0)[0])
        with pytest.raises(RuntimeError, match="not legal"):
            env.step([illegal])


def test_multi_worker():
    rng = np.random.default_rng(2)
    with MultiVecEnv(3, num_envs=4, seed=5) as env:
        b = env.reset()
        assert b.obs.shape[0] == 12
        for _ in range(50):
            b = env.step(random_actions(b.mask, rng))
        assert b.obs.shape[0] == 12


def test_views_match_the_batch():
    with VecEnv(num_envs=4, seed=6) as env:
        b = env.reset()
        views = env.views()
        assert len(views) == 4
        for i, v in enumerate(views):
            assert v["seat"] == b.seat[i]
            assert sorted(v["legalIds"]) == sorted(np.flatnonzero(b.mask[i]).tolist())
            assert "auction" in v and "trump" in v and "play" in v
