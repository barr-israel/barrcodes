---
publishDate: 2024-12-05
title: Day 5 - Print Queue
author: Barr
keywords: [Advent of Code, Rust]
description: Enforcing rules
summary: |
  Today's challenge involves first parsing a set of rules, and then checking which lines in the rest of the input matches the rules.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day5.rs
---
Each line in the first part of the input is made out of a pair of 2 digit numbers, for example: `47|53`, which represent a rule.  
In this example, it means that page 47 must be printed before page 53.  
In the second part of the input, each line is the order the pages will be printed, for example `75,47,61,53,29`

## Part 1 - First Attempt
For part 1, the result must be the sum of the middle number in all of the lines that don't break any rules.  
The example input is:
```
47|53
97|13
97|61
97|47
75|29
61|13
75|53
29|13
97|29
53|29
61|53
97|53
61|29
47|13
75|47
97|75
47|61
75|61
47|29
75|13
53|13

75,47,61,53,29
97,61,53,29,13
75,29,13
75,97,47,61,53
61,13,29
97,13,75,29,47
```
And the output for it is `61+53+29=143`.

My first step was writing a parser for the rules:
```rust
fn parse_rules(input: &[u8]) -> ([[bool; 100]; 100], &[u8]) {
    let mut rules = [[false; 100]; 100];
    let mut size = 0usize;
    input
        .array_chunks()
        .take_while(|line| line[0] != b'\n')
        .for_each(|line: &[u8; 6]| {
            // all numbers are 2 digits, easiest way to parse
            let first = (line[0] - b'0') * 10 + line[1] - b'0';
            let second = (line[3] - b'0') * 10 + line[4] - b'0';
            rules[first as usize][second as usize] = true;
            size += 1;
        });
    let remainder_index = size * 6 + 1;
    (rules, &input[remainder_index..])
}

```
Cell `(x,y)` in the rules is `true` when page `x` must be printed before page `y`.  
The next step is the checking of each line:
```rust
fn line_predicate(line: &[u8], rules: &[[bool; 100]; 100]) -> u8 {
    let mut seen = [false; 100];
    let line_valid = line.chunks(3).all(|chunk: &[u8]| {
        let num = (chunk[0] - b'0') * 10 + chunk[1] - b'0';
        // verify all rules of this number were not seen
        if rules[num as usize]
            .iter()
            .enumerate()
            .all(|(i, &required)| !(required && seen[i]))
        {
            seen[num as usize] = true;
            true
        } else {
            false
        }
    });
    if line_valid {
        // cant eliminate the 3s because of rounding
        let middle_num_start = line.len() / 3 / 2 * 3;
        (line[middle_num_start] - b'0') * 10 + line[middle_num_start + 1] - b'0'
    } else {
        0
    }
}
```
This algorithm reads each number in the line, and for each other number, verifies there is no rule that prevents it being after it while already seeing it before.  
And to run it on each line:
```rust
pub fn part1_first(input: &[u8]) -> u32 {
    let (rules, remainder) = parse_rules(input);
    remainder
        .split_inclusive(|&c| c == b'\n')
        .map(|line| line_predicate(line, &rules) as u32)
        .sum()
}
```
Doesn't look very efficient, but it solves part 1 and I'll improve it later.

## Part 2 - First Attempt
In part 2, every line that **does** break some rule, must return the middle number if the line was reordered to match all the rules.  
As far as I can tell every line has exactly one valid order.  
For this part, I wrote a new rules parser, that also gives a rules table of which pages must be before a given page(yes, it is simply a transposed copy of the original table).

