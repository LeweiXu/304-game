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
frontend/   React + Vite website (rules page, game table, settings). Deployed on Vercel.
backend/    FastAPI on a home server. Only a health check today; multiplayer later.
public/     docs: rules.md, play_invariants.md, caps_formalism.md, DEPLOYMENT.md, this file
```

The engine is the single source of truth for the rules. The website, the bots and the training environment all call it; nothing re-implements rules.

## How a game flows (engine phases)

1. **bid4**: betting on the first 4 cards. Actions: bid (160-250), PCC, pass, partner (ask your partner to bid in your seat; only the first two speakers, first speech only), redeal (priority player with under 15 points).
2. **trump4**: the 4-card winner places one card face down; its suit is trump.
3. Second deal (automatic), then **bid8**: betting on 8 cards. Bid (220 "Honest" to 250), PCC, pass, pass-on (under 25 points, first speech only). Skipped after a PCC bid on 4 cards.
4. **trump8**: only if someone bid on 8 cards; the old trumper takes their card back and the new one picks.
5. **declare**: the trumper chooses closed trump (suit stays secret) or open trump. A trumper holding all eight trumps may instead declare an absolute hand (a pass-on). Skipped for PCC.
6. **show**: open trump declared by a trumper without priority, or any PCC: the trumper picks one trump card from their hand to show the table.
7. **play**: 8 tricks ("rounds"). In closed trump, a player who can't follow suit plays face down; face-down trumps cut, and the first cut reveals trump. Detailed trumper restrictions are rules §T-1 to §T-6. During play any player may call Spoilt Trumps (once each), and with the claim-threshold option on, a player whose team has reached its points may claim the game.
8. **over**: scoring. If the bidding team reached its bid, it gives away stone (1-3 depending on the bid, 5 for PCC); if not, the opponents give away stone (2-4, 5 for PCC). Each team starts with 10; first to give away all 10 wins the match.

One match is many games. A game can also end early: nobody bids (pass-on), a redeal, an 8-card pass-on, an absolute hand, a correct Spoilt Trumps call, a threshold claim, or a lost PCC. Pass-ons, redeals, absolute hands and Spoilt Trumps score nothing.

### Rules implemented vs not

Implemented: all of betting (partnering, every skip/termination rule §B-1 to §B-9, redeal, pass-ons, PCC), trump selection, open and closed trump with the choice of which trump card to show, closed-trump face-down play and the trumper's private inspection of folded cards, overcuts, trump reveal, exhausted trumps, PCC play (partner sits out, trumper leads, 3-card tricks, 5 stone), absolute hand (goodwill declaration and the opposition's post-game claim), Spoilt Trumps (with the 1-stone penalty for a false call), stone/match scoring, light slap-shuffling with the cut and the riffle remedy, and the optional claim-threshold rule.

Not implemented yet: **Caps** (calling a sweep with a declared card order, plus late, early, wrong and external caps) and the optional **Claim Balance** rule. Without caps every game that isn't decided early plays all 8 tricks. Caps will add actions (a call plus a card order) and observation features, so expect the env to be versioned. See "Caps: the plan" at the end.

The other in-game penalties in `rules.md` are about table behaviour (talking, signalling, illegal plays) that the online engine already makes impossible, so the false Spoilt Trumps call is the only penalty.

### House-rule options (per match)

`RuleOptions`, chosen per match (the website's settings panel sets them; the env takes them as a `rules` option). Each game copies the options when it's dealt, so changes apply from the next game.

| Option | Default | Effect |
|---|---|---|
| `shuffle` | `'random'` | `'random'`: full shuffle every deal. `'slap'`: start from the order the last game's cards were gathered in, 1-3 slap shuffles, then a cut (or a tap); three redeals in a row from one seat earn a riffle. Light shuffling keeps clumps, so hands run stronger. |
| `caps` | `true` | Caps rules on or off. Stored only; caps isn't implemented yet. |
| `claimBalance` | `false` | Stored only; not implemented yet. |
| `claimThreshold` | `false` | Adds the `claim` action (see below). |

The website also has an "assistance" display setting (show points per trick and running totals). It's UI only; the engine always exposes the points a seat can see.

### Interpretation calls the code makes

- **Stone only goes down.** Whichever team wins the game removes stone from its own pile. (rules.md phrases a failed bid as the bidders "receiving" stone; it means the opponents give theirs away. rules.md says this explicitly.)
- **Bids above 250 are PCC only.** PCC is allowed on any speech in either round. A PCC on 4 cards skips 8-card betting, since nothing outranks it.
- **A PCC game ends as soon as the opponents win a round**, because it's lost at that point.
- **The holder skip on 8 cards.** In 8-card betting, only an 8-card bid counts as the "current bid" for the holder skip (§B-2), so the 4-card trumper can still speak on 8 cards.
- **Open trump.** A trumper without priority shows a trump card of their choice; a trumper with priority reveals by leading trump in round 1. For PCC the trumper always shows a card, and isn't forced to lead trump.
- **Absolute hand means all eight trumps.** "Guaranteed to win all 8 rounds whatever the deal, however others play, whoever leads" can only hold for all eight trumps: with any non-trump card, some deal lets an opponent lead that suit (or forces you to lead it) while another opponent, void in it, cuts with an outstanding trump. Only the trumper can hold all eight. If the trumper sweeps holding them without declaring, the opposition's post-game claim is applied automatically (it's always in their interest), so the game becomes a pass-on. Not available in PCC.
- **Spoilt Trumps.** A call is right if the trumping team's opponents held no trump at all in the 8 cards they were dealt. Each seat may call once per game, any time during play before the last card. A wrong call costs the caller's team 1 stone (their opponents give one away), settled when the game ends, and play carries on.
- **Claim threshold.** A claim needs the claimer's team to have reached its threshold counting only cards the claimer has seen, so a claim can't be wrong. It ends the game with the claiming team winning. Not claiming isn't penalised.

## What the agent can see

The design principle: **an agent sees exactly what a human player at the table can see or remember, assuming a perfect memory, and nothing else.** That includes things that are hard for a person to memorise, like exactly who played which card in every trick. It excludes anything a person couldn't know: other players' hands, face-down cards they weren't allowed to look at, and the trump suit before it's revealed (unless they are the trumper).

This is enforced in one place: `viewFor(match, seat)` builds a `PlayerView`, and bots, the UI and the RL encoder only ever receive a `PlayerView`. The full `MatchState` (all hands, the deck, the dealt hands) never reaches an agent.

### Everything a player knows, and where it lives

| What a player knows | `PlayerView` field | Observation block (vector) |
|---|---|---|
| Which betting round or phase it is | `phase`, `bidding.stage` | `phase`, `bid_stage` |
| Current round number during play | `play.round` | `round` |
| The house-rule options in force | `rules` | `rules` |
| Their own cards | `hand` | `hand` |
| How many cards everyone holds | `handCounts` | `hand_counts` |
| Who dealt, who has priority (speaks first, leads round 1) | `dealer`, `priority` | `dealer`, `priority` |
| Whose turn it is | `toAct` | `to_act` |
| Every speech of both betting rounds, in order: who, bid/PCC/pass/partner, value, whether they spoke in their partner's seat | `auction` (and `bidding.speeches` for the current round) | `auction4`, `auction8` (plus a latest-speech summary in `speeches`) |
| Current high bid and holder | `bidding.high` | `high_value`, `high_seat` |
| Winning 4-card bid, winning 8-card bid, the contract being played | `bid4`, `bid8`, `contract` | `bid4_value`, `bid4_seat`, `bid8_value`, `bid8_seat` |
| PCC: whether the contract is PCC and who sits out | `contract.value === 999`, `pccOut` | `pcc` |
| Points each team needs to win | `thresholds` | `thresholds` |
| Who is trumping | `trump.seat` | `trumper` |
| The trump suit (trumper always; everyone once open) | `trump.suit` | `trump_suit` |
| Whether trump is open, whether it was declared open or revealed by a cut, and in which round | `trump.open`, `trump.declaredOpen`, `trump.revealedInRound` | `trump_flags`, plus the per-trick "trump revealed here" bit in `tricks` |
| The trump card shown on an open declaration (or for PCC) | `trump.shown` | `shown_card` |
| Whether round 1 must be led with trump (open with priority) | `trump.mustLeadTrump` | (implied by the legal mask) |
| Whether the folded trump card is still on the table; for the trumper, which card it is | `trump.indicatorOnTable`, `trump.indicator` | `trump_flags`, `indicator` |
| Which card was folded, once it's been flipped on a cut reveal or played face up | `trump.folded` | `folded_card` |
| The trick in progress: who led, each card played so far in order, which went face down | `play.leader`, `play.trick`, `play.ledSuit` | `leader`, `trick`, `led_suit` |
| Every completed trick: who led, who played exactly which card (or that it went face down unseen), who won, the points, whether trump was revealed in it | `play.tricks` | `tricks` (8 slots, one per round) |
| Folded cards the player was allowed to see: their own, revealed trumps, and (for the trumper) every folded card once each trick finished | inside `play.trick` / `play.tricks` (`card` is non-null) | inside `trick` / `tricks` |
| How many face-down cards each player played that this player never saw | `play.unseenFaceDown` | `hidden_counts` |
| Tricks won and visible points per team so far | `play.tricksWon`, `play.visiblePoints` | `tricks_won`, `points` |
| Spoilt Trumps calls so far and penalties pending | `spoiltCalled`, `penalties` | `spoilt_called`, `penalties` |
| Stone left per team, the match score | `stone` | `stone` |
| Results of earlier games in the match | `history` | (not encoded; stone already captures the score) |
| How the game ended, with full points | `end` | (episode end; reward) |
| What they're allowed to do right now | `legal`, `legalIds` | the separate legal-action `mask` |

### What stays hidden

- **Other players' hands.** Only the counts are known.
- **A face-down card.** It's visible only to:
  - the player who played it;
  - everyone, if it was a trump (trumps are revealed when the trick resolves);
  - the trumper, once the trick is finished (the rules have the trumper inspect folded cards privately).

  A non-trump "minus" stays hidden from the other two players for good. They only know its owner played *something* face down.
- **The trump suit**, from non-trumpers, until it's opened by declaration or revealed by a cut.
- **The identity of the folded trump card**, from non-trumpers, until it's flipped on a cut reveal or played face up. A card shown on an open declaration is public, but nobody else knows whether it was the folded one.
- **Who was dealt which cards.** That decides Spoilt Trumps and absolute hands, but the engine settles those itself.
- **The 16 undealt cards** during 4-card betting.

### Things you might think are missing (and aren't)

- Exact order of plays within a trick: `cards` are in play order starting with the leader, and play goes anticlockwise (skipping a PCC partner), so position plus leader gives order.
- Suit voids: not precomputed, but fully derivable (a player who didn't follow the led suit is void in it). Easy to add as features if a design wants them.
- Points per trick and running team totals: in `tricks` and `points`. Face-down cards a seat never saw count toward the real total but not the visible one; the real totals arrive in `end`.

## Engine API (TypeScript)

All functions are pure unless marked. Types are in `engine/src/types.ts` and `engine/src/view.ts`.

```ts
newMatch(seed: number, opts?: { dealer?: Seat; stone?: [number, number]; rules?: Partial<RuleOptions> }): MatchState
// Deals game 1 of a new match. Same seed (and options) -> same deals.

