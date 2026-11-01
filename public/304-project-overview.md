# 304 project overview (for planning the RL bots)

This is a briefing on the 304 repo for anyone (person or chatbot) helping design reinforcement-learning bots for it. Read it next to `rules.md`, which is the full house ruleset. Everything here describes the code as it stands on 2026-11-01.

## What the project is

304 is a four-player partnership trick-taking card game from Sri Lanka (Jass family; full rules in `rules.md`). The repo is a website for playing it: https://304.leweixu.com. Right now you play against three bots (your partner plus two opponents). Online multiplayer with real people comes later.

The current bots are a simple hand-written rule-based player ("naive bot"). The goal of the next phase is to replace them with RL-trained agents at several difficulty levels (easy / medium / hard and so on), which the website can then offer as opponents. The learning approach isn't decided yet; a neural agent that takes the state plus the legal actions and picks one (DQN-style, PPO, or similar) is the current leaning.

## Repo layout

```
engine/     rules engine. Pure TypeScript, no runtime dependencies.
bots/       the bots and the RL training environment
  src/        naive bot, observation encoder, batched env, env server (TypeScript)
  python/     Python client for the env (numpy only so far)
frontend/   React + Vite website (rules page, game table). Deployed on Vercel.
backend/    FastAPI on a home server. Only a health check today; multiplayer later.
public/     docs: rules.md, play_invariants.md, caps_formalism.md, DEPLOYMENT.md, this file
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

Implemented: everything above, including partnering, all bidding skip/termination rules (§B-1 to §B-9), closed-trump face-down play, the trumper's private inspection of folded cards, overcuts, trump reveal, exhausted trumps, and stone/match scoring.

Not implemented yet (and not in the action space): **caps** (declaring that your team wins every remaining trick, plus late/wrong/external caps), **PCC** (Partner Closed Caps, a bid above 250), **absolute hand**, **Spoilt Trumps** calls, and **penalties**. Without caps every game plays all 8 tricks. Adding caps later will add actions and observation features, so expect the env to be versioned.

### Interpretation calls the code makes

- Stone only ever goes down: whichever team wins the game removes stone from its own pile. (rules.md phrases a failed bid as the bidders "receiving" stone; it means the opponents give theirs away. rules.md says this explicitly.)
- Bids top out at 250 because PCC isn't implemented.
- In 8-card betting, only an 8-card bid counts as the "current bid" for the holder skip (§B-2), so the 4-card trumper can still speak on 8 cards.
- When a trumper without priority declares open trump, the rules let them show any trump card; the engine always shows the folded card, so that card becomes public. A trumper with priority reveals by leading trump instead, and the folded card stays private.

## What the agent can see

The design principle: **an agent sees exactly what a human player at the table can see or remember, assuming a perfect memory, and nothing else.** That includes things that are hard for a person to memorise, like exactly who played which card in every trick. It excludes anything a person couldn't know: other players' hands, face-down cards they weren't allowed to look at, and the trump suit before it's revealed (unless they are the trumper).

This is enforced in one place: `viewFor(match, seat)` builds a `PlayerView`, and bots, the UI and the RL encoder only ever receive a `PlayerView`. The full `MatchState` (all hands, the deck) never reaches an agent.

### Everything a player knows, and where it lives

| What a player knows | `PlayerView` field | Observation block (vector) |
|---|---|---|
| Which betting round or phase it is | `phase`, `bidding.stage` | `phase`, `bid_stage` |
| Current round number during play | `play.round` | `round` |
| Their own cards | `hand` | `hand` |
| How many cards everyone holds | `handCounts` | `hand_counts` |
| Who dealt, who has priority (speaks first, leads round 1) | `dealer`, `priority` | `dealer`, `priority` |
| Whose turn it is | `toAct` | `to_act` |
| Every speech of both betting rounds, in order: who, bid/pass/partner, value, whether they spoke in their partner's seat | `auction` (and `bidding.speeches` for the current round) | `auction4`, `auction8` (plus a latest-speech summary in `speeches`) |
| Current high bid and holder | `bidding.high` | `high_value`, `high_seat` |
| Winning 4-card bid, winning 8-card bid, the contract being played | `bid4`, `bid8`, `contract` | `bid4_value`, `bid4_seat`, `bid8_value`, `bid8_seat` |
| Who is trumping | `trump.seat` | `trumper` |
| The trump suit (trumper always; everyone once open) | `trump.suit` | `trump_suit` |
| Whether trump is open, and whether it was declared open or revealed by a cut, and in which round | `trump.open`, `trump.declaredOpen`, `trump.revealedInRound` | `trump_flags`, plus the per-trick "trump revealed here" bit in `tricks` |
| Whether the folded trump card is still on the table; for the trumper, which card it is | `trump.indicatorOnTable`, `trump.indicator` | `trump_flags`, `indicator` |
| Which card was folded, once it's been flipped, shown or played face up | `trump.folded` | `folded_card` |
| The trick in progress: who led, each card played so far in order, which went face down | `play.leader`, `play.trick`, `play.ledSuit` | `leader`, `trick`, `led_suit` |
| Every completed trick: who led, who played exactly which card (or that it went face down unseen), who won, the points, whether trump was revealed in it | `play.tricks` | `tricks` (8 slots, one per round) |
| Folded cards the player was allowed to see: their own, revealed trumps, and (for the trumper) every folded card once each trick finished | inside `play.trick` / `play.tricks` (`card` is non-null) | inside `trick` / `tricks` |
| How many face-down cards each player played that this player never saw | `play.unseenFaceDown` | `hidden_counts` |
| Tricks won and visible points per team so far | `play.tricksWon`, `play.visiblePoints` | `tricks_won`, `points` |
| Stone left per team, the match score | `stone` | `stone` |
| Results of earlier games in the match | `history` | (not encoded; stone already captures the score) |
| How the game ended, with full points | `end` | (episode end; reward) |
| What they're allowed to do right now | `legal`, `legalIds` | the separate legal-action `mask` |

### What stays hidden

- Other players' hands (only the counts are known).
- A face-down card, to everyone except: the player who played it; everyone, if it was a trump (trumps get revealed when the trick resolves); the trumper, once the trick is finished (the rules have the trumper inspect folded cards privately). A non-trump "minus" stays hidden from the other two players for good, so they only know its owner played *something* face down.
- The trump suit, to non-trumpers, until it's opened by declaration or revealed by a cut.
- The identity of the folded trump card, to non-trumpers, until it's flipped on a reveal, shown on an open declaration, or played face up.
- The 16 undealt cards during 4-card betting.

### Things you might think are missing (and aren't)

- Exact order of plays within a trick: `cards` are in play order starting with the leader, and play goes anticlockwise, so position plus leader gives order.
- Suit voids: not precomputed, but fully derivable (a player who didn't follow the led suit is void in it). Easy to add as features if a design wants them.
- Points per trick and running team totals: in `tricks` and `points`. Face-down cards a seat never saw count toward the real total but not the visible one; the real totals arrive in `end`.

## Engine API (TypeScript)

All functions are pure unless marked. Types are in `engine/src/types.ts` and `engine/src/view.ts`.

```ts
newMatch(seed: number, opts?: { dealer?: Seat; stone?: [number, number] }): MatchState
// Deals game 1 of a new match. Same seed -> same deals.

