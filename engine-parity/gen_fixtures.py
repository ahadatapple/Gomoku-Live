"""Generate parity fixtures from the ORIGINAL Python engine.

Runs kille.smart_board_eval and utils.Strategy.get_move on seeded random boards
and writes fixtures.json, which src/engine/engine.parity.test.ts replays
against the TypeScript port.
"""
import json, random, sys
import numpy as np
from kille import smart_board_eval
from utils import Strategy, complete_board

def random_board(n, stones, rng):
    b = np.array([["-"] * n for _ in range(n)])
    cells = rng.sample(range(n * n), stones)
    s = "X"
    for c in cells:
        b[c // n][c % n] = s
        s = "O" if s == "X" else "X"
    return b

def clustered_board(n, stones, rng):
    # Stones near the centre, like a real game, so threats actually occur.
    b = np.array([["-"] * n for _ in range(n)])
    s = "X"; placed = 0; c0 = n // 2
    while placed < stones:
        r = min(n - 1, max(0, int(rng.gauss(c0, 2.2))))
        c = min(n - 1, max(0, int(rng.gauss(c0, 2.2))))
        if b[r][c] == "-":
            b[r][c] = s; s = "O" if s == "X" else "X"; placed += 1
    return b

rng = random.Random(2026)
evals, moves = [], []
for i in range(300):
    n = rng.choice([15, 15, 15, 8, 9])
    gen = clustered_board if i % 2 else random_board
    b = gen(n, rng.randint(0, min(60, n * n // 2)), rng)
    rows = ["".join(r) for r in b]
    evals.append({"n": n, "rows": rows,
                  "X": smart_board_eval(b, "X"), "O": smart_board_eval(b, "O")})

for i in range(40):
    n = rng.choice([8, 9, 15])
    b = clustered_board(n, rng.randint(2, 20), rng)
    if complete_board(b):
        continue
    depth = 2 if n <= 9 and i % 2 == 0 else 1
    me = rng.choice(["X", "O"])
    mv = Strategy(me, smart_board_eval, max_depth=depth).get_move(b.copy())
    moves.append({"n": n, "rows": ["".join(r) for r in b], "me": me, "depth": depth,
                  "move": [int(mv[0]), int(mv[1])] if mv[0] is not None else None})

json.dump({"evals": evals, "moves": moves}, open(sys.argv[1], "w"))
print(len(evals), "evals,", len(moves), "moves")
