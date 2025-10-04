---
publishDate: 2024-12-11
title: Day 11 - Plutonian Pebbles
author: Barr
keywords: [Advent of Code, Rust]
description: This year's "Should have solved part 1 efficiently".
summary: |
  Part 1 starts of with a simple problem to solve naively, part 2 makes the solution unfeasible.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day11.rs
---
There are "physics-defying stones" arranged in a straight line, each engraved with a number, with each blink, each stone will be replaced based on the rules:

- If it is engraved with 0, it is replaced with a stone engraved with 1
- If the amount of digits on the stone is even, it will be replaced with 2 stones with half of the digits on each(1234->12 and 34)
- Otherwise, it will be replaced by a stone with 2024 times the original number

## Input
Today's input is the shortest I've ever seen, just a few numbered stones with a space in between the numbers.

## Part 1
How many stones after 25 blinks?  
The naive solution is fairly simple: replace the old stone vector with a new stone vector where each stone was replaced with the corresponding next step.  
First, the outer function that parses the numbers and calls the step function:
```rust
pub fn stone_stepper_naive(mut input: &[u8], steps: u8) -> u64 {
    let mut stones = Vec::<u64>::with_capacity(16);
    loop {
        let (num, remainder) = fast_parse(input);
        stones.push(num);
        if remainder.is_empty() {
            break;
        }
        input = &remainder[1..];
    }
    for _ in 0..steps {
        stones = step(stones);
    }
    stones.len() as u64
}
```
And then the actual step function:
```rust
fn step(stones: Vec<u64>) -> Vec<u64> {
    let mut new_stones = Vec::<u64>::with_capacity(stones.len());
    for stone in stones {
        if stone == 0 {
            new_stones.push(1);
        } else {
            let digits = stone.ilog10() + 1;
            if digits % 2 == 0 {
                let tenpow = 10u64.pow(digits / 2);
                new_stones.push(stone / tenpow);
                new_stones.push(stone % tenpow);
            } else {
                new_stones.push(stone * 2024);
            }
        }
    }
    new_stones
}
```
There are obvious efficiency issues here, but it will do for part 1.

## Part 2
How many stones after 75 blinks?  

That's all? No new rules? Can I just run the same solution with a bigger number?  
Of course not, this is Advent of Code, running the same code slows down to a crawl at around ~40 steps, and crashes due to being out of memory(on my 32GiB system) at around ~50 steps.  

Not surprising, time for a new solution.

It was obvious from the start some sort of cache will do good here, so I've written a simple cached recursive function, also known as "memoization":
```rust
fn cached_step(stone: u64, steps: u8, cache: &mut FxHashMap<(u64, u8), u64>) -> u64 {
    if steps == 0 {
        return 1;
    }
    if let Some(expanded_amount) = cache.get(&(stone, steps)) {
        *expanded_amount
    } else {
        let amount = if stone == 0 {
            cached_step(1, steps - 1, cache)
        } else {
            let digits = stone.ilog10() + 1;
            if digits % 2 == 0 {
                let tenpow = 10u64.pow(digits / 2);
                let amount1 = cached_step(stone / tenpow, steps - 1, cache);
                let amount2 = cached_step(stone % tenpow, steps - 1, cache);
                amount1 + amount2
            } else {
                cached_step(stone * 2024, steps - 1, cache)
            }
        };
        cache.insert((stone, steps), amount);
        amount
    }
}
```
And the outer function simply calls this function once, and now it doesn't need to store the stones, it can just parse them and call the function.  

That's part 2 solved faster than the old solution could complete ~30 steps.  
Of course it can also solve part 1 a lot faster.

## Optimizations
As always, this is where the CPU clock gets locked.  
First, how much faster is the cached solution compared to the naive one?
```
Day11 - Part1/naive     time:   [5.0976 ms 5.1092 ms 5.1223 ms]
Day11 - Part1/cached    time:   [135.03 µs 135.14 µs 135.24 µs]
```
A lot faster.

And part 2(obviously only with the cached solution):
```
Day11 - Part2/cached    time:   [10.313 ms 10.336 ms 10.362 ms]
```
My first optimization was to split the cache to 75 different `HashMap`s, each for a different step count, the only difference is that now a specific cached value is accessed using `cache[(steps-1) as usize].get(stone)` instead of `cache.get((stone,steps))`.