toAct(game: GameState): Seat | null
// Whose decision it is; null once the game is over.

legalActions(game: GameState): Action[]
// Every legal action for the player to move. The only authority on legality.

apply(match: MatchState, action: Action): MatchState
// Returns a new state after the action. Never changes `match`. Throws if illegal.

step(match: MatchState, action: Action): MatchState
// Fast path: changes `match` in place, no legality check, no copy. Returns `match`.

cloneMatch(match: MatchState): MatchState
// Deep copy, for branching (search).

nextGame(match: MatchState): MatchState
// Deals the next game after one ends ('over'). Throws if the game isn't over or the match is won.

viewFor(match: MatchState, seat: Seat): PlayerView
// Everything `seat` can see or remember (see above). Includes `legal`/`legalIds` when it's their turn.

encodeAction(a: Action): number          // 0..84
decodeAction(i: number): Action
legalMask(game: GameState, out?: Uint8Array): Uint8Array   // length 85, 1 = legal
```

And in `bots/src/`:

```ts
encodeView(view: PlayerView, out?: Float32Array, offset?: number): Float32Array   // length OBS_SIZE (2746)
OBS_LAYOUT: { name: string; offset: number; size: number; meaning: string }[]
naiveBot(view: PlayerView, rng: Rng): Action
```

### Core types

```ts
type Seat = 0 | 1 | 2 | 3   // anticlockwise; seat s+1 sits on s's right; partners are s and s+2
type Team = 0 | 1           // team = seat % 2
type Card = `${Rank}${Suit}`  // e.g. 'Jc', '10h'. Rank: J 9 A 10 K Q 8 7 (high to low). Suit: c d h s
type Phase = 'bid4' | 'trump4' | 'bid8' | 'trump8' | 'declare' | 'play' | 'over'

