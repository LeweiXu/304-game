# 304 project overview (for planning the RL bots)

This is a briefing on the 304 repo for anyone (person or chatbot) helping design reinforcement-learning bots for it. Read it next to `rules.md`, which is the full house ruleset. Everything here describes the code as it stands on 2026-11-01.

## What the project is

304 is a four-player partnership trick-taking card game from Sri Lanka (Jass family; full rules in `rules.md`). The repo is a website for playing it: https://304.leweixu.com. Right now you play against three bots (your partner plus two opponents). Online multiplayer with real people comes later.

The current bots are a simple hand-written rule-based player ("naive bot"). The goal of the next phase is to replace them with RL-trained agents at several difficulty levels (easy / medium / hard and so on), which the website can then offer as opponents.

## Repo layout

```
engine/     rules engine. Pure TypeScript, no runtime dependencies.
bots/       the bots and the RL training environment
  src/        naive bot, observation encoder, batched env, env server (TypeScript)
  python/     Python client for the env (numpy only so far)
frontend/   React + Vite website (rules page, game table). Deployed on Vercel.
backend/    FastAPI on a home server. Only a health check today; multiplayer later.
docs/rules/ rules.md (house rules), play_invariants.md, caps_formalism.md
```

The engine is the single source of truth for the rules. The website, the bots and the training environment all call it; nothing re-implements rules.

## How a game flows (engine phases)

1. **bid4**: betting on the first 4 cards. Actions: bid (160-250), pass, partner (ask your partner to bid in your seat; only the first two speakers, first speech only), redeal (priority player with under 15 points).
2. **trump4**: the 4-card winner places one card face down; its suit is trump.
3. Second deal (automatic), then **bid8**: betting on 8 cards. Bid (220 "Honest" to 250), pass, pass-on (under 25 points, first speech only).
4. **trump8**: only if someone bid on 8 cards; the old trumper takes their card back and the new one picks.
5. **declare**: the trumper chooses closed trump (suit stays secret) or open trump.
6. **play**: 8 tricks ("rounds"). In closed trump, a player who can't follow suit plays face down; face-down trumps cut, and the first cut reveals trump. Detailed trumper restrictions are rules §T-1 to §T-6.
7. **over**: scoring. If the bidding team reached its bid, it gives away stone (1-3 depending on the bid); if not, the opponents give away stone (2-4). Each team starts with 10; first to give away all 10 wins the match.

One match is many games. A game can also end early: nobody bids (pass-on), a redeal, or an 8-card pass-on. Those score nothing.

### Rules implemented vs not

Implemented: everything above, including partnering, all bidding skip/termination rules (§B-1 to §B-9), closed-trump face-down play, overcuts, trump reveal, exhausted trumps, and stone/match scoring.

Not implemented yet (and not in the action space): **caps** (calling that your team wins every remaining trick, plus late/wrong/external caps), **PCC** (Partner Closed Caps, a bid above 250), **absolute hand**, **Spoilt Trumps** calls, and **penalties**. Without caps every game plays all 8 tricks. Adding caps later will add actions and observation features, so expect the env to be versioned.

### Interpretation calls the code makes

- Stone only ever goes down: whichever team wins the game removes stone from its own pile. (rules.md phrases a failed bid as the bidders "receiving" stone; it means the opponents give theirs away. rules.md now says this explicitly.)
- Bids top out at 250 because PCC isn't implemented.
- In 8-card betting, only an 8-card bid counts as the "current bid" for the holder skip (§B-2), so the 4-card trumper can still speak on 8 cards.

## Engine API

```ts
newMatch(seed) -> MatchState                // deals game 1
toAct(game) -> seat | null                  // whose decision it is
legalActions(game) -> Action[]              // the only authority on legality
apply(match, action) -> MatchState          // pure: returns a new state, throws if illegal
step(match, action) -> MatchState           // fast path: mutates in place, no check, no copy
cloneMatch(match) -> MatchState             // branch a state (search)
nextGame(match) -> MatchState               // deal the next game after 'over'
viewFor(match, seat) -> PlayerView          // what that seat may know (see below)
legalMask(game) / encodeAction / decodeAction   // fixed action numbering
```

- **Seats** are 0-3 anticlockwise (the direction of deal and play). Seat s+1 is on s's right. Partners sit opposite, so team = seat % 2. On the website the human is seat 0 and their partner is seat 2.
- **Determinism**: the RNG state lives inside MatchState, so (seed, actions) always gives the same game. Bot decisions use a seeded RNG too.
- **Hidden information**: `viewFor` hides other hands, face-down cards that weren't revealed, the folded trump card (from everyone but the trumper), and the trump suit (from everyone but the trumper until trump is open). Bots and the encoder only ever get a view. The view includes the full history of tricks the seat saw: the rules only allow physically inspecting the last trick, but players may remember everything.

