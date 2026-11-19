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
- Resign, cancel a challenge, rematch with colours swapped, a move list, and the
  engine's search depth and think time for its last move.

## How it uses DeepSpace

| Piece | Used for | Why |
|---|---|---|
| **RecordRoom collections** (`games`, `moves`, `seats`) | All game state | Every client subscribes with `useQuery`, so moves reach players and spectators in real time without me writing any socket code. |
| **RBAC** | Clients can **read** everything and **write nothing** | Even a hand-crafted websocket write can't place a stone. The only writer is the Worker. |
| **Server actions** (`createGame`, `joinGame`, `move`, `botMove`, `resign`) | All mutations | Each action authorizes the caller from the verified JWT, checks turn, cell and game-over by replaying the move log, then writes. |
| **`uniqueOn` constraints** | `moves(gameId, ply)` and `seats(gameId, color)` | RecordRoom checks and inserts in one synchronous step inside the Durable Object. So a double-click, two tabs, or two people grabbing the last seat can't both succeed. It's a platform primitive standing in for a lock or transaction I'd otherwise have to build. |
| **Presence room** (`usePresenceRoom('game:<id>')`) | Who's at the board, spectator count, opponent's hover cursor | Ephemeral state belongs in presence, not in records. |
| **Auth** | Sign-in to play; anonymous viewers can watch | `RecordProvider allowAnonymous` + read-only RBAC give spectating for free. |

**Integrations I left out on purpose:** AI chat/LLMs, web search, image
generation, file storage, payments, scheduled jobs. None of them makes Gomoku
better. The opponent is a deterministic search engine, which is the point of the
project, and an LLM would play worse and cost credits per move. I'd rather ship
three primitives used properly than bolt on integrations for the count.

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
npm run test:unit                 # 356 unit tests: parity, rules, actions, standings
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

- **No clocks or abandonment.** An idle opponent leaves a game open forever.
  Next step: a per-move time limit, enforced by a scheduled job that forfeits stale games.
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
