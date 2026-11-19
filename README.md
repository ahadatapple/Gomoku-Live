# Gomoku Live

Freestyle Gomoku (15×15, five or more in a row wins) on [DeepSpace](https://docs.deep.space).
You can play a minimax engine at three strengths, or send a friend a challenge link
and play them live. Anyone with the link can watch, and every move is validated on
the server.

**Live:** https://gomoku-live.app.space

## What it does

- **Play the engine.** Easy, Medium or Hard, as Black or White. The engine is a
  TypeScript port of my Python minimax engine (`smart_board_eval` + alpha-beta
  from a course project) and runs server-side in the Worker.
- **Challenge a friend.** You get a link, and the first person to open it and
  click *Take the open seat* plays you. Both boards update live, and you can see
  where your opponent is hovering.
- **Watch.** Anyone else who opens the link, signed in or not, sees the game live.
- **Leaderboard.** Wins, losses and draws, head-to-head and against each engine
  level, worked out from finished games.
- **AI coach.** After a game, a player can ask for a review. The engine
  finds the moments that decided it (a missed win in one, a missed block, an
  unstoppable double threat, the biggest disagreements with the engine).
  Claude then explains them in plain language, and clicking a moment jumps
  the replay slider to that position.
- **Turn alerts.** While it's your move, the tab title shows "● Your move", with
  an optional browser notification if the tab is in the background. Opt-in
  emails go out if you've been away 10 minutes, at most one per turn.
- Resign, cancel a challenge, rematch with colours swapped, a move list, a
  replay slider, and the engine's search depth and think time for its last move.

## How it uses DeepSpace

| Piece | Used for | Why |
|---|---|---|
| **RecordRoom collections** (`games`, `moves`, `seats`) | All game state | Every client subscribes with `useQuery`, so moves reach players and spectators in real time without me writing any socket code. |
| **RBAC** | Clients can **read** everything and **write nothing** | Even a hand-crafted websocket write can't place a stone. The only writer is the Worker. |
| **Server actions** (`createGame`, `joinGame`, `move`, `botMove`, `resign`) | All mutations | Each action authorizes the caller from the verified JWT, checks turn, cell and game-over by replaying the move log, then writes. |
| **`uniqueOn` constraints** | `moves(gameId, ply)` and `seats(gameId, color)` | RecordRoom checks and inserts in one synchronous step inside the Durable Object. So a double-click, two tabs, or two people grabbing the last seat can't both succeed. It's a platform primitive standing in for a lock or transaction I'd otherwise have to build. |
| **Presence room** (`usePresenceRoom('game:<id>')`) | Who's at the board, spectator count, opponent's hover cursor | Ephemeral state belongs in presence, not in records. |
| **Auth** | Sign-in to play; anonymous viewers can watch | `RecordProvider allowAnonymous` + read-only RBAC give spectating for free. |

| **`anthropic/chat-completion`** (Claude Haiku) | AI post-game coach | Explaining *why* a game was lost is the one thing the search engine can't do. |
| **`email/send`** | "Your move" reminders | Covers the case the tab alert can't: the player closed the tab. |
| **Cron** (`src/cron.ts`) | Runs the reminder check every 5 minutes | Platform scheduler instead of a hand-rolled timer. |

### Why the coach is built this way

LLMs are unreliable at board geometry: asked "where did I go wrong?" from a raw
move list, they invent threats and coordinates. So the work is split:
`src/game/analysis.ts` replays the game and uses the engine to find the
critical moments deterministically, and Claude only puts those facts into
words. The prompt forbids mentioning any coordinate that isn't in the input,
and the facts are shown under the text so the player can check them on the board.

The call is made from a server action (`src/actions/coach.ts`). The client
never talks to the model and no vendor key exists anywhere in the repo:
the platform proxy bills the app owner using a JWT injected at deploy time.

**Billing tradeoff:** the coach is **developer-billed**. With per-user billing,
every player would need DeepSpace credits before seeing a review, so the
feature would fail for exactly the people trying the app. Instead, the cost is
bounded: sign-in required, players only, finished games only, and one review
per player per game. A `uniqueOn(gameId, userId)` claim is taken *before* the
paid call, so double-clicks and two open tabs pay once. A failed call is
recorded and can be retried.

### Notifications without spam

Tab title and browser notifications cost nothing and need no integration. They
cover the common case of a game open in another tab. Email is opt-in, sent
only after 10 minutes of waiting, at most once per turn (`games.remindedPly`),
and never for games idle more than a week. The ply is marked before sending, so
a failing send can't become an email every five minutes. I looked for a push or
SMS endpoint in the integration catalog and found none. `slack/send-message`
needs each user's Slack token, which is the wrong fit for a casual game.

### Left out on purpose

- **An LLM choosing moves.** It would be slower (seconds per call), cost per
  move, and can suggest illegal or nonsense moves. The deterministic engine is the point of the project.
- **Image generation (victory cards), LiveKit voice/video, Stripe, web search.**
  None of these makes the game better to play. Video for a quiet turn-based game
  is bandwidth and billing complexity, and payments would put friction before
  the first move.
- **Per-user billing for the coach** (see above).

## The main tradeoff: search depth vs response time

The engine plays inside a Worker request, so it gets a wall-clock budget. On
a 12-stone midgame (Node 22, one core):

| Depth | Time | Nodes |
|---|---|---|
| 1 | ~30 ms | 60 |
| 2 | ~50 ms | 245 |
| 3 | ~110 ms | 794 |
| 4 | ~950 ms | 6,146 |

The original Python searches *every* empty cell, which on 15×15 is about 225^d
positions and is unplayable past depth 1 to 2. The production search keeps the
original scoring exactly but changes **which** moves it searches and **for how
long**:

- **Candidate pruning:** only cells within 2 of an existing stone (~60 instead of ~200).
- **Move ordering:** a cheap local-threat score, so alpha-beta cuts off earlier.
- **Iterative deepening under a deadline:** search depth 1, 2, 3… and keep the
  move from the deepest *completed* depth when time runs out.
- **Levels = budgets:** Easy is depth 1 with the original `slider_eval` noise.
  Medium is depth 2. Hard is up to depth 4 within 1.5 s.

Going deeper (depth 5 and beyond, or a threat-space search) would need an
incremental evaluator. The current eval rescans the whole board, about
150 µs per call, which is where the time goes.

## Is the port faithful?

`engine-parity/gen_fixtures.py` runs the **original Python files** on 300
seeded random boards and 40 move searches (16 of them at depth 2), and writes
`src/engine/fixtures.json`. `src/engine/engine.parity.test.ts` replays them
against the TypeScript port, and every eval score and every chosen move matches
exactly. The original's quirks are kept on purpose and documented in `eval.ts`:
`live_k` skips the last window, dead-shape bonuses aren't multiplied by count,
and the corner diagonals are counted twice.

## Tests

```
npm run test:unit                 # 365 unit tests: parity, rules, actions, coach, analysis, reminders, standings
npx deepspace test run gomoku     # two browsers: challenge link → live game → win; engine reply
```

The action tests run against an in-memory fake of the record tools that enforces
`uniqueOn` the same way RecordRoom does. They cover turn order, occupied cells,
non-players, moving before an opponent joins (a bug these tests caught),
five-in-a-row, a double-submitted move landing once, two joiners racing for one
seat, and resign.

## Layout

```
src/engine/       eval.ts (port), search.ts (faithful + production search), levels.ts
src/game/         rules.ts (replay + move checks, shared by server and UI), useGame.ts, standings.ts
src/actions/      game-actions.ts — the only code that writes game data
src/schemas/      game-schemas.ts — collections, RBAC, uniqueOn
src/pages/(app)/  play.tsx (lobby), g/[id].tsx (game), leaderboard.tsx
engine-parity/    original Python + fixture generator
```

## Known limits / next steps

- **No clocks or abandonment.** An idle opponent leaves a game open (reminders
  stop after a week). Next step: a per-move time limit, enforced by the same
  cron task forfeiting stale games.
- **The coach's engine comparison is shallow** (depth 2, 250 ms per move), so
  "engine preferred" moments are suggestions, not proofs. Missed wins, missed
  blocks and double threats are exact.
- **Leaderboard is computed client-side** from up to 1,000 finished games. That's
  fine at this scale. Past that I'd keep a `ratings` collection (Elo) updated by
  the `move`/`resign` actions.
- **Resign vs a winning move in the same instant:** the move log stays correct,
  but the `games` index could record the resign. A conditional update would close
  that gap.
- **No renju/swap opening rules**, so Black has a known advantage in freestyle.
- Expose the engine as a DeepSpace agent tool so a local agent can play via
  `npx deepspace agent invoke`.

## Run it yourself

```
npm install
npx deepspace auth login
npx deepspace dev start
npx deepspace deploy
```
