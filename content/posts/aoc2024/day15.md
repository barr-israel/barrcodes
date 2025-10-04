---
publishDate: 2024-12-15
title: Day 15 - Warehouse Woes
author: Barr
keywords: [Advent of Code, Rust]
description: Is this Sokoban?
summary: |
  A warehouse robot has gone crazy and is moving and pushing boxes at random, the goal is to track the boxes.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day15.rs
---
## Input
The input is a map of the warehouse, that contains walls(`#`), boxes(`O`) and a robot(`@`).  
The map is followed by an empty line and list of movements the robot performs(`^v<>`).  
For example:
```
##########
#..O..O.O#
#......O.#
#.OO..O.O#
#..O@..O.#
#O#..O...#
#O..O..O.#
#.OO.O.OO#
#....O...#
##########

<vv>^<v^>v>^vv^v>v<>v^v<v<^vv<<<^><<><>>v<vvv<>^v^>^<<<><<v<<<v^vv^v>^
vvv<<^>^v^^><<>>><>^<<><^vv^^<>vvv<>><^^v>^>vv<>v<<<<v<^v>^<^^>>>^<v<v
><>vv>v^v^<>><>>>><^^>vv>v<^^^>>v^v^<^^>v^^>v^<^v>v<>>v^v^<v>v^^<^^vv<
<<v<^>>^^^^>>>v^<>vvv^><v<<<>^^^vv^<vvv>^>v<^^^^v<>^>vvvv><>>v^<<^^^^^
^><^><>>><>^^<<^^v>>><^<v>^<vv>>v>>>^v><>^v><<<<v>>v<v<v>vvv>^<><<>^><
^>><>^v<><^vvv<^^<><v<<<<<><^v<<<><<<^^<v<^^^><^>>^<v^><<<^>>^v<v^v<v^
>^>>^v>vv>^<<^v<>><<><<v<<v><>v<^vv<<<>^^v^>^^>>><<^v>>v^v><^^>>^<>vv^
<><^^>^^^<><vvvvv^v<v<<>^v<v>v<<^><<><<><<<^^<<<^<<>><<><^^^>^^<>^>v<>
^^>vv<^v^v<vv>^<><v<^v>^^^>>>^^vvv^>vvv<>>>^<^>>>>>^<<^v>^vvv<>^<><<v>
v^^>>><<^^<>>^v^<v^vv<>v^<<>^<^v^v><^<<<><<^<v><v<>vv>>v><v^<vv<>v^<<^
```
For some reason the movements have line breaks that need to be filtered when parsing them.  
The robot can push any amount of boxes as long as there isn't a wall preventing it.

In this case, after all the movement, the map will look like this:
```
##########
#.O.O.OOO#
#........#
#OO......#
#OO@.....#
#O#.....O#
#O.....OO#
#O.....OO#
#OO....OO#
##########
```

## Part 1
The output needs to be the sum of the value for each box after the robot finishes all of its movements, calculated as it's distance from the top edge times 100 plus it's distance from the left edge.  
Since calculating that sum is the easy part, I'll start with it:
```rust
fn calc_score(map: &[u8]) -> usize {
    let mut x_sum = 0usize;
    let mut y_sum = 0usize;
    for y in 1..HEIGHT - 1 {
        for x in 1..WIDTH - 1 {
            if map[y * WIDTH + x] == b'O' {
                x_sum += x;
                y_sum += y;
            }
        }
    }
    x_sum + 100 * y_sum
}
```
Next, some skeleton for the actual solution:  
```rust
#[aoc(day15, part1)]
pub fn part1_first(input: &[u8]) -> usize {
    let mut map = input[..WIDTH * HEIGHT].to_owned();
    let mut robot = map.iter().position(|&c| c == b'@').unwrap();
    let instructions = &input[WIDTH * HEIGHT + 1..];
    instructions.iter().for_each(|&instruction| {
        if instruction != b'\n' {
            (_, robot) = try_push(robot, instruction, &mut map);
        }
    });
    calc_score(&map)
}
```
The input is copied to allow modifying it with each step of the robot, the initial position of the robot is found and then each instruction is executed before finally calculating the score to return.

