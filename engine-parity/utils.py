from functools import partial
from itertools import combinations
from collections import Counter
import random
import copy
import time
import multiprocessing

import numpy as np
from termcolor import cprint
from tqdm import tqdm
from prettytable import PrettyTable

def other_stone(stone):
    """
    Return the opposite player's stone in a Gomoku game.

    Inputs:
        - stone, a string representing the current player's stone ("X" or "O")

    Returns: the string representing the other player's stone
    """
    return "X" if stone == "O" else "O"


def consecutive_k(row, k, stone):
    """
    Count the number of times a given stone appears in k consecutive positions in a row.

    Inputs:
        - row, a list of strings representing stones in a row
        - k, an integer representing the length of the consecutive sequence to check for
        - stone, a string representing the player's stone

    Returns: the number of k-length sequences in the row that match [stone] * k
    """
    desired_row = [stone] * k
    return sum(desired_row == row[i:i+k] for i in range(len(row) - k + 1))


def get_downdiag(board, row_idx, col_idx):
    """
    Extract the downward (top-left to bottom-right) diagonal starting at a given position.

    Inputs:
        - board, a list of lists representing the game board
        - row_idx, the starting row index
        - col_idx, the starting column index

    Returns: a list of strings representing the stones along the downward diagonal
    """
    return [board[row_idx + i][col_idx + i] for i in range(min(len(board) - row_idx, len(board) - col_idx))]


def get_updiag(board, row_idx, col_idx):
    """
    Extract the upward (bottom-left to top-right) diagonal starting at a given position.

    Inputs:
        - board, a list of lists representing the game board
        - row_idx, the starting row index
        - col_idx, the starting column index

    Returns: a list of strings representing the stones along the upward diagonal
    """
    return [board[row_idx - i][col_idx + i] for i in range(min(row_idx + 1, len(board) - col_idx))]

def iter_seqs(board):
    """
    Extracts all the rows, columns, and diagonals of the Gomoku board

    Note: only returns diagonal seqs of length at least 5

    Input:
        - board, a list of lists representing the game board    

    Yields each row, column, and diagonal as a List
    """
    for row in board:
        yield list(row)

    for col_idx in range(len(board)):
        yield [row[col_idx] for row in board]

    for row_idx in range(len(board)):
        d = get_updiag(board, row_idx, 0)
        if len(d) >= 5:
            yield d
        d = get_downdiag(board, row_idx, 0)
        if len(d) >= 5:
            yield d

    for col_idx in range(len(board[0])):
        d = get_updiag(board, len(board) - 1, col_idx)
        if len(d) >= 5:
            yield d
        d = get_downdiag(board, 0, col_idx)
        if len(d) >= 5:
            yield d


def winner_stone(board, stone):
    """ 
    Checks if a player has won the game of Gomoku

    Inputs:
        - board, a list of lists representing the game board
        - stone, a string representing the player's stone
        
    Returns True iff there are 5 in a row for player "stone" on "board"
    """
    k_count = 0
    k = 5
    for row in board:
        row = list(row)
        k_count += consecutive_k(row, k, stone)

    for col_idx in range(len(board)):
        bl = [row[col_idx] for row in board]
        k_count += consecutive_k(bl, k, stone)

    for row_idx in range(len(board)):
        bl = get_updiag(board, row_idx, 0)
        k_count += consecutive_k(bl, k, stone)
        bl = get_downdiag(board, row_idx, 0)
        k_count += consecutive_k(bl, k, stone)

    for col_idx in range(len(board[0])):
        bl = get_updiag(board, len(board) - 1, col_idx)
        k_count += consecutive_k(bl, k, stone)
        bl = get_downdiag(board, 0, col_idx)
        k_count += consecutive_k(bl, k, stone)

    return k_count > 0


def complete_board(board):
    """
    Checks if the Gomoku game is finished

    Input:
        - board, a list of lists representing the game board
    
    Return True iff the game is over
    """
    return winner_stone(board, "X") or winner_stone(board, "O") or not any('-' in row for row in board)


