#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import random

from utils import iter_seqs


def other_stone(stone):
    return "X" if stone == "O" else "O"


def consecutive_k(row, k, stone):
    desired_row = [stone] * k
    return sum(desired_row == row[i:i+k] for i in range(len(row) - k + 1))


def live_k(row, k, stone):
    consecutive_k = [stone] * k
    if k < 4:
        return sum(consecutive_k in (row[i+j:i+j+k] for j in range(5-k+1)) and row[i:i+5].count('-') == 5-k for i in range(len(row) -  5))
    if k == 4:
        return int("-" + stone*4 + "-" in "".join(row))
    return 0


def dead_k(row, k, stone):
    consecutive_k = [stone] * k
    c = row[:5].count(stone) == k and row[:5].count("-") == 5 - k and row[0] == stone
    c += row[-5:].count(stone) == k and row[-5:].count("-") == 5 - k and row[-1] == stone
    c += sum(row[i:i+5].count(stone) == k and consecutive_k not in (row[i+j:i+j+k] for j in range(5-k+1)) and row[i:i+5].count('-') == 5-k for i in range(len(row) -  4))
    if k == 4:
        c += sum(row[i:i+5].count(stone) == k and row[i:i+5].count('-') == 5-k for i in range(len(row) -  4))
    return c


def smart_board_eval(board, stone):
    max_val = 100000000
    op_val = 1000000
    retval = 0
    consecutive_5 = 0
    live_dict = {2: 10, 3: 1000, 4: max_val}
    dead_dict = {2: 5, 3: 10, 4: max_val}
    live_count = {2: 0, 3: 0, 4: 0, 5: 0}
    dead_count = {2: 0, 3: 0, 4: 0, 5: 0}
    stone_p = other_stone(stone)
    for seq in iter_seqs(board):
        for k in range(2, 5):
            live_count[k]  += live_k(seq, k, stone)
            dead_count[k] += dead_k(seq, k, stone)
            consecutive_5 += consecutive_k(seq, 5, stone)
    for k in range(2, 5):
        if live_count[k]:
            retval += live_count[k]*live_dict[k]
        if dead_count[k]:
            retval += dead_dict[k]
    #print(live_count, dead_count)
    if consecutive_5:
         return 100000000
    live_dict = {2: 10, 3: 500, 4: op_val}
    dead_dict = {2: 5, 3: 50, 4: op_val / 2}
    live_count = {2: 0, 3: 0, 4: 0, 5: 0}
    dead_count = {2: 0, 3: 0, 4: 0, 5: 0}
    for seq in iter_seqs(board):
        for k in range(2, 5):
            live_count[k]  += live_k(seq, k, stone_p)
            dead_count[k] += dead_k(seq, k, stone_p)
            consecutive_5 += consecutive_k(seq, 5, stone_p)

    for k in range(2, 5):
        if live_count[k]:
            retval -= live_count[k]*live_dict[k]
        if dead_count[k]:
            retval -= dead_dict[k]
    if consecutive_5:
            return -10000000
    return retval

# Hack to make sure all tested modules have a "student_eval" fn
student_eval = smart_board_eval

def slider_eval(board, stone, difficulty=0.0):
    if random.random() >= difficulty:
        return random.random()
    else:
        return smart_board_eval(board, stone)

