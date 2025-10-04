---
publishDate: 2024-12-20
title: Day 20 - Race Condition
author: Barr
keywords: [Advent of Code, Rust]
description: Yet Another Maze.
summary: |
  Maze solving has gotten boring even for these robots, so they started cheating.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day20.rs
---
## Input
A simple maze, `.` for paths, `#` for walls, `S` for the start and `E` for the end, for example:
```
###############
#...#...#.....#
#.#.#.#.#.###.#
#S#...#.#.#...#
#######.#.#.###
#######.#.#...#
#######.#.###.#
###..E#...#...#
###.#######.###
#...###...#...#
#.#####.#.###.#
#.#...#.#.#...#
#.#.#.#.#.#.###
#...#...#...###
###############
```
If only this was all there is to it...

## Part 1
Since the robots got bored racing along the same maze at the same speed on the same path, they are now allowed to cheat: they can "disable collision" for 2 steps, allowing them to pass through a single wall.

The answer for this part is how many unique pairs of positions for the start and end of the cheat save at least 100 steps from the optimal no cheats path.

After a couple failed attempts at various BFS and DFS solutions that allowed a single "cheat", I had a new idea:  
If I know the distance to the end from every point in the maze, checking both sides of any wall will tell me how many steps will crossing it save, if at all.  
So first I need to calculate the distance from the end at every position, that is done using a basic BFS from the end:
```rust
fn part1_first_inner(input: &[u8], min_shortcut_size: u32) -> u32 {
    let min_shortcut_size = min_shortcut_size + 2;
    let side_size = memchr::memchr(b'\n', input).unwrap() + 1;
    let start = memchr::memchr(b'S', input).unwrap();
    let end = memchr::memchr(b'E', input).unwrap();
    let distance_to_end = compute_distances_to(input, side_size, end, min_shortcut_size);
    find_shortcuts(input, &distance_to_end, start, side_size, min_shortcut_size)
}
fn compute_distances_to(
    input: &[u8],
    side_size: usize,
    end: usize,
    min_shortcut_size: u32,
) -> Vec<u32> {
    let mut distance_to = vec![u32::MAX - min_shortcut_size; input.len()];
    let mut queue = vec![end];
    let mut queue_next = Vec::<usize>::new();
    for step in 0u32.. {
        while let Some(pos) = queue.pop() {
            if distance_to[pos] <= step {
                continue;
            }
            distance_to[pos] = step;
            if input[pos - 1] != b'#' {
                queue_next.push(pos - 1);
            }
            if input[pos + 1] != b'#' {
                queue_next.push(pos + 1);
            }
            if input[pos - side_size] != b'#' {
                queue_next.push(pos - side_size);
            }
            if input[pos + side_size] != b'#' {
                queue_next.push(pos + side_size);
            }
        }
        if queue_next.is_empty() {
            return distance_to;
        }
        std::mem::swap(&mut queue, &mut queue_next);
    }
    unreachable!()
}
```
Next I pass this `distance_to_end` result to the function that starts another BFS from the start, and "peeks" through walls to find cheats that save enough steps:
```rust
fn find_shortcuts(
    input: &[u8],
    distance_to_end: &[u32],
    start: usize,
    side_size: usize,
    min_shortcut_size: u32,
) -> u32 {
    let mut visited = vec![false; input.len()];
    visited[start] = true;
    let mut queue = vec![start];
    let mut queue_next = Vec::<usize>::new();
    let mut count = 0u32;
    for _step in 0u32..(distance_to_end[start] - min_shortcut_size) {
        while let Some(pos) = queue.pop() {
            let curr_distance = distance_to_end[pos];
            // "peek" through walls
            if pos >= 2 * side_size
                && distance_to_end[pos - 2 * side_size] + min_shortcut_size <= curr_distance
            {
                count += 1;
            }
            if distance_to_end.len() >= pos + 2 * side_size
                && distance_to_end[pos + 2 * side_size] + min_shortcut_size <= curr_distance
            {
                count += 1;
            }
            if distance_to_end[pos - 2] + min_shortcut_size <= curr_distance {
                count += 1;
            }
            if distance_to_end[pos + 2] + min_shortcut_size <= curr_distance {
                count += 1;
            }
            // continue path finding
            if !visited[pos - 1] && input[pos - 1] != b'#' {
                visited[pos - 1] = true;
                queue_next.push(pos - 1);
            }
            if !visited[pos + 1] && input[pos + 1] != b'#' {
                visited[pos + 1] = true;
                queue_next.push(pos + 1);
            }
            if !visited[pos - side_size] && input[pos - side_size] != b'#' {
                visited[pos - side_size] = true;
                queue_next.push(pos - side_size);
            }
            if !visited[pos + side_size] && input[pos + side_size] != b'#' {
                visited[pos + side_size] = true;
                queue_next.push(pos + side_size);
            }
        }
        std::mem::swap(&mut queue, &mut queue_next);
    }
    count
}
```
And that's all.  
Every other solution I tried simply took too long so I don't even know if they would have worked.

