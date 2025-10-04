---
publishDate: 2024-12-08
title: Day 8 - Resonant Collinearity
author: Barr
keywords: [Advent of Code, Rust]
description: Counting antinodes(what even are antinodes?)
summary: |
  Antennas now make people buy more chocolate, but only in "antinodes", so they need to be found and counted.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day8.rs
---

## Part 1
The input is a grid of antenna locations in different frequencies, for example:
```
............
........0...
.....0......
.......0....
....0.......
......A.....
............
............
........A...
.........A..
............
............
```
All letters and numbers represent a specific frequency.  
Any grid location that is twice as far from one antenna than it is from another antenna with the same frequency.  
Another pair of antennas that create an antinode in the same location doesn't matter.  
So the example above has `34` antinodes:
```
##....#....#
.#.#....0...
..#.#0....#.
..##...0....
....0....#..
.#...#A....#
...#..#.....
#....#.#....
..#.....A...
....#....A..
.#........#.
...#......##
```
To find all the antinodes, I looked for some pattern that will help me calculate the antinodes created by every pair of antennas, and realized that relative to one antenna, an antinode is at the same difference in x and y but in opposite direction from the other antenna.  
Because that goes both ways, each pair of antennas create 2 antinodes.  
Technically, there could be antinodes between them, but I didn't think about that and apparently the challenge was designed to never have that happen.  
So I created the following `struct`:
```rust
#[derive(Copy, Clone, Debug, Eq, PartialEq, Hash)]
struct Position {
    x: i8,
    y: i8,
}

impl Position {
    fn resonate(self, other: Position) -> [Position; 2] {
        let x_diff = self.x - other.x;
        let y_diff = self.y - other.y;
        [
            Position {
                x: self.x + x_diff,
                y: self.y + y_diff,
            },
            Position {
                x: other.x - x_diff,
                y: other.y - y_diff,
            },
        ]
    }
}
```
Now I only need to find all the antennas and pair them up with other antennas with the same frequency.  
Finding the antennas can be done with a simple parser iterating through the input:
```rust
// b'z'-b'0'=80
fn find_antennas(input: &[u8]) -> ([Vec<Position>; 80], i8, i8) {
    let width = input.iter().position(|&c| c == b'\n').unwrap();
    let height = input.len() / width;
    let mut antennas: [Vec<Position>; 80] = from_fn(|_| Vec::new());
    input.iter().enumerate().for_each(|(index, &c)| {
        if c != b'.' && c != b'\n' {
            antennas[(c - b'0') as usize].push(Position {
                x: (index % (width + 1)) as i8,
                y: (index / (width + 1)) as i8,
            })
        }
    });
    (antennas, width as i8, height as i8)
}
```
And pairing and gathering the antinodes is simple as well, especially using the `itertools` crate:
```rust
#[aoc(day8, part1, unique)]
pub fn part1_unique(input: &[u8]) -> u32 {
    let (antennas, width, height) = find_antennas(input);
    antennas
        .iter()
        .flat_map(|freq| {
            freq.iter()
                .tuple_combinations()
                .flat_map(|(&antenna1, &antenna2)| antenna1.resonate(antenna2))
        })
        .filter(|&p| p.x >= 0 && p.x < width && p.y >= 0 && p.y < height)
        .unique()
        .count() as u32
}
```

## Part 2
Now antinodes are created at "any grid position exactly in line with at least two antennas of the same frequency, regardless of distance. This means that some of the new antinodes will occur at the position of each antenna (unless that antenna is the only one of its frequency).".  
Honestly, I could not figure out what that means even with the examples, apparently it means "continue the same jumps in both directions".  

