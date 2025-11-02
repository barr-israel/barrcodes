---
publishDate: 2024-12-04
title: Day 4 - Ceres Search
author: Barr
keywords: [Advent of Code, Rust]
description: Going 2 dimensional - a word search
summary: |
  Seems like these challenges mostly don't involve searching for this missing historian(does anyone even notice the lore for these?), today we've got an elf looking for help with her word search.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day4.rs
---
## Part 1
The task for part 1 is simple: given a grid of letters, find all occurrences of `XMAS`, forwards, backwards, up, down, and diagonal.
I learned from yesterday, and I'll start with a naive solution:
```rust
fn find_surrounding_mas(input: &[u8], i: usize, line_len: usize) -> u32 {
    // LEFT
    (i>=3 && &input[i-3..i]==b"SAM") as u32+
    // RIGHT
    (i<=input.len()-4 && &input[i+1..i+4]==b"MAS") as u32+
    // UP
    (i>=3*line_len
        && input[i-3*line_len] == b'S'
        && input[i-2*line_len] == b'A'
        && input[i-line_len] == b'M') as u32 +
    // UP+RIGHT
    (i+3>=3*line_len
    && input[i+3-3*line_len] == b'S'
    && input[i+2-2*line_len] == b'A'
    && input[i+1-line_len] == b'M') as u32 +
    // UP+LEFT
    (i>=3*line_len+3
        && input[i-3*line_len-3] == b'S'
        && input[i-2*line_len-2] == b'A'
        && input[i-line_len-1] == b'M') as u32 +
    //DOWN
    (i+3*line_len<input.len()
        && input[i+3*line_len] == b'S'
        && input[i+2*line_len] == b'A'
        && input[i+line_len] == b'M') as u32 +
    //DOWN+RIGHT
    (i+3*line_len+3<input.len()
        && input[i+3*line_len+3] == b'S'
        && input[i+2*line_len+2] == b'A'
        && input[i+line_len+1] == b'M') as u32 +
    // DOWN+LEFT
    (i+3*line_len-3<input.len()
        && input[i+3*line_len-3] == b'S'
        && input[i+2*line_len-2] == b'A'
        && input[i+line_len-1] == b'M') as u32
}

pub fn part1(input: &[u8]) -> u32 {
    let line_len = memchr::memchr(b'\n', input).unwrap() + 1;
    memchr::memchr_iter(b'X', input)
        .map(|i| find_surrounding_mas(input, i, line_len))
        .sum::<u32>()
}
```
I'm just looking all the `X`s in the input(using `memchr` which I introduced [yesterday](`/posts/aoc2024/day1`), could have also used a simple `position`), and then checking their surroundings.

The only issues I had was bounds checking mistakes, I first tried fixing them with checked `input.get()`, but the index could underflow anyway, so I didn't use it.

This solution solves part 1 and now it's time for part 2.

## Part 2
Of course, the instructions given in part 1 were wrong, this is not an `XMAS` search, it's an `X-MAS` search, meaning I need to find X patterns of the word `MAS`, for example:
```
M.M
.A.
S.S
```
The `.` are other irrelevant letters, of course each `MAS` can be forwards or backwards.  
To me this seems even easier than part 1:
```rust
fn is_x(input: &[u8], i: usize, line_len: usize) -> bool {
    // UPLEFT+DOWNRIGHT
    ((input.get(i - line_len - 1) == Some(&b'M') && input.get(i + line_len + 1) == Some(&b'S'))
        || (input.get(i - line_len - 1) == Some(&b'S') && input.get(i + line_len + 1) == Some(&b'M'))) &&
    // DOWNLEFT+UPRIGHT
    ((input.get(i + line_len - 1) == Some(&b'M') && input.get(i - line_len + 1) == Some(&b'S'))
        || (input.get(i + line_len - 1) == Some(&b'S') && input.get(i - line_len + 1) == Some(&b'M')))
}
pub fn part2(input: &[u8]) -> u32 {
    let line_len = memchr::memchr(b'\n', input).unwrap() + 1;
    memchr::memchr_iter(b'A', input)
        .filter(|&i| is_x(input, i, line_len))
        .count() as u32
}
```
Find all the `A`s, check their surroundings, and part 2 is done.

## Failed Optimization
The initial times:
```
Day4 - Part1/naive time:   [79.028 µs 79.312 µs 79.645 µs]
Day4 - Part2/naive time:   [57.325 µs 57.440 µs 57.577 µs]
```

The only optimization I can think of is using `memchr::memmem` to replace the right and left checks:
```rust
let forwards = find_iter(input, "XMAS").count() as u32;
let backwards = find_iter(input, "SAMX").count() as u32;
let line_len = memchr::memchr(b'\n', input).unwrap() + 1;
let other: u32 = memchr::memchr_iter(b'X', input[line_len..input.len() - line_len])
    .map(|i| find_surrounding_mas(input, i+lin, line_len))
    .sum();
forwards + backwards + other
```
The right and left checks were removed from `find_surrounding_mas`.
```
Day4 - Part1/naive  time:   [79.028 µs 79.312 µs 79.645 µs]
Day4 - Part1/memmem time:   [102.43 µs 102.75 µs 103.08 µs]
```
Turns out its slower...

