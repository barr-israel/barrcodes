---
publishDate: 2024-12-25
title: Day 25 - Code Chronicle
author: Barr
keywords: [Advent of Code, Rust]
description: A simple one for the last day.
summary: |
  The chief historian is nowhere to be found, going back to his office, it appears to be locked, and North Pole Security doesn't know which key is correct.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day25.rs
---
## Input
The input contains schematics of both locks and keys mixed together, locks have the top row filled with `#` and the keys have the bottom row filled with `#`.  
For example, a few locks and  keys:
```
#####
.####
.####
.####
.#.#.
.#...
.....

#####
##.##
.#.##
...##
...#.
...#.
.....

.....
#....
#....
#...#
#.#.#
#.###
#####

.....
.....
#.#..
###..
###.#
###.#
#####

.....
.....
.....
#....
#.#..
#.#.#
#####
```
A key fits into a lock if there is no overlap between them, so in this example the 1st lock only fits with the 3rd key, and the 2nd lock fits with both the 2nd and 3rd keys.

## Part 1
How many pairs of locks and keys fit together?  
First, parsing:  
I turned every schematic into a 5 digit signature, for locks it's the amount of `#` in every column, and for keys it's 7 minus that amount, to allow easy comparison later:
```rust
fn count_column(input: &[u8], column: usize) -> u8 {
    (input[column] == b'#') as u8
        + (input[column + LOCK_WIDTH] == b'#') as u8
        + (input[column + 2 * LOCK_WIDTH] == b'#') as u8
        + (input[column + 3 * LOCK_WIDTH] == b'#') as u8
        + (input[column + 4 * LOCK_WIDTH] == b'#') as u8
        + (input[column + 5 * LOCK_WIDTH] == b'#') as u8
        + (input[column + 6 * LOCK_WIDTH] == b'#') as u8
}
fn parse_input(mut input: &[u8]) -> (Vec<(u8, u8, u8, u8, u8)>, Vec<(u8, u8, u8, u8, u8)>) {
    let mut keys: Vec<(u8, u8, u8, u8, u8)> = Default::default();
    let mut locks: Vec<(u8, u8, u8, u8, u8)> = Default::default();
    loop {
        let h0 = count_column(input, 0);
        let h1 = count_column(input, 1);
        let h2 = count_column(input, 2);
        let h3 = count_column(input, 3);
        let h4 = count_column(input, 4);
        if input[0] == b'#' {
            locks.push((h0, h1, h2, h3, h4));
        } else {
            keys.push((7 - h0, 7 - h1, 7 - h2, 7 - h3, 7 - h4));
        }
        if input.len() <= LOCK_WIDTH * LOCK_HEIGHT {
            return (keys, locks);
        }
        input = &input[LOCK_HEIGHT * LOCK_WIDTH + 1..]; // next pattern
    }
}
```
Next, I compare every possible pair of locks and keys and count how many fit:
```rust
pub fn part1_first(input: &[u8]) -> usize {
    let (keys, locks) = parse_input(input);
    locks
        .into_iter()
        .map(|l| {
            keys.iter()
                .filter(|&&k| {
                    (l.0 <= k.0) && (l.1 <= k.1) && (l.2 <= k.2) && (l.3 <= k.3) && (l.4 <= k.4)
                })
                .count()
        })
        .sum()
}
```
## Part 2
The door is open and the chief historian is waiting inside, he is supposed to deliver a chronicle to Santa, and fortunately, the rest of the historians have already prepared it in the journey looking for the chief historian throughout the month, all that's left is for me to deliver it.

## Optimization
The current solution runtime:
```
Day25 - Part1/(default) time:   [254.98 µs 255.38 µs 255.81 µs]
```

Sometimes, short-circuiting a boolean expression can make things slower by inserting a lot of branches in between the evaluations, if the evaluations are cheap enough it might be better to avoid the short-circuit by using a bitwise or instead of a logical one, by replacing `&&` with `&`, in this case, in the filter that compares locks and keys:
```
Day25 - Part1/(default) time:   [75.455 µs 75.716 µs 76.025 µs]
```

