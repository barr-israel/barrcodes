---
publishDate: 2024-12-07
title: Day 7 - Bridge Repair
author: Barr
keywords: [Advent of Code, Rust]
description: Bruteforce math.
summary: |
  Appearently elephents can still math operators and *I* need to fix it.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day7.rs
---

## Input
Each line in the input is in the format:
```
X: n1 n2 n3 n4...
```
And on some of the lines, filling in operators between the `n` numbers, will make them equal to `X`.  
For example:
```
190: 19 10
```
`19*10=190` So the line is valid, and the final answer in both part 1 and 2 are the sum of the valid lines' `X`.  
One important note is that operations are *always* left to right, without normal order of operations.

## Part 1
The available operators are addition and multiplication.  
The first step is parse each line into numbers and pass them through *some* predicate I can implement later:
```rust
pub fn part1_first(mut input: &[u8]) -> u64 {
    let mut sum = 0u64;
    let mut buffer = ArrayVec::<[u16; 32]>::new();
    loop {
        let (total, remainder) = fast_parse::<u64>(input);
        // skip :
        input = &remainder[1..];
        while !input.is_empty() && input[0] != b'\n' {
            let (num, remainder) = fast_parse(&input[1..]);
            buffer.push(num);
            input = remainder;
        }
        if check_equation(total, &buffer) {
            sum += total;
        }
        if input.is_empty() {
            return sum;
        } else {
            input = &input[1..];
        }
        buffer.clear();
    }
}
```
I wrote this first terrible but working solution for `check_equation` immediately after waking up:
```rust
fn check_equation(total: u64, buffer: &[u16]) -> bool {
    // go over every permutation, the first number is always added as is
    (0..1u16 << (buffer.len() - 1)).any(|mask| {
        let mut accumulator = buffer[0] as u64;
        (0..(buffer.len() - 1)).for_each(|bit| {
            if (1 << bit) & mask == 0 {
                accumulator += buffer[bit + 1] as u64;
            } else {
                accumulator *= buffer[bit + 1] as u64
            }
        });
        accumulator == total
    })
}
```
I will not elaborate.  
Instead I will show a massively improved solution that uses ***recursion***:
```rust
fn check_equation_recursive(total: u64, buffer: &[u16]) -> bool {
    check_equation_recursive_inner(total, &buffer[1..], buffer[0] as u64)
}

fn check_equation_recursive_inner(total: u64, buffer: &[u16], accumulator: u64) -> bool {
    if buffer.is_empty() {
        accumulator == total
    } else {
        check_equation_recursive_inner(total, &buffer[1..], accumulator + buffer[0] as u64)
            || check_equation_recursive_inner(total, &buffer[1..], accumulator * buffer[0] as u64)
    }
}
```
Fairly simple to understand by anyone who has ever used recursion, but just in case:  
For every number in the buffer, I'm trying both adding it to the accumulator, and if that doesn't work, multiply it with the accumulator, and through the magic of *recursion*, I get the right answer.  
This solution is easier to read and write and it's 3 times faster, but its not time for optimizations yet.

## Part 2 - Another operator
For part 2 another operator is added: concatenation, a number can be concatenated to the end of the accumulator.  
It took me a while to realize the concatenation is also left to right and doesn't take precedence over other operators, and I wasted a lot of time because of that.  
The real answer is just adding another line to the recursive equation check from part 1:
```rust
fn check_equation_recursive_inner_part2(total: u64, buffer: &[u16], accumulator: u64) -> bool {
    if buffer.is_empty() {
        accumulator == total
    } else {
        check_equation_recursive_inner_part2(total, &buffer[1..], accumulator + buffer[0] as u64)
            || check_equation_recursive_inner_part2(
                total,
                &buffer[1..],
                accumulator * buffer[0] as u64,
            )
            || check_equation_recursive_inner_part2(
                total,
                &buffer[1..],
                accumulator * 10u64.pow(buffer[0].ilog10() + 1) + buffer[0] as u64,
            )
    }
}
```

And that's it.

## Optimizations
As usual, benchmarks with a locked CPU clock,Initial times:
```
Day7 - Part1/rec        time:   [834.55 µs 835.18 µs 835.91 µs]
Day7 - Part2/rec        time:   [46.455 ms 46.856 ms 47.366 ms]
```

My first idea was to short circuit the recursion if the accumulator gets too big, since all the operators only make it bigger, that requires a single line added to both functions:
```rust
if accumulator > total {
    false
}
```
And the new times are:
```
Day7 - Part1/rec        time:   [1.0028 ms 1.0143 ms 1.0299 ms]
Day7 - Part2/rec        time:   [31.784 ms 31.874 ms 31.960 ms]
```
Part 1 is slower and part 2 is a lot faster, probably because part 2 gets big a lot faster with the concatenation operator.

My next idea was to pre-calculate the multiplier a number applies to the accumulator when it is concatenated, this means the buffer now stores `(u16,u64)`, and instead of calculating `10u64.pow(buffer[0].ilog10()+1)` every time, I do it once while parsing, and access it later via `buffer[0].1`.  
```
Day7 - Part2/precalc    time:   [26.617 ms 26.778 ms 26.960 ms]
```
Getting faster