I also tried replacing all the indexing inside `find_surrounding_mas` with unsafe `get_unchecked` but it was also slower (~86us).

### Multithreading For The Win?
As a last resort, I tried going multithreaded.  
Using a simple rayon `iter_bridge` gave an 8x slowdown, not good.  
Using standard threads and chunking the input properly was not as bad:
```rust
#[aoc(day4, part1, mt)]
pub fn part1_mt(input: &[u8]) -> u32 {
    const THREAD_COUNT: usize = 2usize;
    let line_len = memchr::memchr(b'\n', input).unwrap() + 1;
    let chunk_size = input.len() / THREAD_COUNT;
    thread::scope(|s| {
        let threads: Vec<ScopedJoinHandle<u32>> = (0..THREAD_COUNT)
            .map(|tid| s.spawn(move || part1_chunk(input, line_len, tid, chunk_size)))
            .collect();
        let local_res = memchr::memchr_iter(b'X', &input[THREAD_COUNT * chunk_size..])
            .map(|i| find_surrounding_mas(input, i + THREAD_COUNT * chunk_size, line_len))
            .sum::<u32>();
        local_res + threads.into_iter().map(|t| t.join().unwrap()).sum::<u32>()
    })
}
fn part1_chunk(input: &[u8], line_len: usize, tid: usize, chunk_size: usize) -> u32 {
    memchr::memchr_iter(b'X', &input[tid * chunk_size..(tid + 1) * chunk_size])
        .map(|i| find_surrounding_mas(input, i + tid * chunk_size, line_len))
        .sum::<u32>()
}
```
But also not great:

| threads | time  |
| ------- | ----- |
| 2       | 80us  |
| 4       | 85us  |
| 6       | 100us |

This is not it either, I'll stick to the multithreaded solution.

## Optimizing Part 2
While I could not improve part 1, I have a couple ideas for part 2:
I can search for the `A` only in the middle lines(not first or last), since in the outer lines there can't possibly the required X shape around it, and the same for the outer columns.
```rust {hl_lines=[4,5]}
pub fn part2_opt(input: &[u8]) -> u32 {
    let line_len = memchr::memchr(b'\n', input).unwrap() + 1;
    // no point searching in the first and last line and column and helps with bounds checking
    memchr::memchr_iter(b'A', &input[line_len..input.len() - line_len])
        .filter(|&i| is_x(input, i + line_len, line_len))
        .count() as u32
}
fn is_x(input: &[u8], i: usize, line_len: usize) -> bool {
    let column = i % line_len;
    if column == 0 || column == line_len - 1 {
        return false;
    }
    // UPLEFT+DOWNRIGHT
    ((input.get(i - line_len - 1) == Some(&b'M') && input.get(i + line_len + 1) == Some(&b'S'))
        || (input.get(i - line_len - 1) == Some(&b'S') && input.get(i + line_len + 1) == Some(&b'M'))) &&
    // DOWNLEFT+UPRIGHT
    ((input.get(i + line_len - 1) == Some(&b'M') && input.get(i - line_len + 1) == Some(&b'S'))
        || (input.get(i + line_len - 1) == Some(&b'S') && input.get(i - line_len + 1) == Some(&b'M')))
}
```
But it's slower..
```
Day4 - Part2/naive      time:   [57.325 µs 57.440 µs 57.577 µs]
Day4 - Part2/opt        time:   [63.710 µs 63.891 µs 64.066 µs]
```
What I didn't do yet, is utilize this knowledge that the X is always in the center area - the `get()` methods will never go out of bounds, this means that can be replaced by normal indexing, and more than that, since I know it will never go out of bounds and the compiler doesn't, I can replace it with unsafe `get_unchecked()`.  
```
Day4 - Part2/opt        time:   [55.863 µs 55.969 µs 56.093 µs]
```
A little better.  
One final attempt:  
Instead of checking both the `M` and the `S` in both directions forwards and backwards, it is possible to check if the sum matches `M+S` in both diagonals:
```rust
// UPLEFT+DOWNRIGHT
(input.get_unchecked(i - line_len - 1)+input.get_unchecked(i + line_len + 1) == (b'S'+b'M')) &&
// DOWNLEFT+UPRIGHT
(input.get_unchecked(i + line_len - 1) + input.get_unchecked(i - line_len + 1) == (b'S'+b'M'))
```
```
Day4 - Part2/opt        time:   [51.502 µs 52.007 µs 52.690 µs]
```
And even faster than before.

## End of Day 4
I guess this is it for the day, I could not improve part 1 at all, but at least I improved part 2 a little.

