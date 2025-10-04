---
publishDate: 2024-12-19
title: Day 19 - Linen Layout
author: Barr
keywords: [Advent of Code, Rust]
description: A simple recursion problem.
summary: |
  Today's goal is finding whether(and later, in how many ways) can striped towels be arranged in various patterns.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day19.rs
---
## Input
The input starts with a long line of the available towels, for example:
```
r, wr, b, g, bwu, rb, gb, br
```
Means there are towels with a single red(`r`) stripe, towels with a single white(`w`) stripe followed by  a single red(`r`) stripe, and so on.  
Next, after an empty line, each line represent a stripe pattern that need to be verified, for example:
```
brwrr
```
Can be made out of the `br` towel, followed by the `wr` towel and the `r` towel.  

But the pattern:
```
ubwu
```
Can't be made with any combination of towels.

## Initial Solutions

### Part 1
In part 1 the output is simply how many patterns are possible.  
First, the parsing of the available towers and the outer function call:
```rust
fn parse_available_pattern(patterns_string: &[u8]) -> Vec<&[u8]> {
    let mut last_needle = 0usize;
    let mut patterns: Vec<&[u8]> = memchr_iter(b' ', patterns_string)
        .map(|needle_pos| {
            let res = &patterns_string[last_needle..needle_pos - 1];
            last_needle = needle_pos + 1;
            res
        })
        .collect();
    patterns.push(&patterns_string[last_needle..]);
    patterns
}
pub fn part1_recursive(input: &[u8]) -> usize {
    let patterns_end = memchr::memchr(b'\n', input).unwrap();
    let patterns = parse_available_pattern(&input[..patterns_end]);
    let mut cache = Default::default();
    input[patterns_end + 2..]
        .split(|&c| c == b'\n')
        .filter(|&potential_pattern| {
            verify_potential_pattern(potential_pattern, &patterns, &mut cache)
        })
        .count()
}
```
Not a lot to explain, simply splitting the first line into the towels, and calling the `verify_potential_pattern` function for each potential pattern.  

`verify_potential_pattern` is a simple recursive algorithm that tries to match the end of each pattern with the available towels, remove it and check the remainder of the pattern.

I started with this:
```rust
fn verify_potential_pattern(
    potential_pattern: &[u8],
    patterns: &Vec<&[u8]>,
) -> bool {
    if potential_pattern.is_empty() {
        return true;
    }
    let ans = patterns.iter().any(|&pattern| {
        potential_pattern.ends_with(pattern) && {
            let sub_pattern = &potential_pattern[..potential_pattern.len()-pattern.len()];
            verify_potential_pattern(sub_pattern, patterns, cache)
        }
    });
    ans
}
```
While this version works in theory, it is way too slow, and would not finish even if given a very long time to run, because the same sub patterns are being revalidated many times.

The solution is adding a cache:
```rust
fn verify_potential_pattern<'a>(
    potential_pattern: &'a [u8],
    patterns: &Vec<&[u8]>,
    cache: &mut FxHashMap<&'a [u8], bool>,
) -> bool {
    if potential_pattern.is_empty() {
        cache.insert(potential_pattern, true);
        return true;
    }
    let ans = patterns.iter().any(|&pattern| {
        potential_pattern.ends_with(pattern) && {
            let sub_pattern = &potential_pattern[..potential_pattern.len()-pattern.len()];
            let cached_res = cache.get(sub_pattern);
            if let Some(&r) = cached_res {
                r
            } else {
                verify_potential_pattern(sub_pattern, patterns, cache)
            }
        }
    });
    cache.insert(potential_pattern, ans);
    ans
}
```
Note the lifetime I needed to add to make the compiler let put the patterns in the cache.  
This version actually finishes in a few milliseconds and gives the correct answer.