This is a little faster for part 2 and a little slower for part 1(I didn't bother making part 1 create only 25 maps, 75 are created and it uses  only 25)
```
Day11 - Part1/cached_multicache time:   [145.63 µs 147.01 µs 148.82 µs]
Day11 - Part2/cached_multicache time:   [8.6433 ms 8.6509 ms 8.6587 ms]
```

This next approach I have taken from a Discord conversation:  
Instead of checking stones individually, stones with the same number can be grouped together and updated together, for example, 5 stones with the number 1234, will always become 5 stones with the number 12, and 5 stones with the number 34, it is irrelevant to the total amount of stones how these 10 new stones are placed within the entire line.  
To implement this approach, I use a `HashMap` to track the amount of each number:
```rust
fn step_grouped(mut stones: FxHashMap<u64, u64>, steps: u8) -> u64 {
    let mut next_stones = FxHashMap::<u64, u64>::default();
    for _ in 0..steps {
        // advance all groups one step
        for (&stone, &count) in &stones {
            if stone == 0 {
                next_stones
                    .entry(1)
                    .and_modify(|existing_count| *existing_count += count)
                    .or_insert(count);
            } else {
                let digits = stone.ilog10() + 1;
                if digits % 2 == 0 {
                    let tenpow = 10u64.pow(digits / 2);
                    next_stones
                        .entry(stone / tenpow)
                        .and_modify(|existing_count| *existing_count += count)
                        .or_insert(count);
                    next_stones
                        .entry(stone % tenpow)
                        .and_modify(|existing_count| *existing_count += count)
                        .or_insert(count);
                } else {
                    next_stones
                        .entry(stone * 2024)
                        .and_modify(|existing_count| *existing_count += count)
                        .or_insert(count);
                }
            };
        }
        // swap the maps, double buffer approach
        stones.clear();
        swap(&mut stones, &mut next_stones);
    }
    stones.into_values().sum()
}
```
Some things to note:

- I can't just put the new stones back into the same map immediately, since it is still borrowed and iterated over(this is not just a borrow checker thing, inserting into the iterated map will cause issue), so I'm putting the next step's stones in a "new" empty map.
- I can't simply insert new numbers into the map, since the same number could be created from different numbers(for example, both 1234 and 3412 will produce 12 and 34), so I need to add to an existing count if there is one.
- The next step's map is not actually "new", instead of creating a new map for every step, I am using a double buffer approach: after the current step is finished, the map for it is not needed anymore, and it is repurposed as the next map for the next step.

This is even faster than the cached solution:
```
Day11 - Part1/grouped   time:   [105.27 µs 105.36 µs 105.45 µs]
Day11 - Part2/grouped   time:   [4.9255 ms 4.9305 ms 4.9365 ms]
```
At this point I tried to reduce allocations by preallocating big enough `HashMap`s, the exact amount of slots varies based on the algorithm and part(for example, the single hash map solution for part 2 was set to 150k to avoid any reallocations, and the other part 2 `HashMap`s were set to 5k).  
This significantly improved the solutions of all the cached solutions:
```
Day11 - Part1/cached(OLD)            time:   [135.03 µs 135.14 µs 135.24 µs]
Day11 - Part1/cached                 time:   [95.527 µs 95.740 µs 95.993 µs]
Day11 - Part1/cached_multicache(OLD) time:   [145.63 µs 147.01 µs 148.82 µs]
Day11 - Part1/cached_multicache      time:   [78.156 µs 78.462 µs 78.840 µs]
Day11 - Part2/cached(OLD)            time:   [10.313 ms 10.336 ms 10.362 ms]
Day11 - Part2/cached                 time:   [5.1566 ms 5.1696 ms 5.1894 ms]
Day11 - Part2/cached_multicache(OLD) time:   [8.6433 ms 8.6509 ms 8.6587 ms]
Day11 - Part2/cached_multicache      time:   [4.7614 ms 4.7750 ms 4.7904 ms]
```
And even helped the grouped solutions a little:
```
Day11 - Part1/grouped   time:   [100.12 µs 100.22 µs 100.32 µs]
Day11 - Part2/grouped   time:   [4.7336 ms 4.7438 ms 4.7564 ms]
```
At this point the multi-cache solution for part 2 is about as fast as the grouped solution, and the multi-cache solution for part 1 is *faster* than the grouped solution.

## Final Times
As usual, time to unlock the CPU clock:
```
Day11 - Part1/cached            time:   [53.077 µs 53.438 µs 54.021 µs]
Day11 - Part1/cached_multicache time:   [48.077 µs 48.771 µs 49.463 µs]
Day11 - Part1/grouped           time:   [57.347 µs 57.507 µs 57.659 µs]
Day11 - Part2/cached            time:   [2.9647 ms 2.9701 ms 2.9764 ms]
Day11 - Part2/cached_multicache time:   [2.8079 ms 2.8120 ms 2.8163 ms]
Day11 - Part2/grouped           time:   [3.1182 ms 3.1223 ms 3.1268 ms]
```