def print_board(board, bolded=None, lines=False):
    """A debugging function to print you board in a pretty way"""
    n = len(board)
    color = "red"
    # For every row but the last
    cprint(" | " + " ".join(str(col_idx) for col_idx in range(len(board[0]))), attrs=["underline"]) if lines else None
    print(" |") if lines else None
    for row_idx, row in enumerate(board[:-1]):
        # Print the row as a string with a line below
        cprint(f"{row_idx}| ", end="") if lines else None
        if bolded and row_idx==bolded[0]:
            cprint("|".join(row[:bolded[1]]) + '|' if bolded[1] != 0 else '', None, attrs=["underline"], end='')
            cprint(row[bolded[1]], color, attrs=["underline", "bold"], end='')
            if bolded[1] != len(row) - 1:
                cprint("|" + "|".join(row[bolded[1]+1:]), None, attrs=["underline"], end='')
            print()
        else:
            cprint("|".join(row), None, attrs=["underline"])
    row = board[-1]
    cprint(f"{len(board)-1}| ", end="") if lines else None
    if bolded and bolded[0] == len(board) - 1:
        print("|".join(row[:bolded[1]]), end='|' if bolded[1] != 0 else '')
        cprint(row[bolded[1]], color, attrs=["bold"], end='')
        if bolded[1] != len(row) - 1:
            cprint("|" + "|".join(row[bolded[1]+1:]), None, end='')
        print()
    else:
        print("|".join(row))


def get_random_board(board_size, turn_count=0):
    """
    Return a board that is "partially" played through.
    
    board_size:     The width and height of the board
    turn_count:     The number of random moves to be made on a board *before* the game starts.
                    If -1, then generate random number to be used as number of moves before game.
    """
    n = board_size
    board = np.array([["-"]*n for _ in range(n)])
    moves = random.randint(1, n*n/2) if turn_count == -1 else turn_count
    stone = "X"
    for _ in range(moves):
        row_idx = col_idx = -1
        while row_idx < 0 and board[row_idx][col_idx] != "-":
            row_idx = random.randint(0, n-1)
            col_idx = random.randint(0, n-1)
        board[row_idx][col_idx] = stone
        stone = other_stone(stone)
    if complete_board(board):
        board = get_random_board(n)
    return board


def play_game(board, strategy_1, strategy_2, suppress_output=False):
    """
    Plays a game on "board" using the two provided strategies as X and O

    board:           A 2D array of the starting board
    strategy_1:      A strategy object for player X
    strategy_1:      A strategy object for player O
    suppress_output: Print each move, intermediate board, and winner

    Returns "X" if player "X" won, "Y" if "Y" won, else None
    """
    player1_turn = True
    winner = None
    turn_count = 0
    n = len(board)
    m = len(board[0])
    while not complete_board(board) and turn_count < m*n:
        if player1_turn:
            row, col = strategy_1.get_move(board)
            board[row][col] = "X"
        else:
            row, col = strategy_2.get_move(board)
            board[row][col] = "O"
        turn_count += 1
        if not suppress_output:
            print(f"# {turn_count}", "\tPlayer", "X" if player1_turn else "O", f"\tMove: {row},{col}")
            print_board(board, (row, col))
            print("")
        board[row][col] = "X" if player1_turn else "O"
        player1_turn = not player1_turn
    if not winner_stone(board, "O") and  not winner_stone(board, "X"):
        if not suppress_output:
         print("Tie!")
    elif winner_stone(board, "O"):
        if not suppress_output:
            print("Opponent won!")
        winner = "O"
    else:
        if not suppress_output:
            print("Student won!")
        winner = "X"
    return winner


def single_trial(num_random_moves, e1, e2, board_size):
    """
    Simulate a single game with the provided parameters.

    num_random_moves:   The number of random moves to be made on a board *before* the game starts
    e1:                 A tuple (f, n) where f is the eval function and n is the name
    e2:                 A tuple (f, n) where f is the eval function and n is the name
    board_size:         The width and height of the board

    Returns "X" if player "X" won, "Y" if "Y" won, else None
    """
    board = get_random_board(board_size=board_size, turn_count=num_random_moves)
    # Swap first player 50% of the time
    if random.random() <= 0.5:
            e1, e2 = e2, e1
    eval_x, name_x = e1
    eval_o, name_o = e2
    p1 = Strategy("X", eval_x, max_depth=1)
    p2 = Strategy("O", eval_o, max_depth=1)
    winner = play_game(board, p1, p2, suppress_output=True)
    if winner == "X":
        return name_x
    elif winner == "O":
        return name_o