### Part 2
This is only a small variation on part 1: how many ways can each potential pattern be created from towels.  
To solve this, only a few changes need to be made to part 1:
```rust
fn count_potential_pattern<'a>(
    potential_pattern: &'a [u8],
    patterns: &Vec<&[u8]>,
    cache: &mut FxHashMap<&'a [u8], usize>,
) -> usize {
    if potential_pattern.is_empty() {
        cache.insert(potential_pattern, 1);
        return 1;
    }
    let ans = patterns
        .iter()
        .map(|&pattern| {
            if potential_pattern.ends_with(pattern) {
                let sub_pattern = &potential_pattern[..potential_pattern.len()-pattern.len()];
                let cached_res = cache.get(sub_pattern);
                if let Some(&r) = cached_res {
                    r
                } else {
                    count_potential_pattern(sub_pattern, patterns, cache)
                }
            } else {
                0
            }
        })
        .sum();
    cache.insert(potential_pattern, ans);
    ans
}
```
Every place that returned a boolean now returns a count, and instead of `any`, I map from every the pattern to its count, and then sum the count from all the patterns.

## Optimizations
These are the times for the current versions:
```
Day19 - Part1/(default) time:   [10.533 ms 10.548 ms 10.564 ms]
Day19 - Part2/(default) time:   [36.278 ms 36.358 ms 36.463 ms]
```

### Multithreading
My first idea is to make the code multithreaded using `rayon`, but this has one major issue: the cache.  
With the current version every line used the same cache, creating a dependency between the lines, and preventing verifying them at the same time.  
The simplest solution is to simply create a new cache for every line:
```rust
pub fn part1_rayon(input: &[u8]) -> usize {
    let patterns_end = memchr::memchr(b'\n', input).unwrap();
    let patterns = parse_available_pattern(&input[..patterns_end]);
    input[patterns_end + 2..]
        .par_split(|&c| c == b'\n')
        .filter(|&potential_pattern| {
            let mut cache = Default::default();
            verify_potential_pattern(potential_pattern, &patterns, &mut cache)
        })
        .count()
}
pub fn part2_rayon(input: &[u8]) -> usize {
    let patterns_end = memchr::memchr(b'\n', input).unwrap();
    let patterns = parse_available_pattern(&input[..patterns_end]);
    input[patterns_end + 2..]
        .par_split(|&c| c == b'\n')
        .map(|potential_pattern| {
            let mut cache = Default::default();
            count_potential_pattern(potential_pattern, &patterns, &mut cache)
        })
        .sum()
}
```
A lot faster than the original version on my 12 threads:
```
Day19 - Part1/rayon     time:   [2.3753 ms 2.3849 ms 2.3964 ms]
Day19 - Part2/rayon     time:   [6.4666 ms 6.4975 ms 6.5331 ms]
```

### Sharing The Cache?
A `RWLock` can let me share the cache between the threads, and requires very few changes:

- The cache creation goes back to its original position outside the line iteration.
- Every `cache.insert` is replaced with `cache.write().insert`.
- Every `cache.get` is replaced with `cache.read().get`

Unfortunately this is actually a lot slower:
```
Day19 - Part1/rayon_rw  time:   [6.5386 ms 6.6520 ms 6.7676 ms]
Day19 - Part2/rayon_rw  time:   [21.956 ms 22.025 ms 22.094 ms]
```
I am pretty certain that this is because every pattern creates almost completely unique entries in the cache: their prefixes rarely match, and along with the cost of using the lock so often, this leads to a big performance loss.

### Front To Back
Why did I use `ends_with` and not `starts_with`? Mostly because of an earlier idea I had that converted every pattern into an integer and checked for patterns using bitwise operations(which I ended up not implementing because the potential patterns would be 256 bit integers, which have very little support and would probably only make things even slower).