`try_push` is where it starts getting interesting:  
Before moving the robot, I need to make sure there's an empty spot to move it, or at least that I can move boxes to make one:
```rust {hl_lines=[18]}
fn try_push(to_push: usize, instruction: u8, map: &mut [u8]) -> (bool, usize) {
    let next = match instruction {
        b'^' => to_push - WIDTH,
        b'v' => to_push + WIDTH,
        b'<' => to_push - 1,
        b'>' => to_push + 1,
        _ => unreachable!("read non-instruction"),
    };
    let object_at_next = map[next];
    match object_at_next {
        b'#' => (false, to_push),
        b'.' => {
            // open space
            map[next] = map[to_push];
            map[to_push] = b'.';
            (true, next)
        }
        _ if try_push(next, instruction, map).0 => {
            // push the blocking box, at this point next is open space
            map[next] = map[to_push];
            map[to_push] = b'.';
            (true, next)
        }
        _ => {
            // push failed, no movement
            (false, to_push)
        }
    }
}
```
`WIDTH` is a constant for the width of the map, as it is identical for all inputs(examples have their own sizes so I adjust when testing).  
The marked line is the recursive call that handles moving any box that blocks the robot, and any box that blocks that box, and so on.  
If the recursive call reaches an empty position, it starts moving the boxes while unwinding all the previous calls.  
If the recursive call hits a wall, it simply unwinds without allowing anything to move.  

## Part 2
Turns out there's *another* warehouse, twice as wide, with the same map except stretched, including walls and boxes(but not the robot).  
So now every `#` symbol is actually `##`, every `.` is `..` and every `O` is `[]`(`@` is converted to `@.`).  
The output required remained the same: the score after the robot finishes its movement.  
Because the robot still only moves 1 step at a time, it can push boxes to be unaligned with each other:  
```
##########
##......##
##.[][].##
##..[]..##
##..@...##
##......##
##########
```
Which is what makes this part a lot more complicated.

A naive attempt to fix this would simply add something along the lines of:
```rust
b'[' if try_push(next, instruction, map).0 && try_push(next+1,instruction,map).0=> {
```
To the match statement, and:
```rust
map[next] = map[to_push];
map[to_push] = b'.';
map[next+1] = map[to_push+1];
map[to_push] = b'.';
```
Somewhere in the pushing section(maybe with a little more branching).

But that solution will fail in the very common case that the left side of a box isn't blocked by anything, and the right side can't move at all in that direction.  
The result would be a box that was split in two, or perhaps a box that has overwritten another box/wall.

### The Solution
The solution I came up with is to first check both sides without moving anything, and if both sides allow the push, push both sides.  
It may sound simple but that are a lot of little details to it:  

- If a box is pushed by one side's push function, the other side's push function will already see it in the new position, and might behave unexpectedly.
- Pushing one side of a box requires pushing its other side, so a case like my example increases the area that needs to be checked and pushed.
- Avoiding mistakes when one side of a box is blocked and the other isn't.  

The next thing to note is that pushing left and right is actually the same as before, there are simply the symbols `[]` instead of the single symbol `O`, but after adjusting for that, they can be pushed as if they were 2 1x1 boxes.  
So only up and down needs special handling.  

To make things a little easier and slightly more performant, I have first rewritten part 1 to have a different function for each direction, I will only show one of the directions since they are all extremely similar:
```rust
fn try_push_right(to_push: usize, map: &mut [u8]) -> bool {
    let next = to_push + 1;
    let object_at_next = map[next];
    if object_at_next == b'.' || (object_at_next != b'#' && try_push_right(next, map)) {
        // empty cell or box was moved
        map[next] = map[to_push];
        map[to_push] = b'.';
        true
    } else {
        false
    }
}
fn try_push_robot(to_push: usize, instruction: u8, map: &mut [u8]) -> usize {
    match instruction {
        b'^' => {
            if try_push_up(to_push, map) {
                to_push - WIDTH
            } else {
                to_push
            }
        }
        b'v' => {
            if try_push_down(to_push, map) {
                to_push + WIDTH
            } else {
                to_push
            }
        }
        b'<' => {
            if try_push_left(to_push, map) {
                to_push - 1
            } else {
                to_push
            }
        }
        b'>' => {
            if try_push_right(to_push, map) {
                to_push + 1
            } else {
                to_push
            }
        }
        _ => unreachable!("read non-instruction"),
    }
}
```
Now `try_push_robot` is called only on the robot itself, and the directional functions handle the rest.