type Action =
  | { type: 'bid'; value: number }       // 160,170,180,190,200,205,...,250
  | { type: 'pass' }
  | { type: 'partner' }                  // 4-card round only
  | { type: 'redeal' }                   // 4 cards under 15 points, priority player
  | { type: 'passOn' }                   // 8 cards under 25 points, first 8-card speech
  | { type: 'trump'; card: Card }        // place this card face down as trump
  | { type: 'declare'; open: boolean }
  | { type: 'play'; card: Card }         // face up or face down is decided by the rules

interface HighBid { seat: Seat; value: number }
interface Speech { stage: 4 | 8; seat: Seat; action: 'bid' | 'pass' | 'partner'; value?: number; inSeat?: Seat }

interface SeenCard { seat: Seat; card: Card | null; faceDown: boolean; revealed: boolean }
// card is null when it went face down and this seat never saw it

interface SeenTrick {
  round: number; leader: Seat;
  cards: SeenCard[];        // play order, leader first
  winner: Seat;
  visiblePoints: number;    // points of the cards this seat saw
  revealedTrump: boolean;   // closed trump was revealed in this trick
}

type GameEnd =
  | { kind: 'played'; bid: HighBid; bidTeam: Team; points: [number, number]; made: boolean; giver: Team; stone: number }
  | { kind: 'passOn'; reason: 'noBids' }
  | { kind: 'passOn'; reason: 'lowPoints8'; seat: Seat }
  | { kind: 'redeal'; seat: Seat }
```

### `PlayerView` (what `viewFor` returns)

```ts
interface PlayerView {
  seat: Seat;                    // whose view this is
  gameNumber: number;
  dealer: Seat;
  priority: Seat;                // dealer's right: speaks first both rounds, leads round 1
  phase: Phase;
  stone: [number, number];       // per team
  matchWinner: Team | null;
  history: GameEnd[];            // earlier games in this match

  hand: Card[];                  // excludes my folded trump while it's on the table
  handCounts: number[];          // per seat
  toAct: Seat | null;
  legal: Action[];               // empty unless it's my turn
  legalIds: number[];            // same, as action numbers

  bidding: { stage: 4 | 8; turn: Seat; speaker: Seat; high: HighBid | null; speeches: Speech[] };  // current round
  auction: Speech[];             // every speech, both rounds, in order
  bid4: HighBid | null;
  bid8: HighBid | null;
  contract: HighBid | null;      // bid8 ?? bid4

  trump: {
    seat: Seat;
    open: boolean;               // declared open or revealed by a cut
    declaredOpen: boolean;
    suit: Suit | null;           // trumper always; others once open
    indicatorOnTable: boolean;   // folded card still face down on the table
    indicator: Card | null;      // that card, trumper only
    folded: Card | null;         // which card was folded: trumper always, others once public
    revealedInRound: number | null;
  } | null;

  play: {
    round: number;               // 1-8 (9 after the last trick)
    leader: Seat;
    turn: Seat;
    trick: SeenCard[];           // in progress
    ledSuit: Suit | null;
    lastTrick: SeenTrick | null; // what may be physically inspected at the table
    tricks: SeenTrick[];         // everything this seat saw, every round
    tricksWon: [number, number];
    visiblePoints: [number, number];
    unseenFaceDown: number[];    // per seat
  } | null;

