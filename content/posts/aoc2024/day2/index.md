---
publishDate: 2024-12-02
title: Day 2 - Red-Nosed Reports
author: Barr
keywords: [Advent of Code, Rust]
description: A classic "one mistake allowed" challange.
summary: |
  Second day, this time we've got a classic "one mistake allowed" challange for part 2.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day2.rs
---
Part 1 is fairly basic, I'll just get to my naive solution:

## Naive Part 1
```rust
fn check_pair(a: u32, b: u32, direction: bool) -> bool {
    a != b && (a <= b) == direction && a.abs_diff(b) <= 3
}
fn check_line(nums: &[u32], direction: bool) -> bool {
    nums.windows(2).all(|n| check_pair(n[0], n[1], direction))
}
#[aoc(day2, part1, naive)]
fn part1_naive(input: &str) -> u32 {
    input
        .lines()
        .filter(|&line| {
            let nums: Vec<u32> = line
                .split_whitespace()
                .map(|str_num| str_num.parse::<u32>().unwrap())
                .collect();
            let direction = nums[0] < nums[1];
            check_line(&nums, direction)
        })
        .count() as u32
}
```
Iterating over the lines, for each line:  

- Parse numbers
- Detect direction
- Validate all pairs match direction and allowed distance.

Running this solution gives the correct answer and it's time for part 2

## Naive Part 2
In part 2, the same input is given but now 1 number is allowed to be removed from each line to meet the criteria.  
Do note this is optional, if the line was valid in part 1, it is also valid in part 2.  

So the first step for each line is the same full line check from part 1, and if that does not work, a new method that allows 1 mistake should be used.  
After a little thinking, I decided to split the numbers into 3 sections that need to be checked:

1. All numbers before the removed number.
2. The last number from section 1 and the first number from section 3.
3. All numbers after the removed number.

1 and 3 can be checked like full lines using `check_line` and 2 can be checked using `check_pair`.  
The only issue is the edge cases where the removed number is first, second or last, so I handled those separately:
```rust
#[aoc(day2, part2, naive)]
fn part2_naive(input: &str) -> u32 {
    input
        .lines()
        .filter(|&line| {
            let nums: Vec<u32> = line
                .split_whitespace()
                .map(|str_num| str_num.parse::<u32>().unwrap())
                .collect();
            let direction = nums[0] <= nums[1];
            // no mistakes
            if check_line(&nums, direction) {
                true
            } else {
                // removed 0 case
                let direction0 = nums[1] <= nums[2];
                if check_line(&nums[1..], direction0) {
                    return true;
                }
                // removed 1 case
                let direction1 = nums[0] <= nums[2];
                if nums[0] != nums[2]
                    && nums[0].abs_diff(nums[2]) <= 3
                    && check_line(&nums[2..], direction1)
                {
                    return true;
                }
                // removed last case
                if check_line(&nums[..nums.len() - 1], direction) {
                    return true;
                }
                // rest of the cases
                // split into 2 line checks and a pair checks across the removed number
                for removed in 2..nums.len() - 1 {
                    if check_line(&nums[..removed], direction)
                        && check_pair(nums[removed - 1], nums[removed + 1], direction)
                        && check_line(&nums[removed + 1..], direction)
                    {
                        return true;
                    }
                }
                false
            }
        })
        .count() as u32
}
```

This solution works and grants me the 2nd star of the day, but it is not very efficient, it checks every possible mistake location.

Let's see the initial times:
```
Day2 - Part1/naive      time:   [141.52 µs 142.54 µs 143.80 µs]
Day2 - Part2/naive      time:   [173.29 µs 173.62 µs 173.94 µs]
```

Despite theoretically doing a lot more work, part 2 is not that much slower than part 1, even before going deeper into the profiling I suspect the time is spent parsing rather than checking the numbers, so my next step will be the same parsing optimizations from [day 1](/posts/aoc2024/day1/)

But first, I tried simply shrinking the integer types, every individual number in the input fits in `u8`, and there are 1000 lines, so the sum fits in `u16`, these changes already net a decent improvement:
```
Day2 - Part1/naive      time:   [112.25 µs 112.37 µs 112.52 µs]
Day2 - Part2/naive      time:   [131.34 µs 132.13 µs 132.95 µs]
```
## Parsing Optimizations
Using a hand written parser and the fast integer parser I wrote in [day 1](/posts/aoc2024/day1/):
```rust
// gets an input to consume and a buffer to fill with the parsed numbers, and returns the remainder
// of the input
fn parse_line<'a>(mut input: &'a [u8], buffer: &mut Vec<u8>) -> &'a [u8] {
    while !input.is_empty() {
        let (num, remainder) = fast_parse::<u8>(input);
        buffer.push(num);
        // EOF
        if remainder.is_empty() {
            input = remainder;
            break;
        }
        // check linebreak before skipping whitespace
        if remainder[0] == b'\n' {
            input = &remainder[1..]; // skip whitespace
            break;
        }
        input = &remainder[1..]; // skip whitespace
    }
    input
}
```
The inputs not having a final linebreak at the end can be a real pain...  