withRules(match: MatchState, rules: Partial<RuleOptions>): MatchState
// Changes the options for games not yet dealt.

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

encodeAction(a: Action): number          // 0..120
decodeAction(i: number): Action
legalMask(game: GameState, out?: Uint8Array): Uint8Array   // length 121, 1 = legal

stoneAtStake(bid: number): [win, loss]   // [1,2] / [2,3] / [3,4] / [5,5] for PCC
thresholdFor(bid: number, isBidTeam: boolean): number   // bid, or 305 - bid
isAbsoluteHand(cards: Card[], trump: Suit): boolean     // all eight trumps
```

And in `bots/src/`:

```ts
encodeView(view: PlayerView, out?: Float32Array, offset?: number): Float32Array   // length OBS_SIZE (2847)
OBS_LAYOUT: { name: string; offset: number; size: number; meaning: string }[]
naiveBot(view: PlayerView, rng: Rng): Action
```

### Core types

```ts
type Seat = 0 | 1 | 2 | 3   // anticlockwise; seat s+1 sits on s's right; partners are s and s+2
type Team = 0 | 1           // team = seat % 2
type Card = `${Rank}${Suit}`  // e.g. 'Jc', '10h'. Rank: J 9 A 10 K Q 8 7 (high to low). Suit: c d h s
type Phase = 'bid4' | 'trump4' | 'bid8' | 'trump8' | 'declare' | 'show' | 'play' | 'over'
const PCC = 999             // the PCC bid's value in HighBid / Speech

