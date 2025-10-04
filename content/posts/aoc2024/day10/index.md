---
publishDate: 2024-12-10
title: Day 10 - Hoof It
author: Barr
keywords: [Advent of Code, Rust]
description: The first pathfinding day.
summary: |
  Today's challange is a simple pathfinding one: find trails in increasing heights on a topological map.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day10.rs
---
## Input
The input is a topological map, and trailheads are defined as the starts of trails in the topological map that go from 0-9 in steps of 1, for example, the input:
```
0123
1234
8765
9876
```
Has 1 trailhead.

## Part 1
A trailhead's score is the amount of different 9s reachable from the trailhead, so this input(irrelevant numbers removed):
```
..90..9
...1.98
...2..7
6543456
765.987
876....
987....

```
Has 1 trailhead with a score of 4.
In part 1 the necessary output is the sum of all the trailhead scores.  
So I started by iterating over the 0s and calculating their scores separately:
```rust
#[aoc(day10, part1, first)]
pub fn part1_first(input: &[u8]) -> u32 {
    let width = input.iter().position(|&c| c == b'\n').unwrap() + 1;
    let height = input.len() / width;
    memchr::memrchr_iter(b'0', input)
        .map(|start| find_trailhead_score(input, start, width, height))
        .sum()
}
```
And `find_trailhead_score` is a simple [DFS](https://en.wikipedia.org/wiki/Depth-first_search) algorithm, that only goes on valid trails:
```rust
fn find_trailhead_score(input: &[u8], start: usize, width: usize, height: usize) -> u32 {
    let mut queue = Vec::new();
    let mut visited = bitvec![0; input.len()];
    let mut score = 0u32;
    queue.push((start, start % width, start / width, b'0'));
    visited.set(start, true);
    while let Some((curr, curr_x, curr_y, depth)) = queue.pop() {
        // trail end reached
        if depth == b'9' {
            score += 1;
            continue;
        }
        if curr_x > 0 && input[curr - 1] == depth + 1 && !visited[curr - 1] {
            visited.set(curr - 1, true);
            queue.push((curr - 1, curr_x - 1, curr_y, depth + 1));
        }
        if curr_x < width - 2 && input[curr + 1] == depth + 1 && !visited[curr + 1] {
            visited.set(curr + 1, true);
            queue.push((curr + 1, curr_x + 1, curr_y, depth + 1));
        }
        if curr_y > 0 && input[curr - width] == depth + 1 && !visited[curr - width] {
            visited.set(curr - width, true);
            queue.push((curr - width, curr_x, curr_y - 1, depth + 1));
        }
        if curr_y < height && input[curr + width] == depth + 1 && !visited[curr + width] {
            visited.set(curr + width, true);
            queue.push((curr + width, curr_x, curr_y + 1, depth + 1));
        }
    }
    score
}
```

## Part 2
In part 2, a rating of a trailhead is defined as the number of distinct trails from that trailhead, meaning getting to the same 9 via multiple paths must be counted.  
The output now is the sum of all ratings.  
This actually makes part 2 easier than part 1, since all paths must be counted, the code in part 1 that doesn't visit the same place twice needs to be removed, and that's it:
```rust
fn find_trailhead_rating(input: &[u8], start: usize, width: usize, height: usize) -> u32 {
    let mut queue = Vec::new();
    let mut score = 0u32;
    queue.push((start, start % width, start / width, b'0'));
    while let Some((curr, curr_x, curr_y, depth)) = queue.pop() {
        // trail end reached
        if depth == b'9' {
            score += 1;
            continue;
        }
        if curr_x > 0 && input[curr - 1] == depth + 1 {
            queue.push((curr - 1, curr_x - 1, curr_y, depth + 1));
        }
        if curr_x < width - 2 && input[curr + 1] == depth + 1 {
            queue.push((curr + 1, curr_x + 1, curr_y, depth + 1));
        }
        if curr_y > 0 && input[curr - width] == depth + 1 {
            queue.push((curr - width, curr_x, curr_y - 1, depth + 1));
        }
        if curr_y < height && input[curr + width] == depth + 1 {
            queue.push((curr + width, curr_x, curr_y + 1, depth + 1));
        }
    }
    score
}
```

## Optimizations
Initial times(with CPU clock locked):
```
Day10 - Part1/first     time:   [52.868 µs 52.932 µs 53.008 µs]
Day10 - Part2/first     time:   [67.044 µs 67.101 µs 67.166 µs]
```
I've already considered that calculating `curr` from `curr_x` and `curr_y` or the other way is probably slower than simply storing all 3 on the queue, and at this stage I measured both and saw that I was correct, storing all 3 is a little faster.

Looking at a [flamegraph](flamegraph_before.svg) for part 1, I saw around 6% of time spent growing and dropping vectors, I tried allocating a single vector for the whole solution, and share it with all the iterations:
```rust
let mut buffer = Vec::new();
memchr::memrchr_iter(b'0', input)
    .map(|start| find_trailhead_score_buffer(input, start, width, height, &mut buffer))
    .sum()
```
Part 2 was updated in the same way, the function now uses buffer instead of creating its own.  
Clearing the buffer is not necessary as the function always finishes with an empty queue.  
In the new [flamegraph](flamegraph_after.svg), those times are gone, and the overall performance has improved:
```
Day10 - Part1/buffer    time:   [45.312 µs 45.350 µs 45.395 µs]
Day10 - Part2/buffer    time:   [49.954 µs 50.015 µs 50.079 µs]
```
I've also tried preallocating the `BitVec`(and zero filling between calls) but the performance degraded a little:
```
Day10 - Part1/buffer    time:   [46.653 µs 46.740 µs 46.844 µs]
```
Noticing that part 2 is not far behind part 1 even while going over the same places multiple times, I tried removing the checks from part 1 except for tracking trail ends:
```rust
if depth == b'9' && !visited[curr] {
    visited.set(curr, true);
    score += 1;
    continue;
}
if curr_x > 0 && input[curr - 1] == depth + 1 {
    queue.push((curr - 1, curr_x - 1, curr_y, depth + 1));
}
..
```
But that made it a lot slower:
```
Day10 - Part1/buffer    time:   [69.488 µs 69.567 µs 69.658 µs]
```
I've also tried removing the `depth` value from the queue and getting it from the input after popping the `curr` value but it was also a little slower.  

My last idea was to search trails from 9 to 0 instead of 0 to 9, since the count would be identical, and there are only 131 9s in my input, compared to 179 0s, and I assume there are also less 9s than 0s in other inputs.  
This change involves:

- Searching for starting 9s
- Pushing 9 as the starting depth
- Pushing `depth - 1` instead of `depth + 1`
- Stopping on 0s

In both the part 1 and part 2 buffer solutions.  
```
Day10 - Part1/buffer_backwards time:   [36.050 µs 36.270 µs 36.624 µs]
Day10 - Part2/buffer_backwards time:   [39.186 µs 39.211 µs 39.235 µs]
```
As expected, even faster.

Despite being easily parallelizable, the times today are so short it will probably only hurt performance, or speed it up very marginally at the cost of using many cores.

## Final Times
Unlocking the CPU clock I get these times:
```
Day10 - Part1/buffer_backwards time:   [25.546 µs 25.594 µs 25.640 µs]
Day10 - Part2/buffer_backwards time:   [29.363 µs 29.446 µs 29.521 µs]
```
Pretty fast