  end: GameEnd | null;           // full result once phase is 'over'
}
```

`PlayerView` is plain JSON, so it crosses into Python unchanged (see `views()` below).

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

Card order everywhere (`PACK`) is clubs, diamonds, hearts, spades, and within a suit J, 9, A, 10, K, Q, 8, 7. Whether a played card goes face down isn't a separate action; the engine decides it from the rules (closed trump + can't follow suit = face down). Typically only a handful of actions are legal at once (e.g. 1-8 cards in play, a few bid values plus pass in betting), so action masking matters.

### Speed

Single core, Node 24, Core Ultra 7 265K:

| | |
|---|---|
| random legal moves, pure `apply` | ~1.25M actions/s |
| random legal moves, in-place `step` | ~2.5M actions/s (~60k games/s) |
| `legalActions` / `viewFor` / `legalMask` | ~0.15 / 0.8 / 0.5 µs |

A game averages about 42 actions with random play.

## The training environment (bots/)

Training will happen in Python, but the engine is TypeScript. Rather than port it, Python launches Node worker processes, each holding a batch of games. Every call sends one action per game and gets back numpy arrays for the whole batch, so the cost of crossing between processes is spread over hundreds of games.

### Python API (`bots/python/bots304`)

```python
VecEnv(num_envs=256, seed=0, agent_seats=(0, 1, 2, 3), opponent="naive", check_legal=False)
MultiVecEnv(workers, num_envs=256, seed=0, **same_options)   # workers * num_envs games, run in parallel

env.reset() -> Batch
env.step(actions: np.ndarray[int]) -> Batch      # one action number per game
env.views() -> list[dict]                        # the full PlayerView (as above) for the seat to act in each game
env.stats() -> dict                              # games / played / matches / agentSteps / botSteps counters
env.close()
env.obs_size      # 2746
env.action_count  # 85
env.layout        # the observation layout table below, as a list of dicts

@dataclass
class Batch:
    obs: np.ndarray     # (n, 2746) float32, observation for the seat to act, values in 0..1
    mask: np.ndarray    # (n, 85) uint8, 1 = legal action
    seat: np.ndarray    # (n,) int8, absolute seat to act (0-3)
    reward: np.ndarray  # (n, 4) float32, one per absolute seat, for the game that just ended
    done: np.ndarray    # (n,) bool, a game ended during this step
