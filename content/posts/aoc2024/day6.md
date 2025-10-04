---
publishDate: 2024-12-06
title: Day 6 - Guard Gallivant
author: Barr
keywords: [Advent of Code, Rust]
description: Path tracing a very odd guard route.
summary: |
  Today the goal is tracking a guard that is going on a patrol route and turning right every time he encounters an obstacle, until he is off the grid.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day6.rs
---
The given input is a map with the location of the guard marked as `^`, obstacles marked as `#` and every other location is open and marked with `.`

## Part 1 - Simple Path Tracing
The output for part 1 needs to be the amount of positions he visits(visiting the same position twice doesn't count).  
With a little debugging, I wrote this simple path tracing algorithm:
```rust
// real input is 131x130(including line break), example is 11x10
const WIDTH: usize = 131;
// const WIDTH: usize = 11;
const HEIGHT: usize = WIDTH - 1;
const TOTAL_SIZE: usize = WIDTH * HEIGHT;
#[derive(Copy, Clone, Debug)]
enum Direction {
    Up,
    Down,
    Left,
    Right,
}

#[aoc(day6, part1, first)]
pub fn part1_first(input: &[u8]) -> u32 {
    let mut count = 1u32;
    let mut visited = [false; TOTAL_SIZE];
    let mut location = input.iter().position(|&c| c == b'^').unwrap();
    let mut direction = Direction::Up;
    visited[location] = true;
    loop {
        let (new_location, new_direction) = match direction {
            Direction::Up => {
                if location <= WIDTH {
                    return count;
                }
                (location - WIDTH, Direction::Right)
            }
            Direction::Down => {
                if location >= TOTAL_SIZE - WIDTH {
                    return count;
                }
                (location + WIDTH, Direction::Left)
            }
            Direction::Left => {
                if location % WIDTH == 0 {
                    return count;
                }
                (location - 1, Direction::Up)
            }
            Direction::Right => {
                if location % WIDTH == WIDTH - 1 {
                    return count;
                }
                (location + 1, Direction::Down)
            }
        };
        if input[new_location] == b'#' {
            direction = new_direction;
        } else {
            location = new_location;
            if !visited[location] {
                count += 1;
                visited[location] = true;
            }
        }
    }
}
```
At each iteration, I'm checking if he is about to go off-grid, if he is return the current count.  
Otherwise, there are 2 options: he can either continue in the same direction, changing the position, or turn, changing the direction.  
Then I simply handle both cases and make sure to not count the same location twice.  
And that's part 1 done.

## Part 2 - Creating Loops
For part 2, the output must be the amount of unique positions an obstacle can be added to in order for the guard to get stuck in a loop.  
The simplest solution is to add a temporary obstacle at each step, and check if continuing will enter a loop.  
The loop detection looks almost identical to the full part 1 solution with a couple changes:  

- Counting visited locations is not needed.
- Going off-grid means there is no loop.
- Going back to a visited location ***in the same direction***  means the guard is in a loop.

To track the direction the guard is going, I turned the `visited` array to be a `u8` array and used a few bitwise operations.  
I'm using the last 4 bits of each to store directions: if the 8th bit is up, that location has been visited in the up direction, if the 7th, down, and so on.  
To achieve this I put `u8` values to the `Direction` enum:
```rust
#[repr(u8)]
#[derive(Copy, Clone, Debug)]
enum Direction {
    Up = 1,
    Down = 2,
    Left = 4,
    Right = 8,
}
```
So now I can mark a direction as visited using `visited[location] |= direction as u8` and check if a direction was visited using `visited[location] & direction as u8 != 0`.  
The lines changed from the part 1 solution are marked, `new_obstacle` is passed as the temporary obstacle that is being considered:
```rust {hl_lines=[7,13,19,25,31,36,"38-42"]}
fn check_loop(
    input: &[u8],
    mut location: usize,
    mut direction: Direction,
    new_obstacle: usize,
) -> bool {
    let mut visited = [0u8; TOTAL_SIZE];
    visited[location] = direction as u8;
    loop {
        let (new_location, new_direction) = match direction {
            Direction::Up => {
                if location <= WIDTH {
                    return false;
                }
                (location - WIDTH, Direction::Right)
            }
            Direction::Down => {
                if location >= TOTAL_SIZE - WIDTH {
                    return false;
                }
                (location + WIDTH, Direction::Left)
            }
            Direction::Left => {
                if location % WIDTH == 0 {
                    return false;
                }
                (location - 1, Direction::Up)
            }
            Direction::Right => {
                if location % WIDTH == WIDTH - 1 {
                    return false;
                }
                (location + 1, Direction::Down)
            }
        };
        if (new_location == new_obstacle) || (input[new_location] == b'#') {
            direction = new_direction;
        } else if (visited[new_location] & (direction as u8)) != 0 {
            return true;
        } else {
            location = new_location;
            visited[location] |= direction as u8;
        }
    }
}
```

Part 2 is also fairly similar to part 1, but I had a couple mistakes that made me stare at the code for a while.  
Since it worked on the example and not the real input, it was very hard to debug.  
I even considered the cases where an obstacle can create a loop from multiple directions, but should only count once.  
So here's a challenge to the reader, find the 2 logic bugs in this code(assume `check_loop` works correctly, which it does):
```rust
#[aoc(day6, part2, first)]
pub fn part2_first(input: &[u8]) -> u32 {
    let mut possible_obstacles = [false; TOTAL_SIZE];
    let mut count = 0u32;
    let mut location = input.iter().position(|&c| c == b'^').unwrap();
    let mut direction = Direction::Up;
    loop {
        // the guard will either continue to new_location, or turn to new_direction
        let (new_location, new_direction) = match direction {
            Direction::Up => {
                if location <= WIDTH {
                    return count;
                }
                (location - WIDTH, Direction::Right)
            }
            Direction::Down => {
                if location >= TOTAL_SIZE - WIDTH {
                    return count;
                }
                (location + WIDTH, Direction::Left)
            }
            Direction::Left => {
                if location % WIDTH == 0 {
                    return count;
                }
                (location - 1, Direction::Up)
            }
            Direction::Right => {
                if location % WIDTH == WIDTH - 1 {
                    return count;
                }
                (location + 1, Direction::Down)
            }
        };
        if input[new_location] == b'#' {
            direction = new_direction;
        } else {
            location = new_location;
            if let Some(new_obstacle) = match direction {
                Direction::Up if location >= WIDTH => Some(location - WIDTH),
                Direction::Down if location < TOTAL_SIZE - WIDTH => Some(location + WIDTH),
                Direction::Left if location % WIDTH != 0 => Some(location - 1),
                Direction::Right if location % WIDTH != WIDTH - 1 => Some(location + 1),
                _ => None,
            } {
                if !possible_obstacles[new_obstacle]
                    && check_loop(input, location, direction, new_obstacle)
                {
                    possible_obstacles[new_obstacle] = true;
                    count += 1;
                }
            }
        }
    }
}
```
Do not scroll further if you want to find them yourself.  

### Bugfixes
After a while of staring mostly at the loop detection code(which had no bugs), I finally found the 2 mistakes:

- If a guard is about to cross a path he had already walked, the position ahead of him is checked and may return that a loop is created, but if an obstacle was added there, he would have never gotten to this position in the first place - an obstacle is added *before* he starts walking.  
To solve this I tagged locations he visited in the same array the found obstacles are marked(so I renamed it to `cant_place`).
- An obstacle may be placed immediately after a turn, and I'm only checking after a location change.  
To solve this I simply need to check for a loop regardless of the action the guard took.

So the new section under the `match` statement looks like this:
```rust
        if input[new_location] == b'#' {
            direction = new_direction;
        } else {
            location = new_location;
        }
        cant_place[location] = true;
        if let Some(new_obstacle) = match direction {
            Direction::Up if location >= WIDTH => Some(location - WIDTH),
            Direction::Down if location < TOTAL_SIZE - WIDTH => Some(location + WIDTH),
            Direction::Left if location % WIDTH != 0 => Some(location - 1),
            Direction::Right if location % WIDTH != WIDTH - 1 => Some(location + 1),
            _ => None,
        } {
            if !cant_place[new_obstacle] && check_loop(input, location, direction, new_obstacle) {
                cant_place[new_obstacle] = true;
                count += 1;
            }
        }
```
And this finally solves part 2.

## Optimizations
Once again I'll benchmark using the CPU clock locked to the base `2.6Ghz`.  
The initial times are:
```
Day6 - Part1/first      time:   [16.628 µs 16.670 µs 16.720 µs]
Day6 - Part2/first      time:   [13.697 ms 13.714 ms 13.734 ms]
```
My first attempt was using a `BitArr`(from the `bitvec` crate) for the `visited` array, since an array of `bool`s tends to be inefficient.  
The only code changes required were the construction of `visited`, and using `set` or `get_mut` to modify it, instead of normal indexing.
```
Day6 - Part1/bitvec     time:   [16.045 µs 16.223 µs 16.511 µs]
Day6 - Part2/bitvec     time:   [13.717 ms 13.771 ms 13.829 ms]
```
Slightly faster for 1, no change in 2.

I don't have any other ideas for part 1 so I'll focus on part 2.  
My first attempt was pass to `check_loop` which locations are already on the real path, this requires separating `cant_place` to a `visited` and `placed` arrays.  
And since `check_loop` needs to know which direction the guard was walking, the new `visited` must track that as well.  
The code in `part2_pass_visited` is mostly the same, and the code under the match in `check_loop_pass_visited` is:
```rust
if (new_location == new_obstacle) || (input[new_location] == b'#') {
    direction = new_direction;
} else {
    location = new_location;
    if outer_visited[location * 4 + direction as usize] {
        return true;
    } else {
        let mut v = visited.get_mut(location * 4 + direction as usize).unwrap();
        if *v {
            return true;
        } else {
            *v = true;
        }
    }
}
```
```
Day6 - Part2/pass_visited time:   [11.945 ms 11.961 ms 11.981 ms]
```
Faster than before.

## Going Multithreaded
For the first time this year, there's a problem that can benefit from parallelization:  
I put each call to `check_loop` in a `rayon` work queue, and let it compute in another thread while the main thread is going through the real route.  
This parallelization is not applied using the `pass_visited` version because it would require cloning the entire `visited` array for each call.

It took me a while to get all the compiler warnings the go away, the only way I managed to compile it was if I turn `count` and `cant_place` to references to make them `'static`, I'm not sure how to make it compile if that wasn't an option.
```rust
#[aoc(day6, part2, rayon)]
pub fn part2_rayon(input: &[u8]) -> u32 {
    let cant_place: &[AtomicBool; TOTAL_SIZE] = &from_fn(|_| AtomicBool::new(false));
    let count = &AtomicU32::new(0);
    let mut direction = Direction::Up;
    let mut location = input.iter().position(|&c| c == b'^').unwrap();
    let mut visited: BitArr!(for TOTAL_SIZE) = BitArray::ZERO;
    rayon::scope(|s| {
        visited.set(location, true);
        loop {
            let (new_location, new_direction) = match direction {
                Direction::Up => {
                    if location <= WIDTH {
                        break;
                    }
                    (location - WIDTH, Direction::Right)
                }
                Direction::Down => {
                    if location >= TOTAL_SIZE - WIDTH {
                        break;
                    }
                    (location + WIDTH, Direction::Left)
                }
                Direction::Left => {
                    if location % WIDTH == 0 {
                        break;
                    }
                    (location - 1, Direction::Up)
                }
                Direction::Right => {
                    if location % WIDTH == WIDTH - 1 {
                        break;
                    }
                    (location + 1, Direction::Down)
                }
            };
            if input[new_location] == b'#' {
                direction = new_direction;
            } else {
                location = new_location;
            }
            visited.set(location, true);
            if let Some(new_obstacle) = match direction {
                Direction::Up if location >= WIDTH => Some(location - WIDTH),
                Direction::Down if location < TOTAL_SIZE - WIDTH => Some(location + WIDTH),
                Direction::Left if location % WIDTH != 0 => Some(location - 1),
                Direction::Right if location % WIDTH != WIDTH - 1 => Some(location + 1),
                _ => None,
            } {
                if !visited[new_obstacle] && !cant_place[new_obstacle].load(Ordering::Relaxed) {
                    s.spawn(move |_| {
                        if check_loop(input, location, direction, new_obstacle)
                            && !cant_place[new_obstacle].swap(true, Ordering::Relaxed)
                        {
                            count.fetch_add(1, Ordering::Relaxed);
                        }
                    });
                }
            }
        }
    });
    count.load(Ordering::Relaxed)
}
```
The actual algorithm remained the same.  
The time for this solution is:
```
Day6 - Part2/rayon      time:   [2.5134 ms 2.5265 ms 2.5406 ms]
```

## Final Times
Unlocking the CPU clock I get these final times:
```
Day6 - Part1/bitvec       time:   [9.9747 µs 9.9896 µs 10.008 µs]
Day6 - Part2/pass_visited time:   [7.9820 ms 7.9941 ms 8.0078 ms]
Day6 - Part2/rayon        time:   [2.0287 ms 2.0373 ms 2.0476 ms]
```