Replacing every `ends_with` with `starts_with` and every making every sub pattern remove the pattern from the front and not the back, leads to a surprisingly big performance gain in part 1, and a measurable improvement in part 2, in every single version:
```
Day19 - Part1/(default) time:   [6.3477 ms 6.3529 ms 6.3587 ms]
                        change: [-39.878% -39.769% -39.676%] (p = 0.00 < 0.05)
Day19 - Part1/rayon     time:   [1.3387 ms 1.3500 ms 1.3636 ms]
                        change: [-43.975% -43.459% -42.929%] (p = 0.00 < 0.05)
Day19 - Part1/rayon_rw  time:   [5.3594 ms 5.3750 ms 5.3925 ms]
                        change: [-20.602% -19.196% -17.755%] (p = 0.00 < 0.05)
Day19 - Part2/(default) time:   [30.549 ms 30.585 ms 30.628 ms]
                        change: [-16.131% -15.876% -15.660%] (p = 0.00 < 0.05)
Day19 - Part2/rayon     time:   [6.1534 ms 6.2254 ms 6.3007 ms]
                        change: [-5.3975% -4.1867% -2.8717%] (p = 0.00 < 0.05)
Day19 - Part2/rayon_rw  time:   [20.905 ms 20.980 ms 21.057 ms]
                        change: [-5.1718% -4.7444% -4.2717%] (p = 0.00 < 0.05
```

### A Simpler Cache
My last idea is that now that the cache(for the rayon version) is unique to each potential pattern, I don't actually need to use the pattern as the key to the cache, the length of the pattern is already a unique identifier, which means I don't even need a hash-map anymore, a simple vector will suffice:
```rust {hl_lines=[4,9,16]}
fn verify_potential_pattern_rayon(
    potential_pattern: &[u8],
    patterns: &Vec<&[u8]>,
    cache: &mut [Option<bool>],
) -> bool {
    let ans = patterns.iter().any(|&pattern| {
        potential_pattern.starts_with(pattern) && {
            let sub_pattern = &potential_pattern[pattern.len()..];
            if let Some(r) = cache[sub_pattern.len()] {
                r
            } else {
                verify_potential_pattern_rayon(sub_pattern, patterns, cache)
            }
        }
    });
    cache[potential_pattern.len()] = Some(ans);
    ans
}
```
A similar change was applied to part 2.

This change leads to another small performance gain:
```
Day19 - Part1/rayon     time:   [1.3631 ms 1.3739 ms 1.3875 ms]
Day19 - Part2/rayon     time:   [5.4504 ms 5.4968 ms 5.5453 ms]
```

### Part 2 Rewrite: No More Recursion
The new version that uses a vector as a cache gave me an idea: solving it using dynamic programming.  
Fairly simple function that computes the amount of ways to build each length of pattern:
```rust
fn count_potential_pattern_rewrite(potential_pattern: &[u8], patterns: &Vec<&[u8]>) -> u64 {
    let mut reachable = vec![0u64; potential_pattern.len() + 1];
    reachable[0] = 1;
    for start in 0..potential_pattern.len() {
        let reachable_current = reachable[start];
        if reachable_current == 0 {
            continue;
        }
        patterns.iter().for_each(|&p| {
            if potential_pattern[start..].starts_with(p) {
                reachable[start + p.len()] += reachable_current;
            }
        });
    }
    reachable[potential_pattern.len()]
}
```
This is a little faster than the original part 2:
```
Day19 - Part2/rewrite   time:   [24.403 ms 24.439 ms 24.475 ms]
```
And using this function with rayon makes it a faster as well:
```
Day19 - Part2/rayon     time:   [4.5303 ms 4.5367 ms 4.5432 ms]
```
Unfortunately, this method will not accelerate part 1, because it checks every single way to build the pattern, in a breadth-first manner.


### Slow Iterators
Sometimes iterators can cause significant slow downs compared to the usual loop syntax, and this turned out to be one of those cases.

When I was looking at the `perf annotate` results of the single threaded version of part 1, I noticed a lot of time was spent on these instructions:
```asm
;     let ans = patterns.iter().any(|&pattern| {
  pushq        %rbp
  pushq        %r15
  pushq        %r14
  pushq        %r13
  pushq        %r12
  pushq        %rbx
```
These instructions are usually used as part of a function call procedure.  
For every iteration inside `any`, the program pushes and pops variables from the stack, like they are function arguments, which is what `any` and other iterator technically does: call the given closure in some pattern.  
Usually a few of these instructions don't have a big effect on performance, and very often the compiler manages to optimize them away, but not this time.

