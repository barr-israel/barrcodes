---
publishDate: 2024-12-18
title: Day 18 - RAM Run
author: Barr
keywords: [Advent of Code, Rust]
description: Maze solving with a twist - the maze changes over time.
summary: |
  Today's challange involves reaching the end of a maze, a simple request, until it starts changing in part 2.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day18.rs
---
## Input
Unlike other grid-related days, today's input is a list of `(x,y)` coordinates that get blocked over time, every millisecond(just an irrelevant unit, 1 step), one position on the grid is blocked.  
The grid has a size of 71x71.

## Part 1
Part 1 simply asks what is the shortest distance to the end(from (0,0) to (70,70)) after exactly 1024 spots have been blocked.  
A simple [BFS](https://en.wikipedia.org/wiki/Breadth-first_search) algorithm solves this:  
```rust
pub fn part1_first(mut input: &[u8]) -> u32 {
    let mut map = [false; SIZE * SIZE];
    for _ in 0..1024 {
        let (x, rem) = fast_parse::<usize>(input);
        let (y, rem) = fast_parse::<usize>(&rem[1..]);
        map[y * SIZE + x] = true;
        input = &rem[1..];
    }
    let mut queue = Vec::new();
    let mut queue_next = Vec::new();
    queue.push((0usize, 0usize, 0usize));
    map[0] = true;
    let mut curr_distance = 0;
    loop {
        while let Some((pos, pos_x, pos_y)) = queue.pop() {
            if pos == SIZE * SIZE - 1 {
                return curr_distance;
            }
            if pos_x > 0 && !map[pos - 1] {
                map[pos - 1] = true;
                queue_next.push((pos - 1, pos_x - 1, pos_y));
            }
            if pos_x < SIZE - 1 && !map[pos + 1] {
                map[pos + 1] = true;
                queue_next.push((pos + 1, pos_x + 1, pos_y));
            }
            if pos_y > 0 && !map[pos - SIZE] {
                map[pos - SIZE] = true;
                queue_next.push((pos - SIZE, pos_x, pos_y - 1));
            }
            if pos_y < SIZE - 1 && !map[pos + SIZE] {
                map[pos + SIZE] = true;
                queue_next.push((pos + SIZE, pos_x, pos_y + 1));
            }
        }
        curr_distance += 1;
        std::mem::swap(&mut queue, &mut queue_next);
    }
}
```
The only thing to note here is that the input has far more than 1024 lines, so I needed to stop reading before the end of the file.  
Since I won't be optimizing this part further, here is its runtime:
```
Day18 - Part1/(default) time:   [28.585 µs 28.637 µs 28.697 µs]
```
And now it's time for part 2.

## Part 2
Now the goal is to find the position that will block all paths to to end.  
In other words, the positions are blocked one by one, making less paths towards the end available, and at some point a position will blocked that will block the last path, and that is the required output.  

### Naive Solution
The simplest solution is to simply run the algorithm from part 1 on every step in time starting from the 1024 blocked position(since it is known to always have a path to the end), and return the position that makes it fail.  
```rust
fn part2_first_inner(mut input: &[u8]) -> (usize, usize) {
    let mut map = [false; SIZE * SIZE];
    let mut x = 0;
    let mut y = 0;
    for _ in 0..1024 {
        (x, input) = fast_parse::<usize>(input);
        (y, input) = fast_parse::<usize>(&input[1..]);
        map[y * SIZE + x] = true;
        input = &input[1..];
    }
    while can_reach_end(map) {
        (x, input) = fast_parse::<usize>(input);
        (y, input) = fast_parse::<usize>(&input[1..]);
        map[y * SIZE + x] = true;
        input = &input[1..];
    }
    (x, y)
}
```
`can_reach_end` is a similar algorithm to the one part 1, but simpler, it returns `true` if the end was found, and `false` if the queue emptied without reaching the end, so it doesn't need to track path distances.  
Additionally, it uses a single queue and implements [DFS](https://en.wikipedia.org/wiki/Depth-first_search) instead of BFS:
```rust
fn can_reach_end(map: [bool; SIZE * SIZE]) -> bool {
    let mut queue = Vec::new();
    let mut queue_next = Vec::new();
    queue.push((0usize, 0usize, 0usize));
    let mut visited = [false; SIZE * SIZE];
    visited[0] = true;
    loop {
        while let Some((pos, pos_x, pos_y)) = queue.pop() {
            if pos == SIZE * SIZE - 1 {
                return true;
            }
            if pos_x > 0 && !map[pos - 1] && !visited[pos - 1] {
                visited[pos - 1] = true;
                queue_next.push((pos - 1, pos_x - 1, pos_y));
            }
            if pos_x < SIZE - 1 && !map[pos + 1] && !visited[pos + 1] {
                visited[pos + 1] = true;
                queue_next.push((pos + 1, pos_x + 1, pos_y));
            }
            if pos_y > 0 && !map[pos - SIZE] && !visited[pos - SIZE] {
                visited[pos - SIZE] = true;
                queue_next.push((pos - SIZE, pos_x, pos_y - 1));
            }
            if pos_y < SIZE - 1 && !map[pos + SIZE] && !visited[pos + SIZE] {
                visited[pos + SIZE] = true;
                queue_next.push((pos + SIZE, pos_x, pos_y + 1));
            }
        }
        if queue_next.is_empty() {
            return false;
        }
        std::mem::swap(&mut queue, &mut queue_next);
    }
}
```

This method worked, but it is very slow(I'm not going to bother with locking the CPU clock today):
```
Day18 - Part2/(default) time:   [71.299 ms 71.812 ms 72.470 ms]
```
### A Better Solution
A better idea I had was to fill the map with the step in time that blocked each position, instead of just marking it as blocked.  
This way, the algorithm can go through the grid, and each path will remember the smallest map value it passed through, since that is the step in time that will make the path impossible.  
To know which time step blocked the last path to the end, I need to save the maximum value out of those that reached the end.  
When the queue is empty, every path has been evaluated and I can return the position that was blocked at that maximum time step.
```rust
fn part2_better_inner(mut input: &[u8]) -> (usize, usize) {
    let mut map = [u32::MAX; SIZE * SIZE];
    // used for short circuiting paths that meet an existing path with a higher min_on_path
    let mut reachable_with = [0u32; SIZE * SIZE];
    let mut order = Vec::new();
    for i in 0u32.. {
        let (x, rem) = fast_parse::<usize>(input);
        let (y, rem) = fast_parse::<usize>(&rem[1..]);
        map[y * SIZE + x] = i;
        order.push((x, y));
        if rem.is_empty() {
            break;
        }
        input = &rem[1..];
    }
    let mut max_reachable = 0u32;
    let mut queue = Vec::new();
    queue.push((0usize, 0usize, 0usize, u32::MAX));
    while let Some((pos, pos_x, pos_y, min_on_path)) = queue.pop() {
        if pos == SIZE * SIZE - 1 {
            max_reachable = max_reachable.max(min_on_path);
            continue;
        }
        if pos_x > 0 && min_on_path > reachable_with[pos - 1] {
            reachable_with[pos - 1] = min_on_path;
            queue.push((pos - 1, pos_x - 1, pos_y, min_on_path.min(map[pos - 1])));
        }
        if pos_x < SIZE - 1 && min_on_path > reachable_with[pos + 1] {
            reachable_with[pos + 1] = min_on_path;
            queue.push((pos + 1, pos_x + 1, pos_y, min_on_path.min(map[pos + 1])));
        }
        if pos_y > 0 && min_on_path > reachable_with[pos - SIZE] {
            reachable_with[pos - SIZE] = min_on_path;
            queue.push((
                pos - SIZE,
                pos_x,
                pos_y - 1,
                min_on_path.min(map[pos - SIZE]),
            ));
        }
        if pos_y < SIZE - 1 && min_on_path > reachable_with[pos + SIZE] {
            reachable_with[pos + SIZE] = min_on_path;
            queue.push((
                pos + SIZE,
                pos_x,
                pos_y + 1,
                min_on_path.min(map[pos + SIZE]),
            ));
        }
    }
    order[max_reachable as usize]
}
```

This solution is not as fast as I thought it would be, but it is a lot faster than the naive one:
```
Day18 - Part2/better    time:   [7.7919 ms 7.8718 ms 7.9477 ms]
```
Since I know the answer is at least 1024, I can block every path with a `min_on_path` value that is less than 1024, this involves changing the starting values of `reachable_with` to 1024.

This leads to another big improvement:
```
Day18 - Part2/better    time:   [3.8324 ms 3.8385 ms 3.8448 ms]
```

### An Even Better Solution
Even before this "better" solution, I thought about doing a binary search for the correct value, but did not have a good idea about how to hold the state of the board at every time step, but now that I have this `map` that I fill with the step each position was blocked on, I can clearly see how to implement the binary search.  

First, the outer function will simply call the search function and return the position that was blocked at the step it picked:
```rust
fn part2_binsearch_inner(mut input: &[u8]) -> (usize, usize) {
    let mut free_until = [u32::MAX; SIZE * SIZE];
    let mut order = Vec::new();
    for i in 0u32.. {
        let (x, rem) = fast_parse::<usize>(input);
        let (y, rem) = fast_parse::<usize>(&rem[1..]);
        free_until[y * SIZE + x] = i;
        order.push((x, y));
        if rem.is_empty() {
            break;
        }
        input = &rem[1..];
    }
    let result = perform_binsearch(free_until, order.len() as u32);
    order[result as usize]
}
```
The binary search is like any other, keeps a start and end index and checks the middle until they meet:
```rust
fn perform_binsearch(free_until: [u32; SIZE * SIZE], mut end: u32) -> u32 {
    let mut start = 1024u32;
    while start != end {
        let middle = (start + end) / 2;
        if can_reach_end2(free_until, middle) {
            start = middle + 1;
        } else {
            end = middle;
        }
    }
    end
}
```
And finally, the check itself is a copy of `can_reach_end`, that instead of checking the boolean `map[pos]`, checks if the given threshold is less than the value in the given map, for example:
```rust
if pos_x > 0 && max_threshold < open_until[pos - 1] && !visited[pos - 1] {
    visited[pos - 1] = true;
    queue_next.push((pos - 1, pos_x - 1, pos_y));
}
```

It may seem like doing multiple searches will take more than the single search from the "better" solution, but:

- In the "better" solution, paths had a lot less things to stop them, since they simply continued through blocked positions while remembering their blocked step.
- Binary search needs `log2(start-end)` searches, and in this case, that means 12 searches, not so bad.

And the performance on this solution is impressive:
```
Day18 - Part2/binary_search time:   [92.474 µs 92.723 µs 93.011 µs]
```
Not even close to 12x the part 1 time, mostly because part 1 needed to keep track of the distance, and not just reachability.