### Action space (85 discrete actions)

| Indices | Action |
|---|---|
| 0-14 | bid 160, 170, 180, 190, 200, 205, 210, 215, 220, 225, 230, 235, 240, 245, 250 |
| 15 | pass |
| 16 | partner |
| 17 | redeal |
| 18 | pass-on (8 cards) |
| 19-20 | declare closed / open trump |
| 21-52 | choose trump card (32 cards) |
| 53-84 | play card (32 cards) |

Card order everywhere is clubs, diamonds, hearts, spades, and within a suit J, 9, A, 10, K, Q, 8, 7 (the 304 rank order, highest first). Whether a played card goes face down isn't a separate action; the engine decides it from the rules (closed trump + can't follow suit = face down).

### Speed

Single core, Node 24, Core Ultra 7 265K:

| | |
|---|---|
| random legal moves, pure `apply` | ~1.4M actions/s |
| random legal moves, in-place `step` | ~2.7M actions/s (~65k games/s) |
| naive bots playing all seats | ~460k actions/s |
| `legalActions` / `viewFor` / naive bot decision | ~0.15 / 0.5 / 0.6 µs |

A game averages about 42 actions with random play.

## The training environment (bots/)

Training will happen in Python, but the engine is TypeScript. Rather than port it, Python launches Node worker processes, each holding a batch of games. Every call sends one action per game and gets back numpy arrays for the whole batch, so the cost of crossing between processes is spread over hundreds of games.

```python
from bots304 import MultiVecEnv

env = MultiVecEnv(workers=8, num_envs=256, seed=0)   # 2048 games, self-play
b = env.reset()
while True:
    actions = policy(b.obs, b.mask, b.seat)   # one int per game, legal per b.mask
    b = env.step(actions)
```

Each step returns, per game slot:

- `obs` (float32, 465): observation for the seat to act, seat-relative (layout below)
- `mask` (uint8, 85): legal actions
- `seat` (int8): absolute seat to act
- `reward` (float32, 4): one per absolute seat, for the game that just ended
- `done` (bool): a game ended during this step; the slot auto-resets, so `obs` is already the next game's first decision

Options:

- `agent_seats`: which seats the learner controls. Default all four (self-play). `[0, 2]` trains one team.
- `opponent`: who plays the other seats, `"naive"` or `"random"`.
- `check_legal`: reject illegal actions instead of trusting the mask.

**Episode and reward.** One episode is one game. Reward only arrives at the end. When a game is played out, the team that gave away k stone gets +k for both seats and the other team gets -k (zero-sum, partners share). Pass-ons and redeals give 0. There's no shaping yet (e.g. card points), and no match-level reward. Stone counts are in the observation, so a policy could learn match-situation play.

**Multi-agent shape.** It's turn-based like PettingZoo's AEC model: each step is a decision for whichever agent seat is to act, and with all four seats as agents consecutive decisions come from different seats. The trainer has to attribute the end-of-game reward to each seat's decisions itself (e.g. keep per-seat trajectories).

### Observation layout (465 floats, all in 0..1)

"Relative seat" means rel 0 = me, rel 1 = my right (acts after me), rel 2 = partner, rel 3 = my left.

| Block | Offset | Size | Meaning |
|---|---|---|---|
| `hand` | 0 | 32 | my cards, one bit per card (PACK order) |
| `indicator` | 32 | 32 | my face-down trump card, if I am the trumper and it is still on the table |
| `phase` | 64 | 7 | one-hot: bid4, trump4, bid8, trump8, declare, play, over |
| `dealer` | 71 | 4 | dealer, one-hot by relative seat |
| `to_act` | 75 | 4 | who is to act, one-hot by relative seat |
| `stone` | 79 | 2 | stone left for my team and the other team, divided by 10 |
| `hand_counts` | 81 | 4 | cards in hand per relative seat, divided by 8 |
| `bid_stage` | 85 | 2 | current betting round is the 4-card / 8-card one |
| `high_value` | 87 | 16 | current high bid in this betting round: one-hot over the 15 bid values, last slot = no bid |
| `high_seat` | 103 | 4 | holder of the current high bid, relative seat |
| `bid4_value` | 107 | 16 | winning 4-card bid, same encoding (last slot = none yet) |
| `bid4_seat` | 123 | 4 | winner of the 4-card bid, relative seat |
| `bid8_value` | 127 | 16 | winning 8-card bid, same encoding |
| `bid8_seat` | 143 | 4 | winner of the 8-card bid, relative seat |
| `speeches` | 147 | 20 | per relative seat: [has spoken this round, last speech was bid, pass, partner, none] |
| `speaking_for_partner` | 167 | 1 | I am bidding in my partner's seat after they said "partner" |
| `trumper` | 168 | 5 | trumper by relative seat, last slot = none yet |
| `trump_suit` | 173 | 5 | trump suit if I know it (I am trumper or trump is open), last slot = unknown |
| `trump_flags` | 178 | 3 | [trump is open, the folded trump is still on the table, I am the trumper] |
| `round` | 181 | 8 | current round 1-8, one-hot (all zero outside play) |
| `leader` | 189 | 4 | leader of the current trick, relative seat |
| `trick` | 193 | 136 | current trick, per relative seat: [played, played face down and hidden from me, card 32 bits] |
| `seen` | 329 | 128 | per relative seat: every card I have seen them play this game (face up, revealed, or my own) |
| `hidden_counts` | 457 | 4 | per relative seat: face-down cards they played that I never saw, divided by 8 |
| `tricks_won` | 461 | 2 | tricks won by my team / the other team, divided by 8 |
| `points` | 463 | 2 | points I can see each team has won, divided by 304 |