So I created a new method in `Position`:
```rust
    fn infinite_resonation(
        self,
        other: Position,
    ) -> (
        impl Iterator<Item = Position>,
        impl Iterator<Item = Position>,
    ) {
        let x_diff = self.x - other.x;
        let y_diff = self.y - other.y;
        (
            (1..).map(move |res_mul| Position {
                x: self.x + x_diff * res_mul,
                y: self.y + y_diff * res_mul,
            }),
            (1..).map(move |res_mul| -> Position {
                Position {
                    x: other.x - x_diff * res_mul,
                    y: other.y - y_diff * res_mul,
                }
            }),
        )
    }
```
Instead of a pair of position, it returns an iterator, since the positions themselves have no concept of the end of the map, it is up to the caller to set the limit.  
Now a simple change to account for the iterator in the outer function:
```rust {hl_lines=["9-22"]}
#[aoc(day8, part2, unique)]
pub fn part2_unique(input: &[u8]) -> u32 {
    let (antennas, width, height) = find_antennas(input);
    antennas
        .iter()
        .flat_map(|freq| {
            freq.iter()
                .tuple_combinations()
                .flat_map(|(&antenna1, &antenna2)| {
                    let (res1, res2) = antenna1.infinite_resonation(antenna2);
                    [antenna1, antenna2]
                        .into_iter()
                        .chain(
                            res1.take_while(|&p| {
                                p.x >= 0 && p.x < width && p.y >= 0 && p.y < height
                            }),
                        )
                        .chain(
                            res2.take_while(|&p| {
                                p.x >= 0 && p.x < width && p.y >= 0 && p.y < height
                            }),
                        )
                })
        })
        .unique()
        .count() as u32
}
```

## Optimizations
Initial times(CPU locked to base `2.6Ghz`):
```
Day8 - Part1/unique     time:   [26.599 µs 26.652 µs 26.718 µs]
Day8 - Part2/unique     time:   [108.70 µs 108.82 µs 108.96 µs]
```
I tried replacing the indexing(`(c-b'0') as usize`) in the parsing with a lookup table:
```rust
```rust
fn lookup_index(c: u8) -> usize {
    let index = c as usize;
    const LUT: [usize; 256] = {
        let mut lut = [0usize; 256];
        lut[b'0' as usize] = 0;
        lut[b'1' as usize] = 1;
        ..
        lut[b'8' as usize] = 8;
        lut[b'9' as usize] = 9;
        lut[b'A' as usize] = 10;
        lut[b'B' as usize] = 11;
        ..
        lut[b'Y' as usize] = 35;
        lut[b'Z' as usize] = 36;
        lut[b'a' as usize] = 37;
        lut[b'b' as usize] = 38;
        ..
        lut[b'y' as usize] = 62;
        lut[b'z' as usize] = 63;
        lut
    };
    LUT[index]
}
```
I'm still unsure why can't I use a for loop in `const` context, especially when it could easily get fully unrolled into this.  
The result was a little worse:
```
Day8 - Part1/unique     time:   [28.124 µs 28.184 µs 28.264 µs]
Day8 - Part2/unique     time:   [111.65 µs 111.80 µs 111.95 µs]
```

Next, I tried replacing the `unique()` call in the iterator, which uses some hashset behind the scenes, with a boolean bit vector(from `bitvec`):
```rust
#[aoc(day8, part1, grid)]
pub fn part1_grid(input: &[u8]) -> u32 {
    let mut grid = bitvec![0;input.len()];
    let (antennas, width, height) = find_antennas(input);
    antennas
        .iter()
        .flat_map(|freq| {
            freq.iter()
                .tuple_combinations()
                .flat_map(|(&antenna1, &antenna2)| antenna1.resonate(antenna2))
        })
        .filter(|&p| {
            if p.x >= 0 && p.x < width && p.y >= 0 && p.y < height {
                let index = p.y as usize * width as usize + p.x as usize;
                if !grid[index] {
                    grid.set(index, true);
                    true
                } else {
                    false
                }
            } else {
                false
            }
        })
        .count() as u32
}
```
This was ***much*** faster:
```
Day8 - Part1/unique     time:   [26.678 µs 26.725 µs 26.776 µs]
Day8 - Part1/grid       time:   [6.9135 µs 6.9599 µs 7.0132 µs]
```

And applying the same optimization to part 2 I got:
```
Day8 - Part2/unique     time:   [107.99 µs 108.03 µs 108.07 µs]
Day8 - Part2/grid       time:   [17.222 µs 17.250 µs 17.279 µs]
```
### Multithreading
Finally, I tried using rayon to parallelize the process, I did it for both the `unique` and `grid` solutions, which involved 1-2 lines changed mostly, and changing the `bitvec` to a vector of `AtomicBool` on the `grid` solutions.
```
Day8 - Part1/unique_par time:   [67.510 µs 68.077 µs 68.786 µs]
Day8 - Part1/grid_par   time:   [28.888 µs 29.356 µs 29.981 µs]
Day8 - Part2/unique_par time:   [139.11 µs 140.84 µs 142.53 µs]
Day8 - Part2/grid_par   time:   [39.823 µs 40.206 µs 40.650 µs]
```
Everything got slower, not very useful.

### A Rewrite
After finishing the last section, I decided started to rewrite a bunch of sections inside both `grid` solutions, and benchmarking each change until I got to these fastest versions:
```rust
#[aoc(day8, part1, grid)]
pub fn part1_grid(input: &[u8]) -> u32 {
    let mut grid = bitvec![0;input.len()];
    let mut count = 0u32;
    let (antennas, width, height) = find_antennas(input);
    antennas.iter().for_each(|freq| {
        if freq.len() <= 1 {
            return;
        }
        for (i, &antenna1) in freq[..freq.len() - 1].iter().enumerate() {
            for &antenna2 in &freq[i + 1..] {
                let [antinode1, antinode2] = antenna1.resonate(antenna2);
                // because of scanning order, antinode1 ,will always be above anteanna1
                if antinode1.x >= 0 && antinode1.x < width && antinode1.y >= 0 {
                    let index = antinode1.y as usize * width as usize + antinode1.x as usize;
                    let mut cell = grid.get_mut(index).unwrap();
                    count += !*cell as u32;
                    *cell = true;
                }
                // because of scanning order, antinode2 will always be below antenna1
                if antinode2.x >= 0 && antinode2.x < width && antinode2.y < height {
                    let index = antinode2.y as usize * width as usize + antinode2.x as usize;
                    let mut cell = grid.get_mut(index).unwrap();
                    count += !*cell as u32;
                    *cell = true;
                }
            }
        }
    });
    count
}

