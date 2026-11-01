# engine

The 304 rules engine. Pure TypeScript with no runtime dependencies, so it runs in the browser, in tests, and later on a server or behind an RL training loop.

```bash
npm install
npm test           # vitest: rule tests, worked examples from rules.md, random playouts
npm run typecheck
npm run bench      # speed check (bundles bench/bench.ts with rolldown, runs it on Node)
```

## How it works

Everything goes through four functions in `src/game.ts`:

- `newMatch(seed)` deals the first game.
- `toAct(game)` says whose decision it is.
- `legalActions(game)` lists what they may do. This is the only authority on legality; the UI and bots only ever pick from it.
- `apply(match, action)` returns a new match state. It never mutates its input and throws on an illegal action.

`step(match, action)` is the fast path for training loops and search: it changes the match in place with no legality check and no copy, so only use it on a state you own with an action you know is legal (e.g. from `legalMask`). `cloneMatch` copies a state when you need to branch.

`nextGame(match)` deals the next game once one is over. `viewFor(match, seat)` is what a seat is allowed to know: its own hand, public plays, and the trump suit only if it's the trumper or trump is open. Bots get a view, never the full state.

| File | What |
|---|---|
| `cards.ts` | cards as strings (`'Jc'`, `'10h'`), points, which card beats which |
| `seats.ts` | seats 0-3 anticlockwise, partners opposite, team = seat % 2 |
| `rng.ts` | seeded RNG whose state lives in the match, so the engine stays pure |
| `types.ts` | the state, actions and game outcomes |
| `bidding.ts` | 4- and 8-card betting (§B rules), PCC, redeal, pass-on |
| `play.ts` | tricks, closed-trump face-down rules (§T rules), folded cards, exhausted trumps, PCC's 3-player tricks |
| `game.ts` | match flow, trump choice, open/closed and showing a trump, absolute hand, Spoilt Trumps, caps and claims, early end, scoring and stone |
| `shuffle.ts` | building each deal's deck: full shuffle, or slap shuffles + cut + riffle remedy |
| `caps.ts` | the caps / claim-balance solver: does an order of my cards guarantee every remaining round? |
| `view.ts` | per-seat redacted view |
| `actions.ts` | every action numbered 0..ACTION_COUNT-1 plus a legal mask, for RL |

The bots and the RL training environment live in `../bots`.

Rule numbers in comments and tests (`§B-4`, `§T-6`) point at `public/rules.md`.

## Rules coverage

Everything in `public/rules.md` is in: betting (with PCC), trump, open/closed play, absolute hands, automatic Spoilt Trumps, caps (with a solver that judges calls and spots missed chances), scoring, slap shuffling, and the optional claim-threshold and claim-balance rules. House-rule options are `RuleOptions` on the match (`newMatch(seed, { rules })`, `withRules`).

## Rules calls worth knowing

The full list is in `public/304-project-overview.md` ("Interpretation calls"). The big ones: stone only ever goes down (the winning team gives away stone from its own pile); Spoilt Trumps is detected automatically and the same dealer redeals; a game ends as soon as it's decided unless caps could still matter; a PCC game ends as soon as the opponents win a round.

Caps is on by default and makes the engine run its solver on sweeping teams' turns. For raw speed (RL training), pass `rules: { caps: false }`.
