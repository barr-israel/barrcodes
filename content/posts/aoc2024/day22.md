---
publishDate: 2024-12-22
title: Day 22 - Monkey Market
author: Barr
keywords: [Advent of Code, Rust]
description: A simple day compared to yesterday's monstrosity - just a little psudo-random number generation.
summary: |
  Monkeys are buying hiding spots at a psudo-random price, which I need to predict to maximize profit.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day22.rs
---
## Input
Every line contains the first "secret" of each monkey, which is a number(that fits in `u32`).  
The secret is effectively the seed and the initial state for the following pseudo-random number generation algorithm:
```rust
fn step_secret(mut secret: u32) -> u32 {
    const PRUNE: u32 = (1 << 24) - 1;
    let step1 = secret << 6;
    secret ^= step1;
    secret &= PRUNE;
    let step2 = secret >> 5;
    secret ^= step2;
    let step3 = secret << 11;
    secret ^= step3;
    secret &= PRUNE;
    secret
}
```
The algorithm definition actually states there is another prune between steps 2 and 3, but in reality it will never actually have any effect, because step 2 shifts *right*.

## Part 1
Part 1 asks what is the sum of all the random numbers after 2000 steps(not including the initial seed).

Pretty simple:  
First, a function that finds the final number for each seed:
```rust
fn multi_step_secret(secret: u32, steps: u32) -> u32 {
    (0..steps).fold(secret, |s, _| step_secret(s))
}
```
And a function that parses the input and calls this function:
```rust
pub fn part1_first(mut input: &[u8]) -> u64 {
    let mut sum = 0u64;
    loop {
        let (first_secret, remainder) = fast_parse(input);
        sum += multi_step_secret(first_secret, 2000) as u64;
        if remainder.is_empty() {
            return sum;
        }
        input = &remainder[1..];
    }
}
```
And that's all.

## Part 2
Part 2 explains that the price the monkeys are paying is actually just the last digit of each number, and the only way to make a sale is through another monkey that will only sell when the price shows some pattern, that pattern is the difference between the last 5 prices, and the monkey will use the same pattern for all sales.  

The goal is to find the pattern that will maximize the profit, if a pattern does not appear at all within the 2000 numbers, the monkey will not sell anything in that series.  

So now I need to track the state at each step, and not only the final one, and do the following:

- Calculate the price as `state % 10`
- Calculate the difference from the previous price.
- Put the price and the last 4 differences on some record to use later.

I decided to simply use a `HashMap` from some difference pattern `(i8,i8,i8,i8)` to the profit from picking it.  
```rust
pub fn part2_first(mut input: &[u8]) -> u32 {
    let mut profits: FxHashMap<(i8, i8, i8, i8), u32> = Default::default();
    loop {
        let (secret1, remainder) = fast_parse(input);
        // the first 4 prices don't have a full pattern and are not a possible option
        let price1 = (secret1 % 10) as i8;
        let secret2 = step_secret(secret1);
        let price2 = (secret2 % 10) as i8;
        let diff1 = price2 - price1;
        let secret3 = step_secret(secret2);
        let price3 = (secret3 % 10) as i8;
        let diff2 = price3 - price2;
        let secret4 = step_secret(secret3);
        let price4 = (secret4 % 10) as i8;
        let diff3 = price4 - price3;
        let mut seen_pattern: FxHashSet<(i8, i8, i8, i8)> = Default::default();
        // the rest of the steps
        (0..1997).fold(
            (secret4, price4, (0, diff1, diff2, diff3)),
            |(secret, price, history), _| {
                let next_secret = step_secret(secret);
                let next_price = (next_secret % 10) as i8;
                let diff = next_price - price;
                let next_history = (history.1, history.2, history.3, diff);
                // only possible pattern if it wasn't seen already
                // if it was seen already, the monkey would have stopped there
                if seen_pattern.insert(next_history) {
                    *profits.entry(next_history).or_insert(0) += next_price as u32;
                }
                (next_secret, next_price, next_history)
            },
        );
        if remainder.is_empty() {
            break;
        }
        input = &remainder[1..];
    }
    profits.into_values().max().unwrap()
}
```
The first version of this function did not have `seen_pattern`, which allowed the monkey to sell multiple times on the same series with the same pattern, returning the wrong output.

This version works but its fairly slow, so it's time for a few optimizations.  

## Optimizations
The starting runtime for both versions:
```
Day22 - Part1/(default) time:   [7.4812 ms 7.5023 ms 7.5240 ms]
Day22 - Part2/(default) time:   [123.12 ms 123.39 ms 123.73 ms]
```
### Part 1
#### Rayon
My first improvement was to use `rayon`, for that I need to collect that numbers into a vector and then iterate over them in parallel:
```rust
pub fn part1_rayon(mut input: &[u8]) -> u64 {
    let mut seeds = Vec::new();
    loop {
        let (seed, remainder) = fast_parse(input);
        seeds.push(seed);
        if remainder.is_empty() {
            break;
        }
        input = &remainder[1..];
    }
    seeds
        .into_par_iter()
        .map(|s| multi_step_secret(s, 2000) as u64)
        .sum()
}
```
And this resulted in a big speedup:
```
Day22 - Part1/rayon     time:   [976.12 µs 1.0052 ms 1.0311 ms]
```