Known gaps: the full speech-by-speech bidding history isn't encoded (only each seat's latest speech in the current round, plus the winning 4- and 8-card bids), and suit voids aren't precomputed (a model has to infer them from `seen` and the trick). Both are easy to add if a design calls for them. The encoder lives in TypeScript on purpose: the website can run the exact same encoder in the browser when it serves a trained model.

### Environment speed (random actions, no network)

Dev machine, 256 games per worker:

| setup | agent decisions/s | games/s |
|---|---|---|
| self-play, 1 worker | ~160k | ~3.5k |
| self-play, 8 workers | ~400k | ~8.8k |
| self-play, 16 workers | ~430k | ~9.6k |
| one agent seat vs naive bots, 16 workers | ~330k | ~27k |

Self-play averages about 46 agent decisions per game (all four seats); with one agent seat it's about 12. Past roughly 8 workers the single Python thread becomes the limit.

### Baselines

Measured over about 20k games each:

- Random team (seats 0 and 2 playing uniformly random legal moves) vs naive team: random averages **-2.9 stone per game** and wins about **4%** of played-out games, mostly because random bidding overreaches.
- Random vs random: about 50/50, as expected.

So the naive bot is a sanity-check opponent, not a strong one. It opens with a decent 4-card hand, rarely competes, makes trump its longest suit, wins tricks cheaply, gives points to a winning partner, and cuts only when the trick has points worth taking.

## Hardware

### Dev machine (training most likely runs here)

| | |
|---|---|
| CPU | Intel Core Ultra 7 265K, 20 cores (8P + 12E, no hyper-threading) |
| GPU | NVIDIA GeForce RTX 5070, 12 GB VRAM (driver 591.86, Blackwell / sm_120) |
| RAM | 31 GiB visible to WSL2 |
| Disk | ~500 GB free |
| OS | Ubuntu 24.04 on WSL2 (Windows host) |
| Software | Python 3.12, Node 24 |

### Home server (hosts the backend)

| | |
|---|---|
| CPU | Intel Core i7-9700, 8 cores / 8 threads, up to 4.7 GHz |
| GPU | NVIDIA GeForce RTX 2060 (Turing, normally 6 GB VRAM). Driver 580.173 (open kernel module) and CUDA libraries installed; `nvidia-smi` isn't, so VRAM wasn't queried directly. Also Intel UHD 630 integrated graphics. |
| RAM | 15 GiB |
| Disk | ~59 GB free |
| OS | Ubuntu 24.04 |
| Software | Python 3.12, Node 18 |
| Network | behind CGNAT, reachable through a Cloudflare tunnel (https://304-api.leweixu.com) |

It already runs three other small web backends.

## Constraints and preferences for the bot design

- Bots must only use their `PlayerView`, never hidden information. The env and encoder already enforce this.
- Bots should be deterministic given (view, seed).
- Several difficulty levels are wanted, not just one strong bot.
- Where trained models run is open. Options: in the browser (the site is a static Vercel deploy; e.g. ONNX Runtime Web, needs small models), or behind the FastAPI backend on the home server (i7-9700 + RTX 2060).
- Caps and PCC are coming later and will change the action space and observation.
- 304 has imperfect information, a two-stage auction, partnership play (shared reward, no communication beyond play), and closed-trump hidden-suit mechanics. Worth weighing approaches with that in mind: e.g. PPO self-play with action masking, recurrent vs feed-forward policies given the history features, population or league training, determinization/ISMCTS with learned priors, NFSP or Deep CFR-style methods. Also separating or sharing networks for bidding vs play.