Now for the part 2 version:  
```rust
#[aoc(day15, part2)]
pub fn part2_first(input: &[u8]) -> usize {
    let mut map = Vec::with_capacity(DWIDTH * HEIGHT);
    input[..WIDTH * HEIGHT].iter().for_each(|&c| match c {
        b'#' => {
            map.push(b'#');
            map.push(b'#');
        }
        b'.' => {
            map.push(b'.');
            map.push(b'.');
        }
        b'O' => {
            map.push(b'[');
            map.push(b']');
        }
        b'@' => {
            map.push(b'@');
            map.push(b'.');
        }
        b'\n' => map.push(b'\n'),
        _ => unreachable!("not a map sign"),
    });
    let mut robot = map.iter().position(|&c| c == b'@').unwrap();
    let instructions = &input[WIDTH * HEIGHT + 1..];
    instructions.iter().for_each(|&instruction| {
        if instruction != b'\n' {
            robot = try_push_robot_wide(robot, instruction, &mut map);
        }
    });
    calc_score2(&map)
}
fn try_push_robot_wide(to_push: usize, instruction: u8, map: &mut [u8]) -> usize {
    match instruction {
        b'^' => {
            if try_push_up_wide(to_push, map) {
                to_push - DWIDTH
            } else {
                to_push
            }
        }
        b'v' => {
            if try_push_down_wide(to_push, map) {
                to_push + DWIDTH
            } else {
                to_push
            }
        }
        b'<' => {
            if try_push_left(to_push, map) {
                to_push - 1
            } else {
                to_push
            }
        }
        b'>' => {
            if try_push_right(to_push, map) {
                to_push + 1
            } else {
                to_push
            }
        }
        _ => unreachable!("read non-instruction"),
    }
}
```
`DWIDTH` is just `WIDTH*2-1` to account for the wider map.  
The `part2_first` function handles parsing the input into its wide version, and the continues similarly to part 1.  
`try_push_robot_wide` calls the matching direction just like in part 1, it even uses the exact same functions for left and right.  
And for the complex part:
```rust
fn can_push_down_wide(to_push: usize, map: &[u8]) -> bool {
    let next = to_push + DWIDTH;
    match map[next] {
        b'.' => true,
        b'#' => false,
        b'[' => can_push_down_wide(next, map) && can_push_down_wide(next + 1, map),
        b']' => can_push_down_wide(next, map) && can_push_down_wide(next - 1, map),
        _ => unreachable!("not a map tile"),
    }
}
fn force_push_down_wide(to_push: usize, map: &mut [u8]) {
    let next = to_push + DWIDTH;
    if map[to_push] == b'.' {
        return;
    }
    match map[to_push] {
        b'[' => {
            force_push_down_wide(next, map);
            force_push_down_wide(next + 1, map);
        }
        b']' => {
            force_push_down_wide(next - 1, map);
            force_push_down_wide(next, map);
        }
        b'@' => {
            force_push_down_wide(next, map);
        }
        _ => unreachable!("not a moveable tile or force pushed into wall"),
    }
    // if there was a box in next it was moved
    match map[to_push] {
        b'[' => {
            map[next + 1] = map[to_push + 1];
            map[to_push + 1] = b'.';
        }
        b']' => {
            map[next - 1] = map[to_push - 1];
            map[to_push - 1] = b'.';
        }
        _ => {}
    }
    map[next] = map[to_push];
    map[to_push] = b'.';
}
fn try_push_down_wide(to_push: usize, map: &mut [u8]) -> bool {
    let next = to_push + DWIDTH;
    let object_at_next = map[next];
    if object_at_next == b'.' || (object_at_next != b'#' && can_push_down_wide(to_push, map)) {
        force_push_down_wide(to_push, map);
        true
    } else {
        false
    }
}
```
`try_push_down_wide` is very similar to `try_push_down` except it uses the new functions that split between checking and actually pushing.  
Both `can_push_down_wide` and `force_push_down_wide` work as I described, calling themselves recursively as needed.  
Because `can_push_down_wide` already verified there is no wall, `force_push_down_wide` just continues until an empty space and assumes it can't be blocked.

## Performance
I wasn't aiming for top performance today, but at the very least I don't think there are massive gains to be had here, maybe a way to not go down the recursive calls twice, using some return value from `can_push_down_wide` that already collected the boxes to push.

As I thought, the rewritten part 1 is slightly faster than the original version:
```
Day15 - Part1/(default) time:   [239.99 µs 240.73 µs 241.41 µs]
Day15 - Part1/second    time:   [211.53 µs 211.94 µs 212.43 µs]
```
And for part 2:
```
Day15 - Part2/(default) time:   [368.20 µs 373.60 µs 379.46 µs]
```
