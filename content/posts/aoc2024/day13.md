---
publishDate: 2024-12-13
title: Day 13 - Claw Contraption
author: Barr
keywords: [Advent of Code, Rust]
description: Math disguised as dynamic programming, you're not getting me this time AoC.
summary: |
  Today's challenge describes a set of claw machines that are controlled by 2 buttons, and the goal is to win as many prizes as possible with as little money as possible.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day13.rs
math: true
---
## Input

The A and B buttons each move the claw a certain distance in the X and Y direction(each moves in both directions).  
Each machine is defined in the following format:

```
Button A: X+94, Y+34
Button B: X+22, Y+67
Prize: X=8400, Y=5400
```

With an empty line between machines.  
The prize is won if the claw is navigated to the prize coordinates, which is not possible in every machine.

## Part 1

The goal is to return the minimum cost to win as many prizes as possible, when pressing A costs 3 and pressing B costs 1, there's a hint that buttons should not be pressed more than 100 times.

This may look like a dynamic programming challenge, but in reality, this is just basic math, each machine is a set of 2 equations:

$$
A*A_x+B*B_x=X\\
A*A_y+B*B_y=Y
$$

Which could be solved by hand or with an online solver like [WolframAlpha](https://www.wolframalpha.com/input?i=x1*A%2Bx2*B%3DX%2Cy1*A%2By2*B%3DY%2C+solve+for+A%2CB).  
The solution to the system is:

$$
A=\frac{B_x*Y-X*B_y}{B_x*A_y-A_x*B_y} \\
B=\frac{A_x*Y-X*A_y}{A_x*B_y-B_x*A_y}
$$
This type of system has either 0, 1 or infinite solutions.  
The infinite case is impossible with $A_x,A_y,B_x,B_y$ all positive(which is the case in the full input), so it's either no solutions when the divisor is 0, or 1 solution otherwise.  
So all the talk about a "minimum cost" was just a misdirection to make it seem like a harder problem than it is.  

With a little reordering to reuse the divisor, I converted it to the following `Rust` function:

```rust
fn find_cost(a_x: i32, a_y: i32, b_x: i32, b_y: i32, x: i32, y: i32) -> Option<i32> {
    let divisor = a_x * b_y - b_x * a_y;
    if divisor == 0 {
        return None;
    }
    let a_presses_numerator = x * b_y - b_x * y;
    let b_presses_numerator = a_x * y - x * a_y;
    if a_presses_numerator % divisor == 0 && b_presses_numerator % divisor == 0 {
        Some(a_presses_numerator / divisor * 3 + b_presses_numerator / divisor)
    } else {
        None
    }
}
```

Now all that's left is to parse the input and sum up the cost from all the solvable machines:

```rust
fn process_machine(input: &[u8]) -> (Option<i32>, &[u8]) {
    let a_x = ((input[12] - b'0') * 10 + (input[13] - b'0')) as i32;
    let a_y = ((input[18] - b'0') * 10 + (input[19] - b'0')) as i32;
    let b_x = ((input[33] - b'0') * 10 + (input[34] - b'0')) as i32;
    let b_y = ((input[39] - b'0') * 10 + (input[40] - b'0')) as i32;
    let (x, remainder) = fast_parse(&input[51..]);
    let (y, remainder) = fast_parse(&remainder[4..]);
    let next_machine = if remainder.is_empty() {
        remainder
    } else {
        &remainder[2..]
    };
    (find_cost(a_x, a_y, b_x, b_y, x, y), next_machine)
}

#[aoc(day13, part1, equation)]
pub fn part1_equation(mut input: &[u8]) -> i32 {
    let mut sum = 0;
    while !input.is_empty() {
        let (machine_result, remainder) = process_machine(input);
        if let Some(price) = machine_result {
            sum += price;
        }
        input = remainder
    }
    sum
}
```

I have a suspicion part 2 is going to change some number to be a lot bigger to make a non-math solution unfeasible.

## Part 2

My suspicion was right, now all the X and Y values needs to be increased by 10,000,000,000,000 after parsing them, the same example input I showed should be parsed as:

```
Button A: X+94, Y+34
Button B: X+22, Y+67
Prize: X=10000000008400, Y=10000000005400
```

Fortunately, I didn't fall for it this time, all I need to do is add this big value to my X and Y values, and change various types to `i64` instead of `i32` to hold the bigger values I'm working with:

```rust {hl_lines=[1,"14-22",28]}
fn find_cost64(a_x: i64, a_y: i64, b_x: i64, b_y: i64, x: i64, y: i64) -> Option<i64> {
    let divisor = a_x * b_y - b_x * a_y;
    if divisor == 0 {
        return None;
    }
  let a_presses_numerator = x * b_y - b_x * y;
  let b_presses_numerator = a_x * y - x * a_y;
    if a_presses_numerator % divisor == 0 && b_presses_numerator % divisor == 0 {
        Some(a_presses_numerator / divisor * 3 + b_presses_numerator / divisor)
    } else {
        None
    }
}
fn process_machine_far(input: &[u8]) -> (Option<i64>, &[u8]) {
    let a_x = ((input[12] - b'0') * 10 + (input[13] - b'0')) as i64;
    let a_y = ((input[18] - b'0') * 10 + (input[19] - b'0')) as i64;
    let b_x = ((input[33] - b'0') * 10 + (input[34] - b'0')) as i64;
    let b_y = ((input[39] - b'0') * 10 + (input[40] - b'0')) as i64;
    let (x, remainder) = fast_parse::<i32>(&input[51..]);
    let (y, remainder) = fast_parse::<i32>(&remainder[4..]);
    let far_x = x as i64 + 10000000000000;
    let far_y = y as i64 + 10000000000000;
    let next_machine = if remainder.is_empty() {
        remainder
    } else {
        &remainder[2..]
    };
    (find_cost64(a_x, a_y, b_x, b_y, far_x, far_y), next_machine)
}
```

And that's all, the easiest part 2 so far.

## Performance

There really isn't anything to optimize here, all I'm doing is parsing a couple lines, with 4 out of the 6 numbers at a static location, and doing a little math.  
According to `perf`, 64% of the time spent in part 2 is on 2 specific `idivq` instructions, these instructions do signed division on 64/128 bit integers, a fairly expensive instruction.  
Almost all the remaining time is spent parsing.  

> [!NOTE]
> The `idivq`(and other integer division instructions) instruction calculates and stores both the quotient and the reminder.  
> So the compiler can use a single instruction to get both values when some piece of code contains both `a/b` and `a%b`, so only a single division is done in these cases.

32 bit division is cheaper so despite only changing types, there is a pretty big difference in the performance of the 2 parts:

```
Day13 - Part1/equation  time:   [4.9378 µs 4.9709 µs 5.0269 µs]
Day13 - Part2/equation  time:   [7.2932 µs 7.3537 µs 7.4291 µs]
```

Turns out the `divisor == 0` check is true only when the 2 buttons send the claw in the same direction, which doesn't actually happen in my input, and might be designed to never happen in any input.  
I tried removing the check and it did not affect the performance, I'm assuming because the CPU predicted it perfectly(because it was always false in my input), so I'll just leave it there in case there is an input that makes it true.

> [!NOTE] Branch Prediction
> CPUs work in a [pipelined](https://en.wikipedia.org/wiki/Instruction_pipelining) model, meaning multiple instructions are getting executed at the same time, each at a different stage of execution.  
> Because of that, the CPU can't simply wait for the instruction that evaluates the condition to branch, so it uses [branch prediction](https://en.wikipedia.org/wiki/Branch_predictor).  
> The branch predictor inside the CPU just *guesses* what the next instruction should be, and continues executing from there until the condition is evaluated.  
> If the guess was correct, all is well and the CPU continues working at full speed.  
> If the guess was wrong, it must "flush" all the work it did since making the wrong guess and start over from the correct instruction, this leads to a few cycles being wasted.  
>
> Modern branch predictors are very complex(and keep getting more complex and advanced with every CPU generation) and can detect various patterns in each branch in the program in order to maximize the correct prediction rate.
>
> In this case, a branch that always evaluates the same way is *very* easy to predict, so it has barely any cost.