interface RuleOptions { shuffle: 'random' | 'slap'; caps: boolean; claimBalance: boolean; claimThreshold: boolean }

type Action =
  | { type: 'bid'; value: number }       // 160,170,180,190,200,205,...,250
  | { type: 'pcc' }                      // Partner Closed Caps
  | { type: 'pass' }
  | { type: 'partner' }                  // 4-card round only
  | { type: 'redeal' }                   // 4 cards under 15 points, priority player
  | { type: 'passOn' }                   // 8 cards under 25 points, first 8-card speech
  | { type: 'trump'; card: Card }        // place this card face down as trump
  | { type: 'declare'; open: boolean }
  | { type: 'show'; card: Card }         // open trump / PCC: show this trump card
  | { type: 'absolute' }                 // goodwill: all eight trumps, pass-on
  | { type: 'spoilt' }                   // call Spoilt Trumps
  | { type: 'claim' }                    // claim the game (claim-threshold option)
  | { type: 'play'; card: Card }         // face up or face down is decided by the rules

interface HighBid { seat: Seat; value: number }   // value is PCC for a PCC bid
interface Speech { stage: 4 | 8; seat: Seat; action: 'bid' | 'pass' | 'partner'; value?: number; inSeat?: Seat }
interface Penalty { seat: Seat; reason: 'falseSpoilt'; stone: number }