Notice how I am not allocating a new vector, instead I am accepting a buffer to fill, this saves a lot of allocations.

Now using this parser in part 1:
```rust
pub fn part1_opt(mut input: &[u8]) -> u16 {
    let mut sum = 0u16;
    let mut buffer = Vec::<u8>::with_capacity(16);
    while !input.is_empty() {
        input = parse_line(input, &mut buffer);
        let direction = buffer[0] <= buffer[1];
        if buffer[0] != buffer[1]
            && buffer[0].abs_diff(buffer[1]) <= 3
            && check_line(&buffer[1..], direction)
        {
            sum += 1;
        }
        buffer.clear();
    }
    sum
}
```
The extra checks before check_line save comparing `buffer[0]` and `buffer[1]` again inside `check_line`(note that I am passing `&buffer[1..]`, skipping the first number).

And part 2:
```rust
pub fn part2_opt(mut input: &[u8]) -> u16 {
    let mut sum = 0u16;
    let mut buffer = Vec::<u8>::with_capacity(16);
    while !input.is_empty() {
        input = parse_line(input, &mut buffer);
        if check_line2(&buffer) {
            sum += 1;
        }
        buffer.clear();
    }
    sum
}
```
All the line checking logic from the naive solution was moved to `check_line2`.

These changes net a massive improvement:
```
Day2 - Part1/naive      time:   [112.25 µs 112.37 µs 112.52 µs]
Day2 - Part1/opt        time:   [26.598 µs 26.659 µs 26.729 µs]

Day2 - Part2/naive      time:   [131.34 µs 132.13 µs 132.95 µs]
Day2 - Part2/opt        time:   [47.190 µs 47.990 µs 48.785 µs]
```
As expected, most of the time was spent parsing.

> [!NOTE]
> Benchmarking part 1 without the single preallocation I get a time of ~40µs, significantly slower.

I attempted to use signed integers with a slightly different line checking, but the result was ~2µs slower:
```rust
fn check_pairi(a: i8, b: i8) -> bool {
    (a - b).signum() == 1 && a - b <= 3
}
fn check_linei(nums: &[i8]) -> bool {
    let diff = nums[0] - nums[1];
    match diff.signum() {
        1 => diff <= 3 && nums[1..].windows(2).all(|n| check_pairi(n[0], n[1])),
        -1 => diff >= -3 && nums[1..].windows(2).all(|n| check_pairi(n[1], n[0])),
        0 => false,
        _ => unreachable!(),
    }
}
```
So I'm sticking with the signed version.

Generating a [flamegraph](flamegraph_p1.svg) using `cargo-flamegraph`, I can see that parsing is still 67% of the time of part 1, so I kept optimizing that part.

## Part 1 - No Vectors Needed
When passing over data a single time, almost always an allocation is not needed and iteration suffices.  
After a lot of debugging, I managed to avoid creating the buffer completely in part 1:
```rust {linenos=inline}
pub fn part1_no_vec(mut input: &[u8]) -> u16 {
    let mut sum = 0u16;
    loop {
        let mut first: u8;
        let mut second: u8;
        (first, input) = fast_parse::<u8>(input);
        (second, input) = fast_parse::<u8>(&input[1..]);
        let direction = first <= second;
        // first pair check
        if first != second && first.abs_diff(second) <= 3 {
            loop {
                // step to next pair
                first = second;
                (second, input) = fast_parse::<u8>(&input[1..]);
                // number breaks rule, bad line
                if first == second || first.abs_diff(second) > 3 || (first <= second) != direction {
                    // skip to next line, or finish if EOF
                    let skip_index = input.iter().position(|&c| c == b'\n');
                    match skip_index {
                        // end of line, bad line
                        Some(i) => {
                            input = &input[i + 1..];
                            break;
                        }
                        // EOF, bad line
                        None => {
                            return sum;
                        }
                    }
                } else if input.is_empty() {
                    //EOF, good line
                    sum += 1;
                    return sum;
                } else if input[0] == b'\n' {
                    // End of line, good line
                    input = &input[1..];
                    sum += 1;
                    break;
                }
            }
        } else {
            // first pair failed, skip line
            let skip_index = input.iter().position(|&c| c == b'\n');
            match skip_index {
                // end of line, bad line
                Some(j) => {
                    input = &input[j + 1..];
                }
                // EOF, bad line
                None => {
                    return sum;
                } 
            }
        }
    }
}
```
This function is ugly but it works,  
The general idea is that it only keeps the last 2 read numbers and checks them:

