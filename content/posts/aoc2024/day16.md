---
publishDate: 2024-12-16
title: Day 16 - Reindeer Maze
author: Barr
keywords: [Advent of Code, Rust]
description: The first Dijkstra day
summary: |
  Today's challenge is just a maze, but turning has a cost.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day16.rs
---
## Input
A simple maze, start location marked with `S`(always bottom left corner), end location marked with `E`(always top right corner), paths marked with `.` and walls marked with `#`.  The entire maze has walls around it(so no need to check for going out of bounds).  
For example:
```
###############
#.......#....E#
#.#.###.#.###.#
#.....#.#...#.#
#.###.#####.#.#
#.#.#.......#.#
#.#.#####.###.#
#...........#.#
###.#.#####.#.#
#...#.....#.#.#
#.#.#.###.#.#.#
#.....#...#.#.#
#.###.#.#.#.#.#
#S..#.....#...#
###############
```
Making a step costs 1, turning 90 degrees in place costs 1000, and the deer that is going through the maze starts facing east, and will take some optimal path.

## Part 1
What is the minimum cost to get to the end?

This is a simple maze solving question with non-static costs, meaning the solution is using [Dijskstra's Algorithm](https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm).  
For the `BinaryHeap` to work, I need to define a struct with the correct ordering(increasing costs):

```rust
#[derive(Eq, PartialEq, PartialOrd, Ord, Debug, Copy, Clone)]
enum Direction {
    Right = 0,
    Left = 1,
    Up = 2,
    Down = 3,
}
impl Ord for Step {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        other.cost.cmp(&self.cost)
    }
}
impl PartialOrd for Step {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
```

And all that is left is implementing the algorithm itself:
```rust
#[aoc(day16, part1)]
pub fn part1_first(input: &[u8]) -> u32 {
    let mut queue = BinaryHeap::<Step>::new();
    let width = input.iter().position(|&c| c == b'\n').unwrap() + 1;
    let end = 2 * width - 3;
    let mut visited = vec![false; input.len() * 4];
    let start = input.len() - 2 * width + 2;
    queue.push(Step {
        pos: start,
        dir: Direction::Right,
        cost: 0,
    });
    loop {
        let step = queue.pop().unwrap();
        if step.pos == end {
            return step.cost;
        }
        if visited[step.pos + input.len() * step.dir as usize] {
            continue;
        }
        visited[step.pos + input.len() * step.dir as usize] = true;
        if input[step.pos] == b'#' {
            continue;
        }
        match step.dir {
            Direction::Right => {
                queue.push(Step {
                    pos: step.pos + 1,
                    dir: Direction::Right,
                    cost: step.cost + 1,
                });
                queue.push(Step {
                    pos: step.pos,
                    dir: Direction::Up,
                    cost: step.cost + 1000,
                });
                queue.push(Step {
                    pos: step.pos,
                    dir: Direction::Down,
                    cost: step.cost + 1000,
                });
            }
            Direction::Left => {
                ...
        }
    }
}
```
A couple notes:

- The deer can't switch from a right state to a left state in one motion, same for up and down.
- Because the current direction is part of the state and affects the costs, having a `visited` table with just position is not enough, it needs to capture the direction as well.

### Part 1 Optimizations
Before I get started on part 2, I want to apply a few optimizations to part 1.  

#### Fusing Turns With Steps
First, the deer will never turn twice in a row in an ideal path, that would put it at a state it had already been, so its possible to fuse turns with the forward movement that follows like so:
```rust
Direction::Right => {
    queue.push(Step {
        pos: step.pos + 1,
        dir: Direction::Right,
        cost: step.cost + 1,
    });
    queue.push(Step {
        pos: step.pos - width,
        dir: Direction::Up,
        cost: step.cost + 1001,
    });
    queue.push(Step {
        pos: step.pos + width,
        dir: Direction::Down,
        cost: step.cost + 1001,
    });
}
```
This is already a massive time save(CPU locked to base clock):
```
Day16 - Part1/(default) time:   [6.6486 ms 6.6593 ms 6.6716 ms]
Day16 - Part1/opt       time:   [2.7613 ms 2.7630 ms 2.7649 ms]
```

#### Visited At Axis
Next, I can shrink the `visited` vector to just the axis(horizontal or vertical):  
Consider some position and direction that I reach for the first time with cost X, and the cost at the previous turn was A(so A<X).  
That means that if there is a way to reach that position with the opposite direction has  a cost of at least X, and the cost to reach the next turn is some B(so X<B).  
Because of that, the cost to reach the turn from the first direction is necessarily smaller than getting to it from the opposite direction, and so is the cost to any continuation of the path through that turn.  
It is worth nothing that the second path turning back towards where the first path came from leads to the same "visiting same position with opposite directions" which is solved in the same way.  
This is not a complete proof, but the conclusion is correct, now for the implementation:  
First I reordered the `Direction` enum:
```rust {hl_lines=[3,4]}
#[derive(Eq, PartialEq, PartialOrd, Ord, Debug, Copy, Clone)]
enum Direction {
    Right = 0,
    Up = 1,
    Left = 2,
    Down = 3,
}
```
To allow me to index into the new `visited` vector, that now has the length `input.len()*2` using:
```rust
visited[step.pos + input.len() * (step.dir as u8 & 1) as usize] = true;
```
I did not expect such a big performance difference from just this change:
```
Day16 - Part1/opt       time:   [1.5232 ms 1.5351 ms 1.5501 ms]
```
Next, I can prevent some interactions with the expensive `BinaryHeap` by checking for a wall *before* inserting into it:
```rust
                if input[step.pos + 1] != b'#' {
                    queue.push(Step {
                        pos: step.pos + 1,
                        dir: Direction::Right,
                        cost: step.cost + 1,
                    });
                }
```
Also, the check before the `match` is also not needed.  

This adds a lot of code(a check around every push, could be refactored into a function, but it would need to take many parameters anyway), but leads to another huge improvement:
```
Day16 - Part1/opt       time:   [609.06 µs 610.63 µs 612.61 µs]
```
## Part 2
How many positions are part of an optimal path?  
This complicates things a fair bit, now I need to check all routes at the minimal cost and not just the first, and I need to track the entire route take.  
I've initially chosen to implement the most basic solution: a vector attached to each step with its history.  
These are the important changes:
```rust
    let mut available_positions = vec![true; input.len()];
    let mut good_spots = 0u32;
    let mut min_cost = u32::MAX;
    while let Some(StepH { step, mut history }) = queue.pop() {
        history.push(step.pos);
        if step.pos == end {
            visited[step.pos + input.len() * (step.dir as u8 & 1) as usize] = step.cost;
            history.into_iter().for_each(|p| {
                good_spots += std::mem::replace(&mut available_positions[p], false) as u32
            });
            min_cost = step.cost;
            continue;
        }
        if step.cost >= min_cost
            || step.cost > visited[step.pos + input.len() * (step.dir as u8 & 1) as usize]
        {
            continue;
        }
        visited[step.pos + input.len() * (step.dir as u8 & 1) as usize] = step.cost;
        match step.dir {
            Direction::Right => {
                if input[step.pos + 1] != b'#' {
                    queue.push(StepH {
                        step: Step {
                            pos: step.pos + 1,
                            dir: Direction::Right,
                            cost: step.cost + 1,
                        },
                        history: history.clone(),
                    });
                }
                ...
```
More specifically:

- Using `StepH` instead of `Step`, the only difference is that `StepH` has a history vector.
- Instead of returning on the first path to reach the end, its entire path gets added to a boolean array and a counter, to be returned after the queue is empty.
- Each time a position is popped from the queue, it is added to its own history.
- Short circuiting when the cost gets above an already found minimum cost.
- Instead of tracking a boolean `visited` for each position+direction, the minimum cost to get there must be tracked instead, this way if another path reaches the same position+direction with the same cost, it is allowed to continue, instead of being forced to stop there(any higher cost means it is impossible to reach the end with a minimum cost)
- The history gets **cloned** each time a new step is pushed to the queue.

Not a great solution, it allocates a large amount of memory many times, and took me a while to get all the correct checks in place.  
An earlier version with worse short circuiting consumed ~20GiB of memory for several minutes before I stopped it.  
But this version is not great either:
```
Day16 - Part2/(default) time:   [31.131 ms 31.183 ms 31.238 ms]
```
### Part 2 Optimizations
This version uses an alternative way to obtain the paths at the end without tracking the full history for every step:  
Since every position tracks the cheapest way to reach it, that means that two adjacent position(any 2 position+direction sets that can get from one to the other in one step) in the same direction will have a difference of 1 if both are on an optimal path, or 1001 if the movement between them involves turning.  
This creates a *new* maze to path-find through, a little similar to the topographic map from [day 10](/posts/aoc2024/day10/).

So now part 2 can go back to use `Step`, and chunk of code I showed earlier looks like this:
```rust
    let mut visited = vec![u32::MAX; input.len() * 2];
    queue.push(Step {
        pos: start,
        dir: Direction::Right,
        cost: 0,
    });
    let mut min_cost = u32::MAX;
    while let Some(step) = queue.pop() {
        if step.cost > min_cost
            || step.cost > visited[step.pos + input.len() * (step.dir as u8 & 1) as usize]
        {
            continue;
        }
        visited[step.pos + input.len() * (step.dir as u8 & 1) as usize] = step.cost;
        if step.pos == end {
            min_cost = step.cost;
            continue;
        }
        match step.dir {
            Direction::Right => {
                if input[step.pos + 1] != b'#' {
                    queue.push(Step {
                        pos: step.pos + 1,
                        dir: Direction::Right,
                        cost: step.cost + 1,
                    });
                }
```
All the tracking except the `visited` array is gone.  To handle that path reconstruction, I call a new function after the queue is empty:
```rust
reconstruct_paths(visited, end, width)
```

This function path-finds inside `visited` while enforcing steps go in decreasing costs of 1 or 1001 as necessary, starting from end until it reaches a cost of 0, which can only be the start.
```rust
fn reconstruct_paths(mut visited: Vec<u32>, end: usize, width: usize) -> u32 {
    // start at 1 because start position will not update counter
    let mut good_spots_count = 1u32;
    let mut queue = Vec::with_capacity(visited.len());
    let vertical_start = visited.len() / 2;
    let mut available_spots = vec![true; vertical_start];
    if visited[end] != u32::MAX {
        queue.push(end);
    }
    if visited[end + vertical_start] != u32::MAX {
        queue.push(end + vertical_start);
    }
    while let Some(pos) = queue.pop() {
        let curr_cost = std::mem::replace(&mut visited[pos], u32::MAX);
        if curr_cost == 0 {
            continue;
        }
        if pos >= vertical_start {
            // got to pos with vertical movement
            // add to good spots if not already
            good_spots_count +=
                std::mem::replace(&mut available_spots[pos - vertical_start], false) as u32;
            // up
            if visited[pos - width] == curr_cost - 1 {
                queue.push(pos - width);
            }
            // down
            if visited[pos + width] == curr_cost - 1 {
                queue.push(pos + width);
            }
            // left
            if visited[pos - width - vertical_start] == curr_cost - 1001 {
                queue.push(pos - width - vertical_start);
            }
            //right
            if visited[pos + width - vertical_start] == curr_cost - 1001 {
                queue.push(pos + width - vertical_start);
            }
        } else {
            // got to pos with horizontal movement
            // add to good spots if not already
            good_spots_count += std::mem::replace(&mut available_spots[pos], false) as u32;
            // up
            if visited[pos - 1 + vertical_start] == curr_cost - 1001 {
                queue.push(pos - 1 + vertical_start);
            }
            // down
            if visited[pos + 1 + vertical_start] == curr_cost - 1001 {
                queue.push(pos + 1 + vertical_start);
            }
            // left
            if visited[pos - 1] == curr_cost - 1 {
                queue.push(pos - 1);
            }
            //right
            if visited[pos + 1] == curr_cost - 1 {
                queue.push(pos + 1);
            }
        }
    }
    good_spots_count
}
```

This solution is a lot faster, and no longer allocates so much memory:
```
Day16 - Part2/reconstruct time:   [4.0200 ms 4.0207 ms 4.0215 ms]
```

## Graphs
All of the solutions today can be seen as path-finding problems on graphs made out of 2 connected graphs: the horizontal graph and the vertical graph.  
The cost to move within the same graph is 1, and the cost to cross to the other graph is 1001(both only allow movement to specific other vertices)

## Final Times
As always, the last step is benchmarking without locking the CPU clock:
```
Day16 - Part1/opt         time:   [367.81 µs 369.21 µs 371.05 µs]
Day16 - Part2/reconstruct time:   [2.6444 ms 2.6479 ms 2.6515 ms]
```