#### SIMD
This pseudo-random algorithm is very easy to implement using SIMD, in order to advance multiple states at the same time:
```rust
fn multi_step_secret_simd(secret: &[u32; 32], steps: u32) -> u32 {
    let prune = u32x32::splat((1 << 24) - 1);
    let mut secret_simd = u32x32::from_slice(secret);
    for _step in 0..steps {
        let step1 = secret_simd << 6;
        secret_simd ^= step1;
        secret_simd &= prune;
        let step2 = secret_simd >> 5;
        secret_simd ^= step2;
        let step3 = secret_simd << 11;
        secret_simd ^= step3;
        secret_simd &= prune;
    }
    secret_simd.reduce_sum()
}
```
And the outer function now needs to pass chunks of 32 seeds at a time:
```rust
let mut sum = seeds
    .array_chunks()
    .map(|s: &[u32; 32]| multi_step_secret_simd(s, 2000) as u64)
    .sum();
sum += seeds
    .array_chunks::<32>()
    .remainder()
    .iter()
    .map(|&s| multi_step_secret(s, 2000) as u64)
    .sum::<u64>();
sum
```
I handle the remainder(the last chunk that is smaller than 32 numbers) using the original `multi_step_secret`.

I picked 32 is the lane width through experimentations, despite only have 256 bit wide registers(which can fit 8 `u32`s), 32 was the fastest, with a run time of:
```
Day22 - Part1/simd      time:   [410.58 µs 410.84 µs 411.14 µs]
```
Even faster than `rayon`, and I'm only using only 1 thread.

#### SIMD+Rayon
I've tried both separately, but both is even better:
```rust
let mut sum = seeds
    .par_chunks_exact(32)
    .map(|chunk| multi_step_secret_simd_chunk(chunk, 2000) as u64)
    .sum();
sum += seeds
    .par_chunks_exact(32)
    .remainder()
    .iter()
    .map(|&s| multi_step_secret(s, 2000) as u64)
    .sum::<u64>();
sum
```
`multi_step_secret_simd_chunk` is identical to `multi_step_secret_simd` but it accepts an unsized slice instead of a sized one because `rayon` doesn't have `array_chunks`.

And now it's even faster:
```
Day22 - Part1/simd_rayon time:   [181.67 µs 184.36 µs 187.63 µs]
```

### Part 2
#### No More Hashing
The pattern domain is small enough to fit in a big array, at around 130k patterns.  
This means changing the type of `profits` from `HashMap<(i8,i8,i8,i8),u32>` to `[u32;19*19*19*19]`, and the type of `seen_pattern` from `HashSet<(i8,i8,i8,i8)>` to `BitArray<[usize; 2037]>`(I used a bit array instead of a normal boolean array to save some memory).  
```rust {hl_lines=[2,8,11,14,15,17,21,22,23]}
pub fn part2_table(mut input: &[u8]) -> u32 {
    let mut profits = [0u32; 19 * 19 * 19 * 19];
    loop {
        let (secret1, remainder) = fast_parse(input);
        let price1 = secret1 % 10;
        let secret2 = step_secret(secret1);
        let price2 = secret2 % 10;
        let diff1 = price2 + 9 - price1;
        let secret3 = step_secret(secret2);
        let price3 = secret3 % 10;
        let diff2 = price3 + 9 - price2;
        let secret4 = step_secret(secret3);
        let price4 = secret4 % 10;
        let diff3 = price4 + 9 - price3;
        let mut seen_pattern = bitarr![0; 19 * 19 * 19 * 19];
        (0..1997).fold(
            (secret4, price4, diff1 * 19 * 19 + diff2 * 19 + diff3),
            |(secret, price, history), _| {
                let next_secret = step_secret(secret);
                let next_price = next_secret % 10;
                let diff = next_price + 9 - price;
                let next_history = (history * 19) % (19 * 19 * 19 * 19) + diff;
                if !seen_pattern.replace(next_history as usize, true) {
                    profits[next_history as usize] += next_price;
                }
                (next_secret, next_price, next_history)
            },
        );
        if remainder.is_empty() {
            break;
        }
        input = &remainder[1..];
    }
    profits.into_iter().max().unwrap()
}
```
To keep the indexes positive I added 9 to all the differences.

And the new time is:
```
Day22 - Part2/table     time:   [18.978 ms 19.072 ms 19.190 ms]
```

Almost 6.5x faster.

#### Rayon
Turning `profits` into an array of atomic integers, I can now use `rayon` to calculate each series in parallel:
```rust
...
let profits: &[AtomicU32; 19 * 19 * 19 * 19] = &from_fn(|_| AtomicU32::new(0));
rayon::scope(|s| loop {
      ...
          if !seen_pattern.replace(next_history as usize, true) {
              profits[next_history as usize].fetch_add(next_price, Relaxed);
          }
      ...
}
profits.iter().map(|p| p.load(Relaxed)).max().unwrap()
```
And now it's even faster:
```
Day22 - Part2/table_rayon time:   [13.341 ms 13.383 ms 13.428 ms]
```
Interacting with the atomic values so much probably has a big effect on this result, and it would be faster if each thread had its own table to sum at the end, but I'm not going to try implementing that today.

Part 2 could also implement SIMD for the pseudo-random algorithm, but the improvement from that will likely disappear within the much longer overall run time.