interface SeenCard { seat: Seat; card: Card | null; faceDown: boolean; revealed: boolean }
// card is null when it went face down and this seat never saw it

interface SeenTrick {
  round: number; leader: Seat;
  cards: SeenCard[];        // play order, leader first (3 cards in PCC)
  winner: Seat;
  visiblePoints: number;    // points of the cards this seat saw
  revealedTrump: boolean;   // closed trump was revealed in this trick
}

type GameEnd =
  | { kind: 'played'; bid: HighBid; bidTeam: Team; points: [number, number]; made: boolean; giver: Team; stone: number;
      pcc: boolean; claimedBy: Seat | null; tricks: [number, number] }
  | { kind: 'passOn'; reason: 'noBids' }
  | { kind: 'passOn'; reason: 'lowPoints8'; seat: Seat }
  | { kind: 'redeal'; seat: Seat }
  | { kind: 'absolute'; seat: Seat; how: 'goodwill' | 'claim' }
  | { kind: 'spoilt'; seat: Seat }
```

### `PlayerView` (what `viewFor` returns)

```ts
interface PlayerView {
  seat: Seat;                    // whose view this is
  gameNumber: number;
  dealer: Seat;
  priority: Seat;                // dealer's right: speaks first both rounds, leads round 1 (except PCC)
  phase: Phase;
  stone: [number, number];       // per team
  matchWinner: Team | null;
  history: GameEnd[];            // earlier games in this match
  rules: RuleOptions;            // options in force for this game

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
  pccOut: Seat | null;           // PCC: partner sitting out
  thresholds: [number, number] | null;   // points each team needs; null before a contract and for PCC