- If they are not allowed, go to the next line(line 22)
- If they are not allowed and its the end of the file, return the answer(line 26)
- If they are allowed and its the end of the file, return the answer(line 30)
- If they are allowed and its the end of the line, go to the next line(line 34)
- Otherwise, loop again.

The repeated code to skip a line at the end is for the case where the first pair is already not allowed, so the line should be skipped.  
It could be cleaner, but it works.

And its a lot faster than before:
```
Day2 - Part1/opt        time:   [26.598 µs 26.659 µs 26.729 µs]
Day2 - Part1/no_vec     time:   [18.076 µs 18.178 µs 18.290 µs]
```

It is probably possible to avoid allocation in part 2, but it is a lot more complicated and quite possibly wont make it any faster, so I didn't do it, instead I optimised it to just not be brute force.

## Part 2 - Single Pass(kind of)
The original solution used brute force to find if a line is valid, at worst checking every line as many times as there are numbers in it.  
It is possible to decide if a line is valid with 1 pass, here's the general idea:

- Check for both increasing set and decreasing set, short circuiting will quickly stop the wrong direction instead of going through all the numbers twice.
- For each direction, read pairs until a bad pair is found, and then check if it is possible to remove one of them and continue with no more mistakes.
- No more mistakes simply means pairing between the number the numbers around the removed number, and then the rest using the original `check_line` from part 1.

```rust
fn check_line_allow_mistake(nums: &[u8], increasing: bool) -> bool {
    let mut prev_prev_num = 0u8;
    let mut prev_num = nums[0];
    for i in 1..nums.len() {
        let next_num = nums[i];
        let allowed = check_pair(prev_num, next_num, increasing);
        // mistake found, check "no mistakes allowed" with removing next or prev
        if !allowed {
            return (check_pair(prev_prev_num, next_num, increasing) // remove prev
                && check_line(&nums[i..], increasing))
                || (i < nums.len() - 1 // remove next
                    && check_pair(prev_num, nums[i + 1], increasing)
                    && check_line(&nums[i + 1..], increasing))
                || i == nums.len() - 1; // mistake at last number
        }
        prev_prev_num = prev_num;
        prev_num = next_num;
    }
    true // no mistakes found
}
// checks line for part 2, includes direction calculation
fn check_line_single_pass(nums: &[u8]) -> bool {
    check_line_allow_mistake(nums, true)
        || check_line_allow_mistake(nums, false)
        || check_line(&nums[1..], true) // edge case increasing+remove first
        || check_line(&nums[1..], false) // edge case decreasing+remove first
}
```
the part 2 function will be calling `check_line_single_pass` with the same parsed numbers vector.  
It may look like the entire vector is being read multiple times, but short-circuiting will always stop a wrong path within 1-2 pair checks.

And it is a little faster than the brute-force solution:
```
Day2 - Part2/opt         time:   [47.190 µs 47.990 µs 48.785 µs]
Day2 - Part2/single_pass time:   [43.260 µs 43.665 µs 44.226 µs]
```

### Final Touches - ArrayVec
Vector performance can often be improved by using an array on the stack, but using a basic array like that is cumbersome, fortunately, the `tinyvec` crate(and a couple other similar ones) offer vector-like structures that can be stored on the stack, and optionally, spill into the heap when the statically set size is exceeded.  
`ArrayVec` is a struct that never spills into the heap, it just panics when the capacity is exceeded, and that is fine in this case, it simply needs to be big enough for the longest line in the input(and maybe a little longer just in case).  
The only changes required are adding `tinyvec` to the project, and replacing `Vec`s in function signatures and variable creation:
```rust
let mut buffer = array_vec!([u8; 8]);
```
I applied it to all vectors in all solutions, but I'll only show the result for the final versions:
```
Day2 - Part1/no_vec      time:   [18.310 µs 18.373 µs 18.440 µs]
Day2 - Part2/single_pass time:   [40.617 µs 40.961 µs 41.281 µs]
```
part 1 didn't seem to improve, but part 2 improved by a few microseconds.

## End of Day 2
Another day done, I think the performance and the code readability could be a little better but I'll stop there.
```
