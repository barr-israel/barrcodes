---
publishDate: 2024-12-01
title: Day 1 - Historian Histeria
author: Barr
keywords: [Advent of Code, Rust]
description: A simple introduction challange.
summary: |
  Another year, another set of challanges from [Advent of Code](https://adventofcode.com/), and once again I will attempt to solve them all using Rust.  
  But this year, I will attempt to document my solutions on this blog.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day1.rs
---

## Part 1
This year I decided to use `cargo-aoc` instead of the messy self-made repository I used [last year](https://github.com/barr-israel/AdventOfCode23), it is a lot nicer to use and I will explain how I use it when relevant.
The first step is to set my Advent of Code credentials using `cargo aoc credentials <token>`, add a couple macros to `lib.rs` and `day1.rs` and then I'm set to start coding.  
As usual, the first few days should pose no significant challenge.

### The Goal
Given a text file containing 2 columns of numbers, the numbers must be paired up based on their sorted order within the column, and then the absolute difference for each pair must be summed and returned.

#### Example
The given example shows the input:
```
3   4
4   3
2   5
1   3
3   9
3   3
```
The pairs should be 
```
1   3
2   3
3   3
3   4
4   9
```
And the output `11`, made out of `2 + 1 + 0 + 1 + 2 + 5`.

### The Naive Solution
The easiest solution involves simply splitting the input to lines, the lines to 2 non-whitespace substrings, and parsing each of them to get the columns.  
After parsing all that's left is to iterate over both columns.
```rust
// simple sort, zip, map to get the required sum(abs(a-b))
fn part1_solve(mut left: Vec<u32>, mut right: Vec<u32>) -> u32 {
    left.sort_unstable();
    right.sort_unstable();
    left.iter().zip(right).map(|(&l, r)| l.abs_diff(r)).sum()
}
#[aoc(day1, part1, naive)]
pub fn part1_naive(input: &str) -> u32 {
    let mut left_col: Vec<u32> = Vec::new();
    let mut right_col: Vec<u32> = Vec::new();
    input.lines().for_each(|line| {
        let mut parts = line.split_whitespace();
        left_col.push(parts.next().unwrap().parse().unwrap());
        right_col.push(parts.next().unwrap().parse().unwrap());
    });
    part1_solve(left_col, right_col)
}
```

The attribute before the function is for `cargo-aoc` to be able to tell which functions solve which days and parts.  
Now running `cargo aoc` I get basic timing and output:
```
AOC 2024
Day 1 - Part 1 : 2367773
        generator: 260ns,
        runner: 23.15µs
```

I am currently not using the `generator` option for `cargo-aoc`, it enables timing parsing and processing separately but requires a post-parsing representation of the input that implements `Display`, which is both inconvenience to implement, and forces me to collect this intermediary form, otherwise the timing for `generator` will only count building the iterator.  

Putting this result into the website and I get my first star and part 2 is unlocked, I'll solve it and come back for optimizations later.

## Part 2

### The Goal
As usual with Advent of Code challenges, in part 2 someone read the instructions incorrectly and now I need to solve the same input with different rules.  
Now the output needs to be the sum of every number from the left column, with the amount of times it appears in the right column(some sort of similarity score).  

### Example
For the same example input from part 1, the expected output is `31` from the sum of `3*3 + 4*1 + 2*0 + 1*0 + 3*3 + 3*3`.

### Naive Solution
A solution very similar to the one I used for part 1 works here, but this time using a `HashMap` instead of a `Vec` for the right column:
```rust
#[aoc(day1, part2, naive)]
pub fn part2_naive(input: &str) -> u32 {
    let mut left_col = Vec::<u32>::new();
    let mut right_col = HashMap::<u32, u16>::new();
    input.lines().for_each(|line| {
        let mut parts = line.split_whitespace();
        left_col.push(parts.next().unwrap().parse().unwrap());
        right_col
            .entry(parts.next().unwrap().parse().unwrap())
            .and_modify(|r| *r += 1)
            .or_insert(1);
    });
    left_col
        .iter()
        .map(|num| num * *right_col.get(num).unwrap_or(&0u16) as u32)
        .sum()
}
```
And running `cargo aoc` I get the correct result and "finish" the day.
```
Day 1 - Part 2 - naive : 21271939
        generator: 98ns,
        runner: 80.076µs
```
Which is where the real fun starts.  
All benchmarks from now on will use `cargo aoc bench` instead of the single run time `cargo aoc` provides.

## The Easy Compilation Flags
As usual, I am using the following cargo profile when performance is the only concern:
```toml
[profile.bench]
inherits = "release"
panic = "abort"
codegen-units = 1
lto = true
```
And using the `RUSTFLAGS="-C target-cpu=native"` environment variable.

## Optimizing Part 1
There are a few parsing optimizations I can use almost every day in Advent of Code:

### Read Every Byte Once
Using `lines()` and `split_whitespace()` is nice and simple, but finding the splitting points already involves checking every byte until the relevant one is found, and then I go over the same bytes again parsing the substrings into integers, where instead, I could do both with one iteration:
```rust
#[aoc(day1, part1, universal)]
// parses the input using hand rolled parsing
pub fn part1(mut input: &[u8]) -> u32 {
    let mut left_col = Vec::new();
    let mut right_col = Vec::new();
    loop {
        let (left_num, remainder) = fast_parse(input);
        let (right_num, remainder) = fast_parse(&remainder[3..]);
        left_col.push(left_num);
        right_col.push(right_num);
        if remainder.len() <= 1 {
            break;
        }
        input = &remainder[1..];
    }
    part1_solve(left_col, right_col)
}
```
The main idea of this solution is that every byte parsed should "consume" it from the slice, I achieve this by reassigning the slice without the parsed bytes.  
Almost every line in this parser is different, so I'll break it down section by section:  
```rust
loop {
  ...
  if remainder.len() <= 1 {
      break;
  }
  ...
}
```
This parser stops when the branch inside the loop body reaches the last line with 1 byte remaining.  
This check can't be at the start of the iteration as a `while` condition because the last line does not have a line-break.  
The loop body will shrink the slice as it parses it.  
```rust
let (left_num, remainder) = fast_parse(input);
let (right_num, remainder) = fast_parse(&remainder[3..]);
```
`fast_parse` is a &[u8] to unsigned integer function I wrote that is both faster than the standard one and parses until failure and returns the remaining slice, I will dive into it in a little bit.
```rust
input = &remainder[1..];
```
This line consumes the line-break.

### fast_parse
`fast_parse` is a simple function that turns a byte slice into an unsigned integer:
```rust
pub fn fast_parse<T>(mut input: &[u8]) -> (T, &[u8])
where
    T: std::ops::Add<Output = T> + std::ops::Mul<Output = T> + From<u8> + Clone + std::marker::Copy,
{
    let mut sum = T::from(0u8);
    let ten: T = T::from(10u8);
    while !input.is_empty() && input[0] >= b'0' && input[0] <= b'9' {
        sum = sum * ten + T::from(input[0] - b'0');
        input = &input[1..];
    }
    (sum, input)
}
```
Rust generics can be a little hard to read, but this one simply works for every type that implements a closed Mul and Add, which fits all the unsigned integers.  
In addition to parsing the integer, it also advances the slice by 1 byte for every byte read, and returns it when it encounters a byte that is not a digit.
I will probably use this function a lot during the month so I'm putting it in a `util.rs` file.

> [!WARNING]
> This function can easily break in other scenarios, for example, given too many digits for the requested output type, or given UTF-8 strings, or some other unexpected type that implements close Mul and Add. Its only purpose is to parse unsigned integers fast.
Running this optimized version nets a significant improvement:

And the new times are:
```
Day1 - Part1/naive      time:   [63.754 µs 64.324 µs 65.061 µs]
Day1 - Part1/universal  time:   [24.412 µs 24.459 µs 24.509 µs]
```
And applying a similar optimization to part 2:
```rust
#[aoc(day1, part2, universal)]
pub fn part2(mut input: &[u8]) -> u32 {
    let mut left_col = Vec::<u32>::new();
    let mut right_col = HashMap::<u32, u16>::new();
    loop {
        let (left_num, remainder) = fast_parse(input);
        // 3 spaces between numbers
        let (right_num, remainder) = fast_parse(&remainder[3..]);
        left_col.push(left_num);
        right_col
            .entry(right_num)
            .and_modify(|r| *r += 1)
            .or_insert(1);
        if remainder.len() <= 1 {
            break;
        }
        input = &remainder[1..];
    }
    left_col
        .iter()
        .map(|num| num * *right_col.get(num).unwrap_or(&0u16) as u32)
        .sum()
}
```
With decent results:
```
Day1 - Part2/naive      time:   [88.751 µs 88.960 µs 89.191 µs]
Day1 - Part2/universal  time:   [49.330 µs 49.563 µs 49.835 µs]
```
Another easy gain comes from using a faster hash function and preallocating the `HashMap`, I chose to use `fxhash`, which is very fast at the cost of not being cryptographically secure, which is not an issue here:
```rust
let mut right_col = fxhash::FxHashMap::<u32, u16>::with_capacity_and_hasher(1000, Default::default());
```
As expected, the results are even better:
```
Day1 - Part2/universal  time:   [18.682 µs 18.794 µs 18.903 µs]
```
Before going for the next optimization, I wanted to try out `nom`, the parser combinator library that can make parsing a lot easier:

## Nom
`nom` can be very overwhelming at first, the way to write parsers is unlike any programming I have done before, but the idea is that it allows the user to write high performance parsers without going down to the bytes level.
Here is my solution to part 1 using `nom`:
```rust
#[aoc(day1, part1, nom)]
// parses the input using nom
pub fn part1_nom(input: &[u8]) -> u32 {
    let mut it = iterator(
        input,
        terminated(
            separated_pair(complete::u32, tag("   "), complete::u32),
            opt(newline)
        ),
    );
    let (left, right) = it.collect::<(Vec<u32>, Vec<u32>)>();
    debug_assert!({
        let res: IResult<_, _> = it.finish();
        res.is_ok()
    });
    part1_solve(left, right)
}
```
Effectively what the parser does is:
Iterate over the text, consuming `seperated_pair`s of 2 `u32`s separated by 3 spaces every time, and each pair is separated from the next using an optional line break.
`debug_assert!` is only there to help the compiler understand the correct types for `it`, I could not find an easier way to get this code to compile.
And the results:
```
Day1 - Part1/nom  time:   [31.367 µs 31.411 µs 31.457 µs]
```
Better than the naive solution by a lot, but missing quite a bit of performance compared to the hand written parser.  
I will not attempt to solve part 2 using `nom`, I expect similar conclusions.


And now, for the final 2 optimization for today:

## Abandoning Universal Solutions
The solution until this point solved any input in the shape that is valid according the example and problem description(maybe except for the skipping 3 spaces part).  
But opening the real problem input, I can see that each line is **exactly** 14 characters long(except the last one that is missing a line break...).  
Using this assumption the hand rolled parser can become even better:
```rust
fn parse_line_fast(line: &[u8]) -> (u32, u32) {
    let left_num = (line[0] - b'0') as u32 * 10000u32
        + (line[1] - b'0') as u32 * 1000u32
        + (line[2] - b'0') as u32 * 100u32
        + (line[3] - b'0') as u32 * 10u32
        + (line[4] - b'0') as u32;
    let right_num = (line[8] - b'0') as u32 * 10000u32
        + (line[9] - b'0') as u32 * 1000u32
        + (line[10] - b'0') as u32 * 100u32
        + (line[11] - b'0') as u32 * 10u32
        + (line[12] - b'0') as u32;
    (left_num, right_num)
}
```
And using it for part 1:
```rust
#[aoc(day1, part1, fast)]
// parsing the input optimised for the real input shape
pub fn part1_fast(input: &[u8]) -> u32 {
    let (left_col, right_col) = input.chunks(14).map(parse_line_fast).unzip();
    part1_solve(left_col, right_col)
}
```
And 2:
```rust { {hl_lines=[8]}}
// parsing the input optimised for the real input shape
#[aoc(day1, part2, fast)]
pub fn part2_fast(input: &[u8]) -> u32 {
    let mut left_col = Vec::<u32>::with_capacity(1000);
    // value type shrunk to u8 because in the real input no value repeats a huge amount of times
    let mut right_col =
        fxhash::FxHashMap::<u32, u8>::with_capacity_and_hasher(1000, Default::default());
    input.chunks(14).for_each(|line| {
        let (l, r) = parse_line_fast(line);
        left_col.push(l);
        right_col.entry(r).and_modify(|r| *r += 1).or_insert(1);
    });
    left_col
        .iter()
        .map(|num| num * *right_col.get(num).unwrap_or(&0u16) as u32)
        .sum()
}
```
This new solution knows exactly where and what each byte and each line is and makes the most out of it.  
The iterator gets chunks of 14 bytes, no wondering about where the next line break is, `parse_line_fast` has the weight of each byte hard coded.  
And the results are measurable faster:
```
Day1 - Part1/universal  time:   [22.790 µs 23.094 µs 23.392 µs]
Day1 - Part1/fast       time:   [20.697 µs 20.736 µs 20.776 µs]

Day1 - Part2/universal  time:   [20.223 µs 20.266 µs 20.313 µs]
Day1 - Part2/fast       time:   [14.881 µs 14.963 µs 15.094 µs]
```

Almost there..

## SIMD
SIMD instructions can operate on multiple numbers at once, if structured correctly, sometimes the compiler can do it on its own(usually called vectorization), and sometimes it needs a little help.  
The `parse_line_fast` function can utilise these SIMD instructions, but using the `portable_simd` from the standard library, requires using nightly and an unstable feature flag.
```rust
fn parse_line_simd(line: &[u8]) -> (u32, u32) {
    const WEIGHTS: u32x4 = u32x4::from_slice(&[10000u32, 1000u32, 100u32, 10u32]);
    const ZERO: u32x4 = u32x4::from_slice(&[b'0' as u32; 4]);
    let left_simd: u32x4 = u8x4::load_or_default(&line[..4]).cast();
    let right_simd: u32x4 = u8x4::load_or_default(&line[8..12]).cast();
    (
        ((left_simd - ZERO) * WEIGHTS).reduce_sum() + (line[4] - b'0') as u32,
        ((right_simd - ZERO) * WEIGHTS).reduce_sum() + (line[12] - b'0') as u32,
    )
}
```
This implementations does the subtraction and multiplication at the same time on all the digits of a number, and sums then sums the results.
The performance using this implementation is a little bit faster:
```
Day1 - Part1/fast  time:   [20.697 µs 20.736 µs 20.776 µs]
Day1 - Part1/simd  time:   [17.550 µs 17.650 µs 17.817 µs]

Day1 - Part2/fast  time:   [14.881 µs 14.963 µs 15.094 µs]
Day1 - Part2/simd  time:   [14.808 µs 14.840 µs 14.874 µs]
```

## Going Into The Assembly
As I was working on this post, I decided to look into the generated assembly instructions and noticed 2 things:

1. `parse_line_fast` already does some vectorization:
```asm
let right_num = (line[8] - b'0') as u32 * 10000u32          
  vmovd        0x8(%rax),%xmm1                       
+ (line[4] - b'0') as u32;                           
  add          $0xd0,%cl                             
  movzbl       %cl,%ecx                              
+ (line[12] - b'0') as u32;                          
  movzbl       0xc(%rax),%edx                        
  add          %rsi,%rax                             
  sub          %rsi,%rbx                             
+ (line[9] - b'0') as u32 * 1000u32                  
  vpaddb       %xmm3,%xmm1,%xmm1                     
  vpmovzxbd    %xmm1,%xmm1                           
  vpmaddwd     %xmm4,%xmm1,%xmm1                     
+ (line[1] - b'0') as u32 * 1000u32                  
  vpaddb       %xmm3,%xmm0,%xmm0                     
  vpmovzxbd    %xmm0,%xmm0                           
  vpmaddwd     %xmm4,%xmm0,%xmm0                     
let left_num = (line[0] - b'0') as u32 * 10000u32    
  vpshufd      $0xee,%xmm0,%xmm2                     
  vpaddd       %xmm2,%xmm0,%xmm0                     
  vpshufd      $0x55,%xmm0,%xmm2                     
  vpaddd       %xmm2,%xmm0,%xmm0                     
  vmovd        %xmm0,%esi                            
  add          %ecx,%esi                             
+ (line[12] - b'0') as u32;                          
  add          $0xd0,%dl                             
  movzbl       %dl,%ecx                              
let right_num = (line[8] - b'0') as u32 * 10000u32   
  vpshufd      $0xee,%xmm1,%xmm0                     
  vpaddd       %xmm0,%xmm1,%xmm0                     
  vpshufd      $0x55,%xmm0,%xmm1                     
  vpaddd       %xmm1,%xmm0,%xmm0                     
  vmovd        %xmm0,%edx                            
```
Which explains why there wasn't a bigger performance jump when I added it myself, but these are only 128 bit registers, when this CPU has 256 bit ones.

2. There seem to be a lot of bounds checking:
```asm
fn parse_line_fast(line: &[u8]) -> (u32, u32) {
let left_num = (line[0] - b'0') as u32 * 10000u32
  cmp          $0x1,%rsi
↓ je           7b6
  test         %rsi,%rsi
↓ je           790
+ (line[1] - b'0') as u32 * 1000u32
+ (line[2] - b'0') as u32 * 100u32
  cmp          $0x2,%rbx
↓ jbe          727
+ (line[3] - b'0') as u32 * 10u32
  cmp          $0x3,%rbx
↓ je           7cc
+ (line[4] - b'0') as u32;
  cmp          $0x4,%rbx
↓ jbe          764
let right_num = (line[8] - b'0') as u32 * 10000u32
  cmp          $0x8,%rbx
↓ jbe          73d
+ (line[9] - b'0') as u32 * 1000u32
  cmp          $0x9,%rbx
↓ je           7a0
+ (line[10] - b'0') as u32 * 100u32
  cmp          $0xa,%rbx
↓ jbe          77a
+ (line[11] - b'0') as u32 * 10u32
  cmp          $0xb,%rbx
↓ je           7e2
+ (line[12] - b'0') as u32;
  cmp          $0xc,%rbx
↓ jbe          74e
```
Which can sometimes be solved by adding assertions or reordering index operations.  
A single added `assert!(line.len() >= 13)`, and all the bounds checking is replaced with a single comparison:
```
fn parse_line_fast(line: &[u8]) -> (u32, u32) {
assert!(line.len() >= 13);
  cmp          $0xc,%rbx
↓ jbe          6d3
```
But does it make a difference to performance?
```
Day1 - Part1/fast(OLD)  time:   [20.697 µs 20.736 µs 20.776 µs]
Day1 - Part1/fast  time:   [17.201 µs 17.308 µs 17.449 µs]

Day1 - Part2/fast(OLD)  time:   [14.881 µs 14.963 µs 15.094 µs]
Day1 - Part2/fast  time:   [11.945 µs 12.003 µs 12.078 µs]
```
Looks like the answer is yes, its a tiny bit faster now, it is now in line with the SIMD solution.

Looking at how the time is spent in the program, ~65% of the time in part 1 is spent sorting the arrays, and a decent amount of time in part 2 is spent inside the `HashMap`, so there's only one thing left to do.

## Arrays Are Just Very Simple Maps
If the program is spending so much time inside the `HashMap`, maybe it's best to get rid of it.  
The purpose of the `HashMap` is to provide a mapping from some key `K` to an index in a vector that contains the value `V`.  
I propose that `K` IS the index.  
Yes, `nohash` exists for effectively this purpose, but going simpler and on the stack instead of the heap can be a lot faster.  
So behold, the new `"HashMap"`:
```rust {hl_lines=[4,8,12]}
pub fn part2_fast(input: &[u8]) -> u32 {
    let mut left_col = Vec::<u32>::with_capacity(1000);
    // all numbers are 10000-99999
    let mut right_col = [0u8; 90_000];
    input.chunks(14).for_each(|line| {
        let (l, r) = parse_line_fast(line);
        left_col.push(l);
        right_col[(r - 10000) as usize] += 1;
    });
    left_col
        .into_iter()
        .map(|num| num * (right_col[(num - 10000) as usize] as u32))
        .sum()
}
```
Instead of a growing map that keeps hashing a key, I simply use an array that can fit all the "keys" to begin with, all initialized to 0, and index into it.  
And the results are impressive:  
```
Day1 - Part2/fast(OLD)  time:   [11.945 µs 12.003 µs 12.078 µs]
Day1 - Part2/fast       time:   [8.0441 µs 8.0764 µs 8.1051 µs]
```
Applying the same optimizations to the SIMD solution gives effectively identical performance.

## End of Day 1
This is it for today, I hope I will have enough time to solve and write about the rest of the days as well, but the later days last year were difficult enough that just solving them took a long time, I'm hopeful.