Sometimes turning a recursive function to an iterative one using a queue can make it faster:
```rust
fn check_equation_iterative(total: u64, buffer: &[u16]) -> bool {
    let mut queue = ArrayVec::<[(usize, u64); 32]>::new();
    queue.push((1, buffer[0] as u64));
    while !queue.is_empty() {
        let (i, acc) = queue.pop().unwrap();
        if i == buffer.len() {
            if total == acc {
                return true;
            }
        } else {
            queue.push((i + 1, acc * buffer[i] as u64));
            queue.push((i + 1, acc + buffer[i] as u64));
        }
    }
    false
}
```
```
Day7 - Part1/iter       time:   [990.47 µs 995.98 µs 1.0020 ms]
```
Another option is to work the way *down* from `total` to 0, while it might look very similar, it allows one important optimization: if a division is not round, it's not allowed, unlike multiplication that had no such check.
```rust
fn check_equation_iterative_rem(total: u64, buffer: &[u64]) -> bool {
    let mut queue = ArrayVec::<[(usize, u64); 16]>::new();
    // - buffer.len() for the 1 cases where mul is smaller
    let lower_bound: u64 = buffer.iter().sum::<u64>() - buffer.len() as u64;
    let upper_bound: u64 = buffer.iter().product();
    if (total < lower_bound) || (total > upper_bound) {
        return false;
    }
    let last = buffer[buffer.len() - 1];
    if total % last == 0 {
        queue.push((buffer.len() - 2, total / last));
    }
    queue.push((buffer.len() - 2, total - last));
    while !queue.is_empty() {
        let (i, remainder) = queue.pop().unwrap();
        if i == 0 {
            if remainder == buffer[0] {
                return true;
            }
        } else {
            let num = buffer[i];
            if remainder % num == 0 {
                queue.push((i - 1, remainder / num));
            }
            queue.push((i - 1, remainder - num));
        }
    }
    false
}
```
A lot faster:
```
Day7 - Part1/iter     time:   [990.47 µs 995.98 µs 1.0020 ms]
Day7 - Part1/iter_rem time:   [315.99 µs 316.25 µs 316.52 µs]
```

Applying the same method to part 2:
```rust
fn check_equation_recursive_inner_part2_rem(
    remainder: u64,
    buffer: &[(u16, u64)],
    index: usize,
) -> bool {
    if index == 0 {
        remainder == buffer[0].0 as u64
    } else {
        let num = buffer[index];
        check_equation_recursive_inner_part2_precalc(remainder - num.0 as u64, buffer, index - 1)
            || (remainder % num.0 as u64 == 0
                && check_equation_recursive_inner_part2_precalc(
                    remainder / num.0 as u64,
                    buffer,
                    index - 1,
                ))
            || (remainder % num.1 == num.0 as u64
                && check_equation_recursive_inner_part2_precalc(
                    remainder / num.1,
                    buffer,
                    index - 1,
                ))
    }
}

```
And..
```
Day7 - Part2/precalc time:   [26.617 ms 26.778 ms 26.960 ms]
Day7 - Part2/rem     time:   [585.79 µs 586.32 µs 586.90 µs]
```
Wow, 45x speedup.

## Multithreading
I've got more cores, might as well use them:

### Part 1
```rust
#[aoc(day7, part1, mt)]
pub fn part1_mt(input: &[u8]) -> u64 {
    input
        .par_split(|&c| c == b'\n')
        .filter_map(|line| {
            let mut buffer = ArrayVec::<[u64; 16]>::new();
            let (total, mut remainder) = fast_parse::<u64>(line);
            // skip :
            remainder = &remainder[1..];
            while !remainder.is_empty() {
                let (num, r) = fast_parse(&remainder[1..]);
                buffer.push(num);
                remainder = r;
            }
            if check_equation_iterative_rem_own(total, buffer) {
                Some(total)
            } else {
                None
            }
        })
        .sum()
}
```
```
Day7 - Part1/mt         time:   [75.154 µs 77.422 µs 80.212 µs]
```
### Part 2
```rust
#[aoc(day7, part2, mt)]
pub fn part2_mt(input: &[u8]) -> u64 {
    input
        .par_split(|&c| c == b'\n')
        .filter_map(|line| {
            let mut buffer = ArrayVec::<[(u64, u64); 16]>::new();
            let (total, mut remainder) = fast_parse::<u64>(line);
            // skip :
            remainder = &remainder[1..];
            while !remainder.is_empty() {
                let (num, r) = fast_parse(&remainder[1..]);
                buffer.push((num, 10u64.pow(num.ilog10() + 1)));
                remainder = r;
            }
            if check_equation_recursive_part2_rem(total, &buffer) {
                Some(total)
            } else {
                None
            }
        })
        .sum()
}
```
```
Day7 - Part2/mt         time:   [115.66 µs 120.27 µs 125.80 µs]
```
Nice speed ups in both parts.

## Final Times
For both single and multithreaded on both parts without the CPU clock lock:
```
Day7 - Part1/rec time:   [198.27 µs 198.76 µs 199.37 µs]
Day7 - Part1/mt  time:   [51.088 µs 53.039 µs 55.570 µs]
Day7 - Part2/rem time:   [374.80 µs 375.17 µs 375.62 µs]
Day7 - Part2/mt  time:   [97.839 µs 100.26 µs 103.74 µs]
```