Since only lines that break rules need to be considered, I first check that the line returns `0` from `line_predicate`:
```rust
pub fn part2_first(input: &[u8]) -> u32 {
    let (req, rev_req, remainder) = parse_rules_with_rev(input);
    remainder
        .split_inclusive(|&c| c == b'\n')
        .map(|line| {
            if line_predicate(line, &req) != 0 {
                0
            } else {
                line_fix(line, &rev_req) as u32
            }
        })
        .sum()
}
```
And then use `line_fix` to find the correct order:
```rust
fn line_fix(line: &[u8], rev_rules: &[[bool; 100]; 100]) -> u8 {
    let mut count = 0usize;
    let middle_count = line.len() / 6 + 1;
    let mut nums: Vec<u8> = line
        .chunks(3)
        .map(|chunk: &[u8]| (chunk[0] - b'0') * 10 + chunk[1] - b'0')
        .collect();
    loop {
        let to_insert = nums
            .iter()
            .position(|&first| {
                rev_rules[first as usize]
                    .iter()
                    .enumerate()
                    .all(|(second, &required)| !(required && nums.contains(&(second as u8))))
            })
            .unwrap();
        let num = nums.swap_remove(to_insert);
        count += 1;
        if count == middle_count {
            return num;
        }
    }
}
```
This function simply reads all the numbers, and one by one picks one that has no rules preventing it from being added to the correct order, such a rule would be one that says a number that is still in the `nums` vector must be before it.
A very inefficient algorithm.. But again, it solves part 2.

## Optimizations
Today I'll do most benchmarks with the CPU clock locked to `2.6Ghz` to prevent overheating and unstable clocks from interfering with the results, since they seemed to affect the results more today.  
The initial times are:
```
Day5 - Part1/first      time:   [134.32 µs 134.45 µs 134.59 µs]
Day5 - Part2/first      time:   [1.2939 ms 1.2953 ms 1.2969 ms]
```

I'll start with part 1:

### Different Data Structures
Reducing the size of the arrays to 90 and fixing indexes should help by up to 10%, but I'm going for a lot better.  
The obvious option is to replace inner array of the big `rules` grid with a vector, that way only rules that actually exist need to be checked.  
So now the type of `rules` is `[Vec<u8>;100]`.  
Aside from signature changes, the only code changes is pushing to the vector in the parser, and writing a new condition in `line_predicate`:
```rust
if rules[first as usize]
    .iter()
    .all(|&second| !seen[second as usize])
```
Now part 1 is a lot faster:
```
Day5 - Part1/first      time:   [135.12 µs 135.22 µs 135.34 µs]
Day5 - Part1/vec        time:   [54.234 µs 54.469 µs 54.819 µs]
```

What about other data structures? A `HashSet` can completely remove the iteration.  
While that is true, it is usually slower than simply iterating on small sizes.  
Testing it:
```rust

let mut seen = HashSet::<u8>::new();
..
if rules[first as usize].intersection(&seen).count() == 0 {
    seen.insert(first);
    true
} else {
    false
}
```
```
Day5 - Part1/set        time:   [264.32 µs 264.72 µs 265.15 µs]
```
A lot slower than even the original solution.

What about the stack allocated vectors from `tinyvec`? I'll start with an upper stack limit of 128, since that is the smallest supported size that can stay on the stack(`tinyvec` supports 0..=32 and powers of 2 up to 4,096), so it is even possible to use the panicking `ArrayVec`.  
Just a couple signature changes and the result it:
```
Day5 - Part1/vec        time:   [48.086 µs 48.525 µs 49.373 µs]
```
A little faster.  
I also tried setting the size to 64, which would panic if there was a page with more than 64 rules, but there wasn't a big difference, so I kept it at 128.  

