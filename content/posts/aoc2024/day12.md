---
publishDate: 2024-12-12
title: Day 12 - Garden Groups
author: Barr
keywords: [Advent of Code, Rust]
description: Every year needs a flood fill day.
summary: |
  The Elves are trying to build fences for their gardens and need me to calculate the cost.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day12.rs
---
Today, the Elves are asking for the cost of building fences around their gardens, each type of plant needs a fence separating it from other types, for example, plots arranged like this:
```
AAAA
BBCD
BBCC
EEEC
```
Need fences like this:
```goat {width=150,height=220}
+-+-+-+-+
|A A A A|
+-+-+-+-+ +-+
          |D|
+-+-+ +-+ +-+
|B B| |C|
+   + + +-+
|B B| |C C|
+-+-+ +-+ +
        |C|
+-+-+-+ +-+
|E E E| 
+-+-+-+
```
## Part 1
The cost of a fence is its inner area times its perimeter.  
This is simple to do with an algorithm called [flood fill](https://en.wikipedia.org/wiki/Flood_fill), which starts from a "seed" location and then finds and marks all other reachable locations.  
What counts as "reachable" this time is directly touching(no diagonals) tiles that have the same plant type.  
I've never implemented flood fill before but I'm confident I can do it without even reading the pseudo-code from the link above.  
First step, the skeleton that will call flood fill and sum up results:
```rust
#[aoc(day12, part1, flood_fill)]
pub fn part1_floodfill(input: &[u8]) -> u32 {
    let mut buffer = Vec::<(usize, u32, u32)>::new();
    let width = input.iter().position(|&c| c == b'\n').unwrap() as u32 + 1;
    let height = input.len() as u32 / width + 1;
    let mut index_to_group_id = vec![0u8; input.len()];
    let mut cost_sum = 0u32;
    for index in 0..input.len() {
        if input[index] == b'\n' || index_to_group_id[index] != 0 {
            continue;
        }
        cost_sum += flood_fill(
            index,
            input,
            &mut index_to_group_id,
            width,
            height,
            &mut buffer,
        );
    }
    cost_sum
}

```
Simply iterating over every position, and if it wasn't marked by the flood fill yet, it's an area that still needs a fence.  
Flood fill will handle calculating the price for each fence:
```rust
fn flood_fill(
    index: usize,
    input: &[u8],
    marked: &mut [u8],
    width: u32,
    height: u32,
    queue: &mut Vec<(usize, u32, u32)>,
) -> u32 {
    let plant_type = input[index];
    let mut area = 0u32;
    let mut perimeter = 0u32;
    queue.push((index, index as u32 % width, index as u32 / width));
    while let Some((index, x, y)) = queue.pop() {
        if marked[index] == plant_type {
            continue; // prevent double counting
        }
        marked[index] = plant_type;
        area += 1;
        perimeter += 4;
        if x > 0 && input[index - 1] == plant_type {
            if marked[index - 1] == 0 {
                queue.push((index - 1, x - 1, y));
            } else {
                perimeter -= 2; // canceling that side for both this and the neighbour
            }
        }
        if x < width - 2 && input[index + 1] == plant_type {
            if marked[index + 1] == 0 {
                queue.push((index + 1, x + 1, y));
            } else {
                perimeter -= 2; // canceling that side for both this and the neighbour
            }
        }
        if y > 0 && input[index - width as usize] == plant_type {
            if marked[index - width as usize] == 0 {
                queue.push((index - width as usize, x, y - 1));
            } else {
                perimeter -= 2; // canceling that side for both this and the neighbour
            }
        }
        if y < height - 1 && input[index + width as usize] == plant_type {
            if marked[index + width as usize] == 0 {
                queue.push((index + width as usize, x, y + 1));
            } else {
                perimeter -= 2; // canceling that side for both this and the neighbour
            }
        }
    }
    area * perimeter
}

```
This is a simple algorithm that queues up a seed position to check, and for each position checks, also adds its direct neighbours if they are of the same type and were not marked yet.  
Checking after popping is necessary because the same position could have been added by different sides before it got marked.  
The perimeter is measured based on these observations:

- Adding a plot with its own fence adds a perimeter of 4.
- Not all sides of that fence are needed, for every neighbour of the same type, both the new plot and the neighbour's plot need to remove the fence between them.

There are better filling algorithms like span fill, but this works.

> [!NOTE]
> The buffer is passed into the flood fill function as an optimization I've shown in previous days, it is guaranteed to come back empty every time due to how the flood fill algorithm works.

## Part 2
The price is now the area times *the amount of sides* the fence has.  
The main issue here is that when adding a new fence, it's hard to know if it created new sides, removed sides, or didn't change the amount of sides, a more zoomed out look is required.  
It is easier to think about this problem as counting corners, since every polygon will have the same amount of sides and corners.  
To detect a corner, knowing just the direct neighbours can only detect corners that go *around* the current position, for example:
```
ooo
xXo
xxo
```
The corner here goes *around* the `X` and knowing all 4 direct neighbours can detect that.  
But corners that go the other way:
```
ooO
xxo
xxo
```
Knowing the direct neighbours of the O is not enough, diagonals must also be checked.  
So I came up with this modified flood fill function:
```rust
fn flood_fill2(
    index: usize,
    input: &[u8],
    marked: &mut [u8],
    width: u32,
    height: u32,
    queue: &mut Vec<(usize, u32, u32)>,
) -> u32 {
    let plant_type = input[index];
    let mut area = 0u32;
    let mut corners = 0u32;
    queue.push((index, index as u32 % width, index as u32 / width));
    while let Some((index, x, y)) = queue.pop() {
        if marked[index] == plant_type {
            continue; // prevent double counting
        }
        marked[index] = plant_type;
        area += 1;
        let left = x > 0 && input[index - 1] == plant_type;
        if left && marked[index - 1] == 0 {
            queue.push((index - 1, x - 1, y));
        }
        let right = x < width - 2 && input[index + 1] == plant_type;
        if right && marked[index + 1] == 0 {
            queue.push((index + 1, x + 1, y));
        }
        let up = y > 0 && input[index - width as usize] == plant_type;
        if up && marked[index - width as usize] == 0 {
            queue.push((index - width as usize, x, y - 1));
        }
        let down = y < height - 1 && input[index + width as usize] == plant_type;
        if down && marked[index + width as usize] == 0 {
            queue.push((index + width as usize, x, y + 1));
        }
        let upleft = x > 0 && y > 0 && input[index - 1 - width as usize] == plant_type;
        let upright = x < width - 2 && y > 0 && input[index + 1 - width as usize] == plant_type;
        let downleft = x > 0 && y < height - 1 && input[index - 1 + width as usize] == plant_type;
        let downright =
            x < width - 2 && y < height - 1 && input[index + 1 + width as usize] == plant_type;
        if (up && right && !upright) || (!up && !right) {
            corners += 1;
        }
        if (up && left && !upleft) || (!up && !left) {
            corners += 1;
        }
        if (down && right && !downright) || (!down && !right) {
            corners += 1;
        }
        if (down && left && !downleft) || (!down && !left) {
            corners += 1;
        }
    }
    area * corners
}
```
Each `if` at the end checks one of the 4 corners, by checking if its either of the 2 corner types I showed.  
This solution finds all the corners and returns the correct price.

I could try to implement a better filling algorithm(like span fill, as I've mentioned before), but I don't have time for that today so I'll go straight to the final times:

## Performance
```
Day12 - Part1/flood_fill time:   [263.31 µs 263.73 µs 264.19 µs]
Day12 - Part2/flood_fill time:   [353.96 µs 361.99 µs 369.88 µs]
```