```
```
Day8 - Part1/grid       time:   [5.3386 µs 5.3489 µs 5.3596 µs]
```
```rust
#[aoc(day8, part2, grid)]
pub fn part2_grid(input: &[u8]) -> u32 {
    let mut grid: BitVec = bitvec![0;input.len()];
    let mut count = 0u32;
    let (antennas, width, height) = find_antennas(input);
    antennas.iter().for_each(|freq| {
        if freq.len() <= 1 {
            return;
        }
        for (i, &antenna1) in freq[..freq.len() - 1].iter().enumerate() {
            let mut cell = grid.get_mut(antenna1.get_index(width)).unwrap();
            count += !*cell as u32;
            *cell = true;
            drop(cell);
            for &antenna2 in &freq[i + 1..] {
                let x_diff = antenna1.x - antenna2.x;
                let y_diff = antenna1.y - antenna2.y;
                let mut antinode = Position {
                    x: antenna1.x + x_diff,
                    y: antenna1.y + y_diff,
                };
                while antinode.x >= 0 && antinode.x < width && antinode.y >= 0 {
                    let mut cell = grid.get_mut(antinode.get_index(width)).unwrap();
                    count += !*cell as u32;
                    *cell = true;
                    antinode.x += x_diff;
                    antinode.y += y_diff;
                }
                let mut antinode = Position {
                    x: antenna2.x - x_diff,
                    y: antenna2.y - y_diff,
                };
                while antinode.x >= 0 && antinode.x < width && antinode.y < height {
                    let mut cell = grid.get_mut(antinode.get_index(width)).unwrap();
                    count += !*cell as u32;
                    *cell = true;
                    antinode.x -= x_diff;
                    antinode.y -= y_diff;
                }
            }
        }
        // handle last antenna since outer loop doesn't
        let mut cell = grid.get_mut(freq[freq.len() - 1].get_index(width)).unwrap();
        count += !*cell as u32;
        *cell = true;
    });
    count
}

```
```
Day8 - Part2/grid       time:   [7.9423 µs 7.9590 µs 7.9768 µs]
```
Turns out some iterators, especially `flat_map`, can make things a lot slower than simple loops.

## Final Times
Unlocking the CPU clock I get these final times:
```
Day8 - Part1/grid       time:   [3.8848 µs 3.8932 µs 3.9029 µs]
Day8 - Part2/grid       time:   [6.5533 µs 6.5646 µs 6.5758 µs]
```