```

Each `Batch` is freshly allocated, so it's safe to keep (e.g. in a replay buffer).

- **Auto-reset.** When `done[i]` is set, the slot has already moved on: `obs[i]` is the next game's first decision.
- **Agent vs bot seats.** `agent_seats` picks which seats the learner controls. The default, all four, is self-play. `[0, 2]` trains one team.
- **Opponents.** `opponent` decides who plays the other seats: `"naive"` or `"random"`.
- **`check_legal`** makes the server reject illegal actions instead of trusting the mask.
- **Two ways to read the state:**
  - `obs`: the fast fixed-size vector, for a neural network.
  - `views()`: the complete structured `PlayerView`, for debugging or for building a different encoding in Python. It's much slower (JSON), so don't call it every step at scale.

**Episode and reward.** One episode is one game. Reward only arrives at the end. When a game is played out, the team that gave away k stone gets +k for both seats and the other team gets -k (zero-sum, partners share). Pass-ons and redeals give 0. There's no shaping yet (e.g. card points) and no match-level reward. Stone counts are in the observation, so a policy could learn match-situation play.

**Multi-agent shape.** It's turn-based like PettingZoo's AEC model: each step is a decision for whichever agent seat is to act, and with all four seats as agents consecutive decisions come from different seats. The trainer has to attribute the end-of-game reward to each seat's decisions itself (e.g. keep per-seat trajectories). For a DQN-style agent, the transition for seat s goes from one of s's decisions to s's next decision (or the game end), not to the next row of the batch.

### Observation layout (2746 floats, all in 0..1)

Everything is relative to the seat being encoded, so one network can play any seat: rel 0 = me, rel 1 = my right (acts after me), rel 2 = partner, rel 3 = my left. The encoder only reads the `PlayerView`, so it can't leak hidden information (there's a test for that). It's written in TypeScript so the website can run the identical encoder in the browser when it serves a trained model.

| Block | Offset | Size | Meaning |
|---|---|---|---|
| `hand` | 0 | 32 | my cards, one bit per card (PACK order) |
| `indicator` | 32 | 32 | my face-down trump card, if I am the trumper and it is still on the table |
| `phase` | 64 | 7 | one-hot: bid4, trump4, bid8, trump8, declare, play, over |
| `dealer` | 71 | 4 | dealer, one-hot by relative seat |
| `priority` | 75 | 4 | priority player (dealer's right: speaks first, leads round 1), relative seat |
| `to_act` | 79 | 4 | who is to act, one-hot by relative seat |
| `stone` | 83 | 2 | stone left for my team and the other team, divided by 10 |
| `hand_counts` | 85 | 4 | cards in hand per relative seat, divided by 8 |
| `bid_stage` | 89 | 2 | current betting round is the 4-card / 8-card one |
| `high_value` | 91 | 16 | current high bid in this betting round: one-hot over the 15 bid values, last slot = no bid |
| `high_seat` | 107 | 4 | holder of the current high bid, relative seat |
| `bid4_value` | 111 | 16 | winning 4-card bid, same encoding (last slot = none yet) |
| `bid4_seat` | 127 | 4 | winner of the 4-card bid, relative seat |
| `bid8_value` | 131 | 16 | winning 8-card bid, same encoding |
| `bid8_seat` | 147 | 4 | winner of the 8-card bid, relative seat |
| `speeches` | 151 | 20 | per relative seat: [has spoken this round, last speech was bid, pass, partner, none] |
| `speaking_for_partner` | 171 | 1 | I am bidding in my partner's seat after they said "partner" |
| `auction4` | 172 | 552 | every 4-card speech in order, 24 slots of [relative seat 4, bid/pass/partner 3, bid value 15, spoke in partner's seat 1]; unused slots zero |
| `auction8` | 724 | 552 | every 8-card speech in order, same encoding |
| `trumper` | 1276 | 5 | trumper by relative seat, last slot = none yet |
| `trump_suit` | 1281 | 5 | trump suit if I know it (I am trumper or trump is open), last slot = unknown |
| `trump_flags` | 1286 | 4 | [trump is open, it was declared open (not revealed by a cut), the folded trump is still on the table, I am the trumper] |
| `folded_card` | 1290 | 32 | which card the trumper folded, if I know it (I am the trumper, or it was flipped / shown / played face up) |
| `round` | 1322 | 8 | current round 1-8, one-hot (all zero outside play) |
| `leader` | 1330 | 4 | leader of the current trick, relative seat |
| `led_suit` | 1334 | 4 | suit led to the current trick (all zero before the lead) |
| `trick` | 1338 | 136 | current trick, per relative seat: [played, played face down and hidden from me, card 32 bits] |
| `tricks` | 1474 | 1136 | every completed trick, slot r-1 for round r: [leader 4, winner 4, points I saw /304, trump revealed here 1, per relative seat: card 32 + face down and unseen 1] |
| `seen` | 2610 | 128 | per relative seat: every card I have seen them play this game (a summary of the tricks block plus the current trick) |
| `hidden_counts` | 2738 | 4 | per relative seat: face-down cards they played that I never saw, divided by 8 |
| `tricks_won` | 2742 | 2 | tricks won by my team / the other team, divided by 8 |
| `points` | 2744 | 2 | points I can see each team has won, divided by 304 |

Notes:

- **Mostly sparse.** Nearly all of it is 0/1. The few fractions are stone/10, card counts/8 and points/304.
- **Some blocks are summaries.** `seen`, `speeches`, `tricks_won` and `points` can be derived from the full-history blocks; they're there as convenient summaries.
- **Auctions cap at 24 speeches per round.** Real auctions are much shorter; if one ever ran longer, the latest 24 are kept.
- **No suit-void features.** They're derivable from the tricks; easy to add.
- **The layout isn't fixed.** It can change freely. If a design wants a different encoding (embeddings per card, a transformer over the trick sequence, etc.), it can be built from `views()` in Python first, then ported to the TypeScript encoder for speed and browser use.

### Environment speed (random actions, no network)

Dev machine, 256 games per worker:

| setup | agent decisions/s | games/s |
|---|---|---|
| self-play, 1 worker | ~97k | ~2.1k |
| self-play, 8 workers | ~365k | ~8.1k |
| self-play, 16 workers | ~375k | ~8.4k |
| one agent seat vs naive bots, 16 workers | ~275k | ~22k |

Self-play averages about 46 agent decisions per game (all four seats); with one agent seat it's about 12. Each self-play step moves about 11 KB of observation per game, so at the top end the limit is memory bandwidth on the Python side. That's still far more than a GPU learner will consume.

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
- 304 has imperfect information, a two-stage auction, partnership play (shared reward, no communication beyond play), and closed-trump hidden-suit mechanics. Worth weighing approaches with that in mind: e.g. DQN or PPO self-play with action masking, recurrent vs feed-forward policies (the observation already carries the full history), population or league training, determinization/ISMCTS with learned priors, NFSP or Deep CFR-style methods. Also separating or sharing networks for bidding vs play.