def run_tournament(eval_functions, num_trials=10, board_size=8, num_random_moves=0, n_cpu=1):
    """
    Run an entire tournament and print the results.
    
    eval_functions:      A list of tuples (f, n) where f is the eval function and n is the name
    num_trials:          The number of games to be played between each pair
    board_size:          The width and height of the board
    num_random_moves:    Number of random moves to start the game with. If -1, a random number is used.
    n_cpu:               Number of processes to run in parallel
    """
    all_pairs = list(
        filter(lambda x: not (x[0][1].endswith(" bot") and x[1][1].endswith(" bot")),
               combinations(eval_functions, 2)
    ))
    win_count = {gname: [] for _, gname in eval_functions}

    # Run tournament
    for e1, e2 in tqdm(all_pairs):
        eval_1, name_1 = e1
        eval_2, name_2 = e2
        f = partial(single_trial, e1=e1, e2=e2, board_size=board_size)
        num_moves = (random.randint((board_size**2)//4, (board_size**2)//2) if num_random_moves == -1 else num_random_moves 
                     for _ in range(num_trials))
        if n_cpu == 1:
            winners = map(f, num_moves)
        else:
            pool = multiprocessing.Pool(n_cpu)
            winners = pool.imap_unordered(f, num_moves)
        for winner in winners:
            if winner == name_1:
                win_count[name_1].append(name_2)
            elif winner == name_2:
                win_count[name_2].append(name_1)

    # Tally up wins
    win_array = np.zeros((len(eval_functions), len(eval_functions)), dtype=object)
    for gidx, (_, gname) in enumerate(eval_functions):
        if "bot" in gname:
            continue
        count = Counter(win_count[gname])
        for oidx, (_, opponent) in enumerate(eval_functions):
            if gname == opponent:
                win_array[gidx][oidx] = '-'
                continue
            win_array[gidx][oidx] = count[opponent]

    # Report results
    table = PrettyTable()
    table.field_names = [str(num_trials)] + [gname for _, gname in eval_functions]
    for gidx, (_, gname) in enumerate(eval_functions):
        if "bot" in gname:
            continue
        table.add_row([gname] + list(win_array[gidx]))
    print()
    print(table)



class Strategy:
    def __init__(self, stone, eval_function, max_depth=1):
        self.stone = stone
        self.opponent_stone = other_stone(stone)
        self.max_depth = max_depth
        self.nodes = 0
        self.pruned = 0
        self.eval_function=eval_function

    def alphabeta_search(self, board, depth, stone, alpha, beta):
        if depth == 0 or complete_board(board):
            score = self.eval_function(board, stone)
            score = -score if stone == self.opponent_stone else score
            self.nodes += 1
            return score, (None, None)

        row_arr, col_arr = np.where(board == '-')
        open_spaces = list(zip(row_arr, col_arr))
        if stone == self.stone:
            best_score = -np.inf
            best_move = (None, None)
            lop = len(open_spaces)
            c = 0
            for row, col in open_spaces:
                new_board = copy.deepcopy(board)
                new_board[row][col] = stone
                score, move = self.alphabeta_search(new_board, depth-1, other_stone(stone), alpha, beta)
                best_score = max(score, best_score)
                if best_score >= beta:
                    self.pruned += (lop - c)**depth
                    break
                elif best_score > alpha:
                    best_move = (row, col)
                    alpha = best_score
        else:
            best_score = np.inf
            best_move = (None, None)
            lop = len(open_spaces)
            c = 0
            for row, col in open_spaces:
                c += 1
                new_board = copy.deepcopy(board)
                new_board[row][col] = stone
                score, move = self.alphabeta_search(new_board, depth-1, other_stone(stone), alpha, beta)
                best_score = min(score, best_score)
                if best_score <= alpha:
                    self.pruned += (lop - c)**depth
                    break
                elif best_score < beta:
                    best_move = (row, col)
                    beta = best_score

        self.nodes += 1
        return best_score, best_move

    def get_move(self, board, max_nodes = 100):
        score, move = self.alphabeta_search(board, self.max_depth, self.stone, -np.inf, np.inf)
        return move