Next, to reduce the amount of comparisons, I tried splitting the locks into groups based on their first column, that way when comparing later I only need to check the columns that allow the key I'm currently checking, so the first column of the key becomes an index into the array of vectors that is the locks:
```rust {hl_lines=[6,8,14,15,19]}
#[aoc(day25, part1, split)]
pub fn part1_split(input: &[u8]) -> usize {
    let (locks, keys) = parse_input_split(input);
    keys.into_iter()
        .map(|k| {
            locks[k.0 as usize..]
                .iter()
                .flatten()
                .filter(|&&l| (k.1 <= l.0) & (k.2 <= l.1) & (k.3 <= l.2) & (k.4 <= l.3))
                .count()
        })
        .sum()
}
fn parse_input_better(mut input: &[u8]) -> ([Vec<(u8, u8, u8, u8)>; 7], Vec<(u8, u8, u8, u8, u8)>) {
    let mut keys: [Vec<(u8, u8, u8, u8)>; 7] = Default::default();
    let mut locks: Vec<(u8, u8, u8, u8, u8)> = Default::default();
    loop {
        ...
            keys[(7 - h0) as usize].push((7 - h1, 7 - h2, 7 - h3, 7 - h4));
        ...
    }
}
```
Another decent speed up:
```
Day25 - Part1/split     time:   [38.664 µs 39.132 µs 39.713 µs]
```
What about another split? Making the first 2 columns indices into a 2d array of vectors:
```rust {hl_lines=[9,16,17,21]}
#[aoc(day25, part1, split)]
pub fn part1_split(input: &[u8]) -> usize {
    let (locks, keys) = parse_input_split(input);
    keys.into_iter()
        .map(|k| {
            locks[k.0 as usize..]
                .iter()
                .flat_map(|sub_locks| &sub_locks[k.1 as usize..])
                .flat_map(|sub_locks| &sub_locks[k.2 as usize..])
                .flatten()
                .filter(|&&l| (k.3 <= l.0) & (k.4 <= l.1))
                .count()
        })
        .sum()
}
fn parse_input_split(mut input: &[u8]) -> ([[Vec<(u8, u8, u8)>; 7]; 7], Vec<(u8, u8, u8, u8, u8)>) {
  let mut keys: [[Vec<(u8, u8, u8)>; 7]; 7] = Default::default();
  let mut locks: Vec<(u8, u8, u8, u8, u8)> = Default::default();
  loop {
    ...
      keys[(7 - h0) as usize][(7 - h1) as usize].push((7 - h2, 7 - h3, 7 - h4));
    ...
  }
}
```
A much smaller, but still measurable speedup:
```
Day25 - Part1/split     time:   [34.377 µs 34.422 µs 34.477 µs]
```

Maybe another split?
```
Day25 - Part1/split     time:   [49.578 µs 49.662 µs 49.752 µs]
```
Not this time.

Next, I tried putting the locks into a bit array, each index is simply whether that locks exists:
```rust
pub fn part1_bits(input: &[u8]) -> u32 {
    let (keys, locks) = parse_input_bits(input);
    let mut count = 0u32;
    locks.into_iter().for_each(|l| {
        for h0 in l.0..8 {
            for h1 in l.1..8 {
                for h2 in l.2..8 {
                    for h3 in l.3..8 {
                        for h4 in l.4..8 {
                            if keys[(((h0) as usize) << 12)
                                | ((h1 as usize) << 9)
                                | ((h2 as usize) << 6)
                                | ((h3 as usize) << 3)
                                | (h4 as usize)]
                            {
                                count += 1;
                            }
                        }
                    }
                }
            }
        }
    });
    count
}
fn parse_input_bits(mut input: &[u8]) -> (BitArr!(for 8*8*8*8*8), Vec<(u8, u8, u8, u8, u8)>) {
    let mut keys: BitArr!(for 8*8*8*8*8) = Default::default();
    let mut locks: Vec<(u8, u8, u8, u8, u8)> = Default::default();
    loop {
        let h0 = count_column(input, 0);
        let h1 = count_column(input, 1);
        let h2 = count_column(input, 2);
        let h3 = count_column(input, 3);
        let h4 = count_column(input, 4);
        if input[0] == b'#' {
            locks.push((h0, h1, h2, h3, h4));
        } else {
            keys.set(
                (((7 - h0) as usize) << 12)
                    | (((7 - h1) as usize) << 9)
                    | (((7 - h2) as usize) << 6)
                    | (((7 - h3) as usize) << 3)
                    | ((7 - h4) as usize),
                true,
            );
        }
        if input.len() <= LOCK_WIDTH * LOCK_HEIGHT {
            return (keys, locks);
        }
        input = &input[LOCK_HEIGHT * LOCK_WIDTH + 1..]; // next pattern
    }
}
```
This is sort of like a more optimized version of the split solution, where *every* column is an index, unfortunately, it is the slowest one so far:
```
Day25 - Part1/bits      time:   [429.12 µs 430.65 µs 432.55 µs]
```

The next attempt was comparing while parsing, when a new lock is parsed, compare it to every key parsed to far, and when a new key is parsed, compare it to every lock parsed so far:
```rust
pub fn part1_combined(mut input: &[u8]) -> usize {
    let mut count = 0;
    let mut keys: Vec<(u8, u8, u8, u8, u8)> = Default::default();
    let mut locks: Vec<(u8, u8, u8, u8, u8)> = Default::default();
    loop {
        let h0 = count_column(input, 0);
        let h1 = count_column(input, 1);
        let h2 = count_column(input, 2);
        let h3 = count_column(input, 3);
        let h4 = count_column(input, 4);
        if input[0] == b'#' {
            let lock = (h0, h1, h2, h3, h4);
            count += check_lock(lock, &keys);
            locks.push(lock);
        } else {
            let key = (7 - h0, 7 - h1, 7 - h2, 7 - h3, 7 - h4);
            count += check_key(key, &locks);
            keys.push(key);
        }
        if input.len() <= LOCK_WIDTH * LOCK_HEIGHT {
            return count;
        }
        input = &input[LOCK_HEIGHT * LOCK_WIDTH + 1..]; // next pattern
    }
}
```
This turned out as fast as the normal non-split solution:
```
Day25 - Part1/combined  time:   [75.464 µs 75.675 µs 75.984 µs]
```
So the best solution I found was the split version with 2 columns serving as indices.

## Conclusion
Another year done, it was a lot of work, especially writing these posts at the same time, but it was fun and I made it through.