  trump: {
    seat: Seat;
    open: boolean;               // declared open or revealed by a cut
    declaredOpen: boolean;
    suit: Suit | null;           // trumper always; others once open
    indicatorOnTable: boolean;   // folded card still face down on the table
    indicator: Card | null;      // that card, trumper only
    folded: Card | null;         // which card was folded: trumper always, others once public
    revealedInRound: number | null;
    shown: Card | null;          // trump card shown on an open declaration / PCC
    mustLeadTrump: boolean;      // open with priority: round 1 must be led with trump
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

  spoiltCalled: boolean[];       // per seat, this game
  penalties: Penalty[];          // this game, settled at the end
  end: GameEnd | null;           // full result once phase is 'over'
}
```

`PlayerView` is plain JSON, so it crosses into Python unchanged (see `views()` below).

### Action space (121 discrete actions)

| Indices | Action |
|---|---|
| 0-14 | bid 160, 170, 180, 190, 200, 205, 210, 215, 220, 225, 230, 235, 240, 245, 250 |
| 15 | PCC |
| 16 | pass |
| 17 | partner |
| 18 | redeal |
| 19 | pass-on (8 cards) |
| 20-21 | declare closed / open trump |
| 22 | absolute hand (goodwill) |
| 23 | Spoilt Trumps |
| 24 | claim (threshold) |
| 25-56 | choose trump card (32 cards) |
| 57-88 | show trump card (32 cards) |
| 89-120 | play card (32 cards) |

Card order everywhere (`PACK`) is clubs, diamonds, hearts, spades, and within a suit J, 9, A, 10, K, Q, 8, 7. Whether a played card goes face down isn't a separate action; the engine decides it from the rules (closed trump + can't follow suit = face down). Typically only a handful of actions are legal at once (e.g. 1-8 cards plus maybe Spoilt Trumps in play, a few bid values plus PCC and pass in betting), so action masking matters. Note that Spoilt Trumps is legal on almost every play turn (once per seat per game): a learner will try it and pay the 1-stone penalty until it learns when it's right.

### Speed

Single core, Node 24, Core Ultra 7 265K:

| | |
|---|---|
| random legal moves, pure `apply` | ~1.15M actions/s |
| random legal moves, in-place `step` | ~1.8M actions/s |
| `legalActions` / `viewFor` / `legalMask` | ~0.2 / 0.6 / 0.8 µs |

## The training environment (bots/)

Training will happen in Python, but the engine is TypeScript. Rather than port it, Python launches Node worker processes, each holding a batch of games. Every call sends one action per game and gets back numpy arrays for the whole batch, so the cost of crossing between processes is spread over hundreds of games.

### Python API (`bots/python/bots304`)

```python
VecEnv(num_envs=256, seed=0, agent_seats=(0, 1, 2, 3), opponent="naive", check_legal=False, rules=None)
MultiVecEnv(workers, num_envs=256, seed=0, **same_options)   # workers * num_envs games, run in parallel
# rules: dict of RuleOptions, e.g. {"shuffle": "slap", "claimThreshold": True}

env.reset() -> Batch
env.step(actions: np.ndarray[int]) -> Batch      # one action number per game
env.views() -> list[dict]                        # the full PlayerView (as above) for the seat to act in each game
env.stats() -> dict                              # games / played / matches / agentSteps / botSteps counters
env.close()
env.obs_size      # 2847
env.action_count  # 121
env.layout        # the observation layout table below, as a list of dicts

@dataclass
class Batch:
    obs: np.ndarray     # (n, 2847) float32, observation for the seat to act, values in 0..1
    mask: np.ndarray    # (n, 121) uint8, 1 = legal action
    seat: np.ndarray    # (n,) int8, absolute seat to act (0-3)
    reward: np.ndarray  # (n, 4) float32, one per absolute seat, for the game that just ended
    done: np.ndarray    # (n,) bool, a game ended during this step
```

Each `Batch` is freshly allocated, so it's safe to keep (e.g. in a replay buffer).

- **Auto-reset.** When `done[i]` is set, the slot has already moved on: `obs[i]` is the next game's first decision.
- **Agent vs bot seats.** `agent_seats` picks which seats the learner controls. The default, all four, is self-play. `[0, 2]` trains one team.
- **Opponents.** `opponent` decides who plays the other seats: `"naive"` or `"random"`.
- **`check_legal`** makes the server reject illegal actions instead of trusting the mask.
- **`rules`** sets the house-rule options for every match.
- **Two ways to read the state:**
  - `obs`: the fast fixed-size vector, for a neural network.
  - `views()`: the complete structured `PlayerView`, for debugging or for building a different encoding in Python. It's much slower (JSON), so don't call it every step at scale.

**Episode and reward.** One episode is one game. Reward only arrives at the end. When a game is played out (or ends early by a claim or a lost PCC), the team that gave away k stone gets +k for both seats and the other team gets -k (zero-sum, partners share). A false Spoilt Trumps call adds -1 for the caller's team and +1 for the other team. Pass-ons, redeals, absolute hands and correct Spoilt Trumps calls give 0 (apart from any penalty). There's no shaping yet (e.g. card points), and no match-level reward. Stone counts are in the observation, so a policy could learn match-situation play.

**Multi-agent shape.** It's turn-based like PettingZoo's AEC model: each step is a decision for whichever agent seat is to act, and with all four seats as agents consecutive decisions come from different seats. The trainer has to attribute the end-of-game reward to each seat's decisions itself (e.g. keep per-seat trajectories). For a DQN-style agent, the transition for seat s goes from one of s's decisions to s's next decision (or the game end), not to the next row of the batch.

### Observation layout (2847 floats, all in 0..1)

Everything is relative to the seat being encoded, so one network can play any seat: rel 0 = me, rel 1 = my right (acts after me), rel 2 = partner, rel 3 = my left. The encoder only reads the `PlayerView`, so it can't leak hidden information (there's a test for that). It's written in TypeScript so the website can run the identical encoder in the browser when it serves a trained model.

| Block | Offset | Size | Meaning |
|---|---|---|---|
| `hand` | 0 | 32 | my cards, one bit per card (PACK order) |
| `indicator` | 32 | 32 | my face-down trump card, if I am the trumper and it is still on the table |
| `phase` | 64 | 8 | one-hot: bid4, trump4, bid8, trump8, declare, show, play, over |
| `rules` | 72 | 4 | house-rule options in force: [caps, claim balance, claim threshold, slap shuffling] |
| `dealer` | 76 | 4 | dealer, one-hot by relative seat |
| `priority` | 80 | 4 | priority player (dealer's right: speaks first, leads round 1), relative seat |
| `to_act` | 84 | 4 | who is to act, one-hot by relative seat |
| `stone` | 88 | 2 | stone left for my team and the other team, divided by 10 |
| `hand_counts` | 90 | 4 | cards in hand per relative seat, divided by 8 |
| `bid_stage` | 94 | 2 | current betting round is the 4-card / 8-card one |
| `high_value` | 96 | 17 | current high bid in this betting round: one-hot over the 15 bid values then PCC, last slot = no bid |
| `high_seat` | 113 | 4 | holder of the current high bid, relative seat |
| `bid4_value` | 117 | 17 | winning 4-card bid, same encoding (last slot = none yet) |
| `bid4_seat` | 134 | 4 | winner of the 4-card bid, relative seat |
| `bid8_value` | 138 | 17 | winning 8-card bid, same encoding |
| `bid8_seat` | 155 | 4 | winner of the 8-card bid, relative seat |
| `pcc` | 159 | 5 | PCC: [partner sitting out, by relative seat (4), the contract is PCC] |
| `thresholds` | 164 | 2 | points my team / the other team needs to win the game, divided by 304 (zero before a contract and for PCC) |
| `speeches` | 166 | 20 | per relative seat: [has spoken this round, last speech was bid, pass, partner, none] |
| `speaking_for_partner` | 186 | 1 | I am bidding in my partner's seat after they said "partner" |
| `auction4` | 187 | 576 | every 4-card speech in order, 24 slots of [relative seat 4, bid/pass/partner 3, bid value 16 (15 numeric then PCC), spoke in partner's seat 1]; unused slots zero |
| `auction8` | 763 | 576 | every 8-card speech in order, same encoding |
| `trumper` | 1339 | 5 | trumper by relative seat, last slot = none yet |
| `trump_suit` | 1344 | 5 | trump suit if I know it (I am trumper or trump is open), last slot = unknown |
| `trump_flags` | 1349 | 4 | [trump is open, it was declared open (not revealed by a cut), the folded trump is still on the table, I am the trumper] |
| `folded_card` | 1353 | 32 | which card the trumper folded, if I know it (I am the trumper, or it was flipped on a cut reveal or played face up) |
| `shown_card` | 1385 | 32 | the trump card the trumper showed the table on an open declaration or for PCC |
| `round` | 1417 | 8 | current round 1-8, one-hot (all zero outside play) |
| `leader` | 1425 | 4 | leader of the current trick, relative seat |
| `led_suit` | 1429 | 4 | suit led to the current trick (all zero before the lead) |
| `trick` | 1433 | 136 | current trick, per relative seat: [played, played face down and hidden from me, card 32 bits] |
| `tricks` | 1569 | 1136 | every completed trick, slot r-1 for round r: [leader 4, winner 4, points I saw /304, trump revealed here 1, per relative seat: card 32 + face down and unseen 1] |
| `seen` | 2705 | 128 | per relative seat: every card I have seen them play this game (a summary of the tricks block plus the current trick) |
| `hidden_counts` | 2833 | 4 | per relative seat: face-down cards they played that I never saw, divided by 8 |
| `tricks_won` | 2837 | 2 | tricks won by my team / the other team, divided by 8 |
| `points` | 2839 | 2 | points I can see each team has won, divided by 304 |
| `spoilt_called` | 2841 | 4 | per relative seat: has called Spoilt Trumps this game |
| `penalties` | 2845 | 2 | penalty stone pending against my team / the other team this game, divided by 4 |

Notes:

- **Mostly sparse.** Nearly all of it is 0/1. The few fractions are stone/10, card counts/8, points and thresholds/304, and penalties/4.
- **Some blocks are summaries.** `seen`, `speeches`, `tricks_won` and `points` can be derived from the full-history blocks; they're there as convenient summaries.
- **Auctions cap at 24 speeches per round.** Real auctions are much shorter; if one ever ran longer, the latest 24 are kept.
- **No suit-void features.** They're derivable from the tricks; easy to add.
- **The layout isn't fixed.** It can change freely. If a design wants a different encoding (embeddings per card, a transformer over the trick sequence, etc.), it can be built from `views()` in Python first, then ported to the TypeScript encoder for speed and browser use.

### Environment speed (random actions, no network)

Dev machine, 256 games per worker:

| setup | agent decisions/s | games/s |
|---|---|---|
| self-play, 1 worker | ~110k | ~7k |
| self-play, 8 workers | ~400k | ~27k |
| self-play, 16 workers | ~410k | ~28k |
| one agent seat vs naive bots, 16 workers | ~280k | ~24k |

Games per second depend heavily on the policy: random self-play now often bids PCC and loses it in the first trick, which makes games short. With a sensible policy expect about 40-50 decisions per game in self-play and about 12 with one agent seat. Each self-play step moves about 11 KB of observation per game, so at the top end the limit is memory bandwidth on the Python side. That's still far more than a GPU learner will consume.

### Baselines

Measured over about 20k games each (before PCC and Spoilt Trumps were in the action space; random play now does even worse because it bids PCC and calls Spoilt Trumps at random):

- Random team (seats 0 and 2 playing uniformly random legal moves) vs naive team: random averages **-2.9 stone per game** and wins about **4%** of played-out games, mostly because random bidding overreaches.
- Random vs random: about 50/50, as expected.

So the naive bot is a sanity-check opponent, not a strong one. It opens with a decent 4-card hand, rarely competes, never bids PCC, makes trump its longest suit, wins tricks cheaply, gives points to a winning partner, cuts only when the trick has points worth taking, takes an absolute hand, claims the threshold when it can, and never calls Spoilt Trumps.

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

## Caps: the plan

Caps isn't implemented. `rules.md` ("Precise definition" under Caps) defines it exactly; in short: on one of their own turns, a player's team having won every round so far, there is a **declared order** of all the player's remaining cards such that, in every deal of the unseen cards consistent with what the player knows, and for every legal play by the other three players (partner included), playing that order wins every remaining round. Calling means declaring the order. Correct / Late / Early / Wrong are defined in terms of that predicate and each player's **first opportunity**.

The planned implementation:

- **Predicate** `canCaps(view, order?)`: for a given order, an adversarial search where the other players' cards are chosen lazily from the unseen pool (any card a player plays must keep the rest of the deal consistent: hand sizes, known voids, the trumper holding the folded card), so "every deal" and "every play" collapse into one search for a single losing line. Equivalent low cards are merged (cards between the same two known higher and lower cards behave the same), and the search stops at the first lost round. "Some order exists" tries orders in a sensible sequence (winners first, trump first) with the same search.
- **Feasibility checks** are a tiny flow problem (4 suits x 3 players with void constraints), cheap enough to run at every node.
- **Cost** is small late in a game and grows early. A quick refuter (random consistent deals plus a greedy adversary) disposes of almost all early positions; only survivors get the exact search.
- **When it runs:** on a call (judge the declared order), and when a team wins all 8 without calling (replay the game, checking each of the team's turns in order, to find a first opportunity for Late Caps). Not on every turn of every game, which keeps training throughput high.
- **Testing:** a brute-force reference (enumerate every consistent deal and every play) for endgames of 2-3 cards, compared against the fast search on thousands of random positions, plus the worked examples in `rules.md`.
- **For agents:** a `caps` action followed by the order. Either the agent picks the order card by card (more actions), or the engine finds a valid order when the agent calls (an agent that calls when no order exists is penalised). Undecided; affects the action space.

Claim Balance uses the same predicate without the "won every round so far" condition, so it comes almost for free once caps exists.

## Constraints and preferences for the bot design

- Bots must only use their `PlayerView`, never hidden information. The env and encoder already enforce this.
- Bots should be deterministic given (view, seed).
- Several difficulty levels are wanted, not just one strong bot.
- Where trained models run is open. Options: in the browser (the site is a static Vercel deploy; e.g. ONNX Runtime Web, needs small models), or behind the FastAPI backend on the home server (i7-9700 + RTX 2060).
- Caps is coming later and will change the action space and observation.
- 304 has imperfect information, a two-stage auction, partnership play (shared reward, no communication beyond play), and closed-trump hidden-suit mechanics. Worth weighing approaches with that in mind: e.g. DQN or PPO self-play with action masking, recurrent vs feed-forward policies (the observation already carries the full history), population or league training, determinization/ISMCTS with learned priors, NFSP or Deep CFR-style methods. Also separating or sharing networks for bidding vs play.