## Part 2
Now every robot can cheat for 20 consecutive steps(can only disable and enable collision once overall), the question is still how many unique start and end pairs there are.  

This one requires a more generic approach, since there are a lot more than 4 positions to check, for that reason I replaced the 4 checks in the 2nd path-finding loop with a single call to the function that will handle that part:
```rust
count += check_specific_shortcut_start(distance_to_end, pos, min_shortcut_size, side_size);
```

This function scans in a diamond shape around `pos` for cheats that save enough steps:
```rust
fn check_specific_shortcut_start(
    distance_to_end: &[u32],
    start_pos: usize,
    min_shortcut_size: u32,
    side_size: usize,
) -> u32 {
    let start_distance = distance_to_end[start_pos];
    let start_x = start_pos % side_size;
    let start_y = start_pos / side_size;
    let mut count = 0u32;
    for vertical_difference in -20i32..=20 {
        let test_y = start_y as i32 + vertical_difference;
        if test_y > 0 && test_y < side_size as i32 - 1 {
            let max_horizontal_difference = 20 - vertical_difference.abs();
            for horizontal_difference in -max_horizontal_difference..=max_horizontal_difference {
                let test_x = start_x as i32 + horizontal_difference;
                if test_x > 0
                    && test_x < side_size as i32 - 1
                    && distance_to_end[(test_y * side_size as i32 + test_x) as usize]
                        + min_shortcut_size
                        <= start_distance
                            - vertical_difference.unsigned_abs()
                            - horizontal_difference.unsigned_abs()
                {
                    count += 1;
                }
            }
        }
    }
    count
}
```

It took me a while to fix all the little bugs but eventually I got the correct answer and finished the day.

## Optimization
Since part 2 is so slow, I will focus on it today:
```
Day20 - Part1/(default) time:   [156.84 µs 156.99 µs 157.13 µs]
Day20 - Part2/(default) time:   [12.637 ms 12.643 ms 12.649 ms]
```
`RangeInclusive` is known to cause some performance issues due to an extra check that it does on every iteration, replacing `..=20` with `..21` and `..=max_horizontal_difference` with `..max_horizontal_difference+1` is enough to improve the performance:
```
Day20 - Part2/(default) time:   [10.660 ms 10.754 ms 10.891 ms]
```
The only other thing I will try is parallelizing it using `rayon`, this involves turning `count` into an atomic, and spawning a new task for every `check_specific_shortcut_start` call:
```rust
    ...
    let count = &AtomicU32::new(0);
    rayon::scope(|s| {
        for _step in 0u32..(distance_to_end[start] - min_shortcut_size) {
            while let Some(pos) = queue.pop() {
                s.spawn(move |_| {
                    count.fetch_add(
                        check_specific_shortcut_start(
                            distance_to_end,
                            pos,
                            min_shortcut_size,
                            side_size,
                        ),
                        Relaxed,
                    );
                });
    ...
```
```
Day20 - Part2/rayon     time:   [3.0121 ms 3.0259 ms 3.0424 ms]
```
A decent improvement.
