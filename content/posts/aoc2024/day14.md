---
publishDate: 2024-12-14
title: Day 14 - Restroom Redoubt
author: Barr
keywords: [Advent of Code, Rust]
description: A relatively simple part 1, an extremely evil part 2.
summary: |
  Just tracking some robots moving in diagonal lines, how bad could it be?
github: https://github.com/barr-israel/aoc2024/blob/main/src/day14.rs
---
## Input
Each line in the input represents a robot in a `103x103` grid, it has a starting position in x,y values and velocity per second in x,y values, for example:
```
p=0,4 v=3,-3
```
The robot starts at `(0,4)` and moves `(3,-3)` every second.  
Additionally, the robots teleport to the other edge and continue moving when they go off the grid.

## Part 1
How many robots in each quadrant after 100 seconds?  
Any robots in the middle horizontal or vertical lines are to be ignored.  

This one is fairly simple, parse each robot, calculate its location after 100 seconds with a little math, and return the quadrant:
```rust
enum Quadrant {
    UpLeft = 0,
    UpRight = 1,
    DownLeft = 2,
    DownRight = 3,
    Middle = 4,
}
fn parse_and_move_robot(input: &[u8]) -> (Quadrant, &[u8]) {
    let (p_x, remainder) = fast_parse::<i32>(&input[2..]);
    let (p_y, remainder) = fast_parse::<i32>(&remainder[1..]);
    let (v_x, remainder) = fast_parsei::<i32>(&remainder[3..]);
    let (v_y, remainder) = fast_parsei::<i32>(&remainder[1..]);
    let final_x = (p_x + v_x * 100).rem_euclid(WIDTH);
    let final_y = (p_y + v_y * 100).rem_euclid(HEIGHT);
    (
        match (final_x.cmp(&HALF_WIDTH), final_y.cmp(&HALF_HEIGHT)) {
            (Ordering::Less, Ordering::Less) => Quadrant::UpLeft,
            (Ordering::Less, Ordering::Greater) => Quadrant::DownLeft,
            (Ordering::Greater, Ordering::Less) => Quadrant::UpRight,
            (Ordering::Greater, Ordering::Greater) => Quadrant::DownRight,
            (_, Ordering::Equal) | (Ordering::Equal, _) => Quadrant::Middle,
        },
        remainder,
    )
}
#[aoc(day14, part1, first)]
pub fn part1_first(mut input: &[u8]) -> u32 {
    let mut robots_at_quadrants = [0u32; 5]; // 5th for middle area, unused
    loop {
        let (quadrant, remainder) = parse_and_move_robot(input);
        robots_at_quadrants[quadrant as usize] += 1;
        if remainder.is_empty() {
            return robots_at_quadrants[0]
                * robots_at_quadrants[1]
                * robots_at_quadrants[2]
                * robots_at_quadrants[3];
        } else {
            input = &remainder[1..];
        }
    }
}
```
Initially I made one mistake here: I used `%` instead of `rem_euclid`, the former returns negative numbers when given negative numbers and the latter returns the corresponding positive number.  
`fast_parsei` is a variation of the `fast_parse` I showed on day 1 that allows for a `-` sign before the number to make it negative.

## Part 2
This part is worst designed Advent of Code challenge I've seen so far:  
After some amount of steps, *most* of the robots will align to an image of a Christmas tree, when will that first happen?  
No information about the shape, size, location of the tree.  
I looked at someone else's output for how the grid looked at that step, turns out its a `33x31` rectangle with a big tree inside, with ~5 spaces of padding between the tree and the rectangle.  
With *that* information I can work:  
Given that there's that rectangle, it would be easier to detect it.  
I used an extremely basic version of a [Hough Transform](https://en.wikipedia.org/wiki/Hough_transform):  
As a general explanation, a Hough Transform turns any image to an image of "votes", every pixel in the starting image can add "votes" to any pixel in the output image about where the shape it is searching could be.  
For axis aligned rectangles, this is very simple: each pixel(that was "detected", in this case, any robot position) votes for the vertical line it is on and the horizontal line it is on.  
If a rectangle exists, there will be 2 horizontal and 2 vertical lines with a large amount of votes, and they will be its 4 sides.  
This approach has some very significant drawbacks with real images but it works here.  

At each step until the rectangle is found:
1. Counters for every horizontal and vertical lines are initialized to 0.
2. The position of each robot is calculated, and a "vote" is added to its horizontal and vertical lines.
3. if there are 2 horizontal lines with at least 31 votes, and 2 vertical lines with at least 33 votes, return the current step.
```rust
struct Robot {
    p_x: i32,
    p_y: i32,
    v_x: i32,
    v_y: i32,
}
fn parse_robot(input: &[u8]) -> (Robot, &[u8]) {
    let (p_x, remainder) = fast_parse::<i32>(&input[2..]);
    let (p_y, remainder) = fast_parse::<i32>(&remainder[1..]);
    let (v_x, remainder) = fast_parsei::<i32>(&remainder[3..]);
    let (v_y, remainder) = fast_parsei::<i32>(&remainder[1..]);
    (Robot { p_x, p_y, v_x, v_y }, remainder)
}
#[aoc(day14, part2, hough)]
pub fn part2_hough(mut input: &[u8]) -> i32 {
    let mut robots = Vec::new();
    loop {
        let (robot, remainder) = parse_robot(input);
        robots.push(robot);
        if remainder.is_empty() {
            break;
        }
        input = &remainder[1..];
    }
    for step in 0i32.. {
        let mut vertical_lines = [0u32; WIDTH as usize];
        let mut horizontal_lines = [0u32; HEIGHT as usize];
        robots.iter().for_each(|robot| {
            vertical_lines[(robot.p_x + robot.v_x * step).rem_euclid(WIDTH) as usize] += 1;
            horizontal_lines[(robot.p_y + robot.v_y * step).rem_euclid(HEIGHT) as usize] += 1;
        });
        if vertical_lines
            .iter()
            .filter(|&&line| line >= TREE_HEIGHT)
            .count()
            >= 2
            && horizontal_lines
                .iter()
                .filter(|&&line| line >= TREE_WIDTH)
                .count()
                >= 2
        {
            return step;
        }
    }
    unreachable!("The loop never breaks")
}
```
Since the question is only "how many steps until the tree appears", I don't even need to calculate where it is.

Unlike most days, this solution probably has *some* input that results in a false positive(one of the drawbacks of this algorithm), unless the challenge writer specifically generated the input for that to never happen.

So when told to look for a tree, I simply looked for the frame, and it worked.  
Looking at other solutions, many people rely on there being no robots at the same place at the correct amount of steps, exploiting they way the input was generated.

## Performance
Part 1 is pretty fast, just like yesterday- parse and math, not a lot to it.  
On the other hand, part 2 is doing *a lot* of work, calculating every single step and looking for lines.  
```
Day14 - Part1/rem   time:   [6.8066 µs 6.8265 µs 6.8534 µs]
Day14 - Part2/hough time:   [14.400 ms 14.456 ms 14.539 ms]
```