## Oops, Bad Iteration
At this point I noticed I could make the first solution a lot better by saving the numbers I parsed in  a vector instead of a boolean array and iterating over them instead of the full 100 booleans in the rules:
```rust {hl_lines=[2,3,7,8]}
fn line_predicate(line: &[u8], rules: &[[bool; 100]; 100]) -> u8 {
    let num_count = line.len() / 3;
    let mut seen = ArrayVec::<[u8; 64]>::new();
    let line_valid = line.chunks(3).all(|chunk: &[u8]| {
        let num = (chunk[0] - b'0') * 10 + chunk[1] - b'0';
        // verify all rules of this number were not seen
        if seen.iter().all(|&s| !rules[num as usize][s as usize]) {
            seen.push(num);
            true
        } else {
            false
        }
    });
    if line_valid {
        let middle_num_start = num_count / 2 * 3;
        (line[middle_num_start] - b'0') * 10 + line[middle_num_start + 1] - b'0'
    } else {
        0
    }
}
```
And it beats every other solution:
```
Day5 - Part1/rewrite      time:   [26.750 µs 26.782 µs 26.815 µs]
```
The same change can't be applied to the vector solution as at least one of either the `rules` or `seen` has to be indexable to find a specific number, otherwise it will be back to a nested iteration again.

## Part 2 Optimizations
I originally applied the same type change from part 1 and it did improve the performance, and I also rewritten `line_fix` to use the normal `rules` and not the reverse version, but after rewriting part 1 I tried the same with part 2 and got even better results, this solution sorts of builds the line from back to front, looking for numbers that can be added to the end of the line without breaking any rules:
```rust
fn line_fix(line: &[u8], rules: &[[bool; 100]; 100]) -> u8 {
    let number_count = line.len() / 3;
    let middle_count = number_count / 2;
    let mut inserted = ArrayVec::<[u8; 64]>::new();
    let mut nums: Vec<u8> = line
        .chunks(3)
        .map(|chunk: &[u8]| (chunk[0] - b'0') * 10 + chunk[1] - b'0')
        .collect();
    loop {
        let to_insert = nums
            .iter()
            .position(|&first| {
                nums.iter()
                    .all(|&second| !rules[first as usize][second as usize])
            })
            .unwrap();
        let num = nums.swap_remove(to_insert);
        if inserted.len() == middle_count {
            return num;
        }
        {
            inserted.push(num);
        }
    }
}

```
Which runs in:
```
Day5 - Part2/rewrite    time:   [125.50 µs 125.91 µs 126.69 µs]
```
### Less Parsing
At the moment, both `line_predicate` and `line_fix` parse the bytes into numbers, while parsing once should be enough, I mainly did it this way since `line_predicate` was written for part 1 and does not need to keep the numbers around.  
So using a new `line_predicate2` and a little rewriting:
```rust
fn line_predicate2(numbers: &[u8], rules: &[[bool; 100]; 100]) -> bool {
    let mut seen = ArrayVec::<[u8; 64]>::new();
    numbers.iter().all(|&first| {
        // verify all rules of this number have been seen
        if seen
            .iter()
            .all(|&second| !rules[first as usize][second as usize])
        {
            seen.push(first);
            true
        } else {
            false
        }
    })
}

fn line_fix_preparsed(mut numbers: ArrayVec<[u8; 64]>, rules: &[[bool; 100]; 100]) -> u8 {
    let middle_count = numbers.len() / 2;
    let mut inserted = ArrayVec::<[u8; 64]>::new();
    loop {
        let to_insert = numbers
            .iter()
            .position(|&first| {
                numbers
                    .iter()
                    .all(|&second| !rules[first as usize][second as usize])
            })
            .unwrap();
        let num = numbers.swap_remove(to_insert);
        if inserted.len() == middle_count {
            return num;
        }
        {
            inserted.push(num);
        }
    }
}

pub fn part2_single_parse(input: &[u8]) -> u32 {
    let mut sum = 0u32;
    let (rules, mut remainder) = parse_rules(input);
    let mut numbers: ArrayVec<[u8; 64]> = ArrayVec::new();
    loop {
        match remainder.get(2) {
            Some(b',') => numbers.push((remainder[0] - b'0') * 10 + remainder[1] - b'0'),
            Some(b'\n') => {
                numbers.push((remainder[0] - b'0') * 10 + remainder[1] - b'0');
                if !line_predicate2(&numbers, &rules) {
                    sum += line_fix_preparsed(numbers, &rules) as u32
                }
                numbers.clear();
            }
            None => {
                numbers.push((remainder[0] - b'0') * 10 + remainder[1] - b'0');
                if !line_predicate2(&numbers, &rules) {
                    sum += line_fix_preparsed(numbers, &rules) as u32
                }
                return sum;
            }
            _ => unreachable!(),
        }
        remainder = &remainder[3..];
    }
}
```
This final version runs at:
```
Day5 - Part2/single_parse time:   [109.80 µs 109.94 µs 110.09 µs]
```