I rewrote all the `verify_potential_pattern` functions(original, `rayon`, `RWLock`) to use simple for-loops like so:
```rust
fn verify_potential_pattern<'a>(
    potential_pattern: &'a [u8],
    patterns: &Vec<&[u8]>,
    cache: &mut FxHashMap<&'a [u8], bool>,
) -> bool {
    for &pattern in patterns {
        if potential_pattern.starts_with(pattern) {
            if potential_pattern.len() == pattern.len() {
                cache.insert(potential_pattern, true);
                return true;
            }
            let sub_pattern = &potential_pattern[pattern.len()..];
            if cache.get(sub_pattern) == Some(&true)
                || verify_potential_pattern(sub_pattern, patterns, cache)
            {
                cache.insert(potential_pattern, true);
                return true;
            }
        }
    }
    cache.insert(potential_pattern, false);
    false
}
```
Which made 2 of them significantly faster:
```
Day19 - Part1/(default) time:   [4.3911 ms 4.3960 ms 4.4010 ms]
Day19 - Part1/rayon     time:   [712.35 µs 725.29 µs 741.61 µs]
Day19 - Part1/rayon_rw  time:   [4.9127 ms 4.9789 ms 5.0422 ms]
```
I am guessing that the compiler somehow avoided the stack operations only in the `RWLock` version.

And looking at the assembly instructions again, the `pushq` instructions are gone, almost all of the time is spent on `starts_with` now.

The part 2 instructions did not generate the `pushq` instructions inside the iterators to begin with.


### Hash-Set Patterns
This last improvement I got from Discord:  
Storing the patterns inside a Hash-Set allows checking if a specific pattern exists very fast, the issue is that given a potential pattern, the specific pattern to search inside the set is unknown, because it could be any prefix of the potential pattern.  
The answer is simple: just check *every* prefix up to the longest pattern in the set.  

So now pattern parsing looks like this:
```rust
fn parse_available_pattern_hashset(patterns_string: &[u8]) -> (FxHashSet<&[u8]>, usize) {
    let mut last_needle = 0usize;
    let mut max_length = 0usize;
    let mut patterns: FxHashSet<_> = memchr_iter(b' ', patterns_string)
        .map(|needle_pos| {
            let res = &patterns_string[last_needle..needle_pos - 1];
            last_needle = needle_pos + 1;
            max_length = max_length.max(res.len());
            res
        })
        .collect();
    patterns.insert(&patterns_string[last_needle..]);
    (patterns, max_length)
}
```

And in both part 1 and now, the pattern iterations that looked like this:
```rust
for &pattern in patterns {
    if potential_pattern.starts_with(pattern) {
      ...
```
Now look like this:
```rust
for l in 1..potential_pattern.len().min(max_length) + 1 {
    if patterns.contains(&potential_pattern[..l]) {
      ...
```
Since the amount of patterns is so much bigger than the longest pattern, this ends up being faster, despite accessing the hash set many times.

I applied this improvement to both the single threaded and rayon solutions, and they all got a lot faster:
```
Day19 - Part1/(default)       time:   [4.3911 ms 4.3960 ms 4.4010 ms]
Day19 - Part1/hashset         time:   [1.0393 ms 1.0396 ms 1.0398 ms]

Day19 - Part1/rayon           time:   [712.35 µs 725.29 µs 741.61 µs]
Day19 - Part1/hashset_rayon   time:   [106.73 µs 107.82 µs 108.90 µs]

Day19 - Part2/rewrite         time:   [24.403 ms 24.439 ms 24.475 ms]
Day19 - Part2/rewrite_hashset time:   [2.2961 ms 2.2976 ms 2.2991 ms]

Day19 - Part2/rayon           time:   [4.5303 ms 4.5367 ms 4.5432 ms]
Day19 - Part2/hashset_rayon   time:   [404.66 µs 406.93 µs 409.73 µs]
```
And that's all for today.