I then tried to apply the same structure to part 1:
```rust
#[aoc(day5, part1, rewrite2)]
pub fn part1_rewrite2(input: &[u8]) -> u32 {
    let mut sum = 0u32;
    let (rules, mut remainder) = parse_rules(input);
    let mut numbers: ArrayVec<[u8; 64]> = ArrayVec::new();
    loop {
        match remainder.get(2) {
            Some(b',') => numbers.push((remainder[0] - b'0') * 10 + remainder[1] - b'0'),
            Some(b'\n') => {
                numbers.push((remainder[0] - b'0') * 10 + remainder[1] - b'0');
                if line_predicate2(&numbers, &rules) {
                    sum += numbers[numbers.len() / 2] as u32;
                }
                numbers.clear();
            }
            None => {
                numbers.push((remainder[0] - b'0') * 10 + remainder[1] - b'0');
                if line_predicate2(&numbers, &rules) {
                    sum += numbers[numbers.len() / 2] as u32;
                }
                return sum;
            }
            _ => unreachable!(),
        }
        remainder = &remainder[3..];
    }
}
```
And surprisingly, its faster despite collecting the numbers:
```
Day5 - Part1/rewrite    time:   [26.261 µs 26.372 µs 26.519 µs]
Day5 - Part1/rewrite2   time:   [20.490 µs 20.509 µs 20.525 µs]
```
## Sorting
One idea I had early on and didn't try yet was sorting the numbers using standard sorting methods, I just need to implement an order function, shouldn't be hard.  
The new `line_predicate_sort` is a one liner:
```rust
fn line_predicate_sort(numbers: &[u8], rules: &[[bool; 100]; 100]) -> bool {
    numbers.is_sorted_by(|&x, &y| rules[x as usize][y as usize])
}
```
And the actual part one code is just using it instead of `line_predicate2`.
```
Day5 - Part1/sort       time:   [10.624 µs 10.641 µs 10.660 µs]
```
Wow, so fast.

Shouldn't be hard to apply to part 2 as well, just sorting it using the same compare function.  
The part 2 function looks the same except its using the new functions, and the new `line_fix_sort` is a little longer than `line_predicate_sort`:
```rust
fn line_fix_sort(mut numbers: ArrayVec<[u8; 64]>, rules: &[[bool; 100]; 100]) -> u8 {
    numbers.sort_unstable_by(|&x, &y| {
        if rules[x as usize][y as usize] {
            Ordering::Less
        } else {
            Ordering::Equal
        }
    });
    numbers[numbers.len() / 2]
}
```
I was a little worried when it warned me I should be implementing total order but it looks like the input is constrained enough to not cause an issue and the answer is still correct, and *very* fast:
```
Day5 - Part2/single_parse time:   [108.06 µs 108.24 µs 108.52 µs]
Day5 - Part2/sort         time:   [22.546 µs 22.576 µs 22.611 µs]
```

## Final Times
Unlocking the CPUs clock and trying to to hit a thermal throttle, the final times are:
```
Day5 - Part1/sort       time:   [7.0558 µs 7.0602 µs 7.0646 µs]
Day5 - Part2/sort       time:   [13.943 µs 13.966 µs 13.987 µs]
```
