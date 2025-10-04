---
publishDate: 2024-12-21
title: Day 21 - Keypad Conundrum
author: Barr
keywords: [Advent of Code, Rust]
description: A 121-armed match followed by 2 1000 lines long lookup table definitions.
summary: |
  The goal is simple: input a code into a numpad, using a robot, that is controlled by another robot, that is controlled by another robot...
github: https://github.com/barr-israel/aoc2024/blob/main/src/day21.rs
---
## Input
5 codes that need to be inputted into a numpad, for example:
```
029A
980A
179A
456A
379A
```

That's all, the hard part is getting the robot that is in front of the numpad to press the right buttons.  
## Part 1
The numpad looks like this:
```goat {width=150,height=200}
+---+---+---+
| 7 | 8 | 9 |
+---+---+---+
| 4 | 5 | 6 |
+---+---+---+
| 1 | 2 | 3 |
+---+---+---+
    | 0 | A |
    +---+---+
```
And the robot starts with its finger on the `A` button.  

Moving the robot is done using another keypad that looks like this:
```goat {width=200,height=150}
      +-----+-----+
      |     |     |
      |  ^  |  A  |
      |     |     |
+-----+-----+-----+
|     |     |     |
|  <  |  v  |  >  |
|     |     |     |
+-----+-----+-----+
```
Pressing an arrow key will move the finger in that direction, pressing `A` will make the robot press the key it is currently on.  

That keypad can only be pressed by *another* robot, which, like the first one, starts with its finger on the `A` button.

That robot is controlled by an identical keypad, which can only be pressed by yet another robot.

The keypad that controls *that* robot, can be pressed directly.

Each code's "complexity" is the minimum amount of inputs required to input it(on the final keypad that can be pressed directly), multiplied by the number in the code itself.

The output must be the sum of the complexities of all 5 codes.  

I started by a writing a function that for every start and end location for the finger of the outer-most robot(the one that can be controlled directly), returns the minimal button presses required for that movement:
```rust
pub const fn robot1(start: DirKeypad, end: DirKeypad) -> u8 {
    use DirKeypad::*;
    match (start, end) {
        (Up, Up) => 1,
        (Up, Down) => 2,
        (Up, Left) => 3,
        (Up, Right) => 3,
        (Up, A) => 2,
        (Down, Up) => 2,
        (Down, Down) => 1,
        (Down, Left) => 2,
        (Down, Right) => 2,
        (Down, A) => 3,
        (Left, Up) => 3,
        (Left, Down) => 2,
        (Left, Left) => 1,
        (Left, Right) => 3,
        (Left, A) => 4,
        (Right, Up) => 3,
        (Right, Down) => 2,
        (Right, Left) => 3,
        (Right, Right) => 1,
        (Right, A) => 2,
        (A, Up) => 2,
        (A, Down) => 3,
        (A, Left) => 4,
        (A, Right) => 2,
        (A, A) => 1,
    }
}
```

I made it `const`(and almost every other function), because I thought I would be able to use it for optimizations later.  
`DirKeypad` is a simple enum with the four directions and the `A` button.

Not so bad so far,  
Next, I used that function to create the minimal costs for the *next* robot:
```rust
pub const fn robot2(start: DirKeypad, end: DirKeypad) -> u8 {
    use DirKeypad::*;
    match (start, end) {
        (Up, Up) => robot1(A, A),
        (Up, Down) => robot1(A, Down) + robot1(Down, A),
        (Up, Left) => robot1(A, Down) + robot1(Down, Left) + robot1(Left, A),
        (Up, Right) => robot1(A, Right) + robot1(Right, Down) + robot1(Down, A),
        (Up, A) => robot1(A, Right) + robot1(Right, A),
        (Down, Up) => robot1(A, Up) + robot1(Up, A),
        (Down, Down) => robot1(A, A),
        (Down, Left) => robot1(A, Left) + robot1(Left, A),
        (Down, Right) => robot1(A, Right) + robot1(Right, A),
        (Down, A) => robot1(A, Up) + robot1(Up, Right) + robot1(Right, A),
        (Left, Up) => robot1(A, Right) + robot1(Right, Up) + robot1(Up, A),
        (Left, Down) => robot1(A, Right) + robot1(Right, A),
        (Left, Left) => robot1(A, A),
        (Left, Right) => robot1(A, Right) + robot1(Right, Right) + robot1(Right, A),
        (Left, A) => robot1(A, Right) + robot1(Right, Right) + robot1(Right, Up) + robot1(Up, A),
        (Right, Up) => robot1(A, Up) + robot1(Up, Left) + robot1(Left, A),
        (Right, Down) => robot1(A, Left) + robot1(Left, A),
        (Right, Left) => robot1(A, Left) + robot1(Left, Left) + robot1(Left, A),
        (Right, Right) => robot1(A, A),
        (Right, A) => robot1(A, Up) + robot1(Up, A),
        (A, Up) => robot1(A, Left) + robot1(Left, A),
        (A, Down) => robot1(A, Down) + robot1(Down, Left) + robot1(Left, A),
        (A, Left) => robot1(A, Down) + robot1(Down, Left) + robot1(Left, Left) + robot1(Left, A),
        (A, Right) => robot1(A, Down) + robot1(Down, A),
        (A, A) => robot1(A, A),
    }
}
```
Getting a little more complicated...

Next comes the monster I spent way too long writing, for every start and end position on the numpad, I return the minimum button presses, that match statement has ***121*** arms I wrote manually.  
Maybe if I knew how to write macros it would have been a little faster.  
For obvious reasons I will only show a portion of it:
```rust
const fn robot3(start: Numpad, end: Numpad) -> u8 {
    use DirKeypad::*;
    use Numpad as N;
    match (start, end) {
        (N::Zero, N::Zero) => robot2(A, A),
        (N::Zero, N::One) => robot2(A, Up) + robot2(Up, Left) + robot2(Left, A),
        (N::Zero, N::Two) => robot2(A, Up) + robot2(Up, A),
        (N::Zero, N::Three) => robot2(A, Up) + robot2(Up, Right) + robot2(Right, A),
        (N::Zero, N::Four) => robot2(A, Up) + robot2(Up, Up) + robot2(Up, Left) + robot2(Left, A),
        (N::Zero, N::Five) => robot2(A, Up) + robot2(Up, Up) + robot2(Up, A),
        (N::Zero, N::Six) => robot2(A, Up) + robot2(Up, Up) + robot2(Up, Right) + robot2(Right, A),
        ...
```
`Numpad` is another simple enum with the 10 digits and the `A` button

Finally, a function that takes 3 digits and calculates the minimal presses for the entire sequence:
```rust
pub fn code_to_amount(d1: Numpad, d2: Numpad, d3: Numpad) -> u64 {
    let mut sum = 0u64;
    sum +=robot3(Numpad::A, d1);
    sum +=robot3(d1, d2);
    sum +=robot3(d2, d3);
    sum +=robot3(d3, Numpad::A);
    sum
}
```
I knew none of this will directly used at the end, so I simply hard coded an output for my input, for the example input it would look like this:
```rust
let s = 29 * day21_cursed::code_to_amount(Zero, Two, Nine, 25)
    + 980 * day21_cursed::code_to_amount(Nine, Eight, Zero, 25)
    + 179 * day21_cursed::code_to_amount(One, Seven, Nine, 25)
    + 456 * day21_cursed::code_to_amount(Four, Five, Six, 25)
    + 379 * day21_cursed::code_to_amount(Three, Seven, Nine, 25);
println!("{s}");
```
Turns out some routes are better than others, it was obvious that in a sequence like `right-right-up`, keeping the `right` movements together will always be cheaper than something like `right-up-right`.  
I assumed that because the right and up buttons are closer to `A` than down, which is closer than left, that should be the order to use if possible, but turns out sometimes `left-left-up` is shorter than `up-left-left`.  
I don't have an explanation and I simply tried both ways for every pair in my inputs until I got to a minimum.  

Good enough for now.

## Part 2
Not very surprising: there are now **25** robots between the first keypad and the robot in front of the numpad.  
Instead of writing 24 more match statements, I wrote a function that creates a lookup table from the first robot, and uses it to create the lookup table for the next robot, and so on until the robot in front of the numpad.  

The table generation function looks like this:
```rust
pub fn generate_multirobot_table(robots: u8) -> [u64; 25] {
    let mut curr_table = [0u64; 25];
    for (i, v) in curr_table.iter_mut().enumerate() {
        *v = robot1(i2d(i / 5), i2d(i % 5)) as u64;
    }
    for _ in 1..robots {
        let mut next_table = [0u64; 25];
        for (i, v) in next_table.iter_mut().enumerate() {
            *v = robot_with_table(i2d(i / 5), i2d(i % 5), curr_table);
        }
        curr_table = next_table;
    }
    curr_table
}
```
`robot_with_table` is similar to `robot2` except all the calls to `robot1` have been replaced with lookups into `curr_table`.  
And instead of `robot3`, I now use this final table in a function called `numpad_robot_with_table`, which uses it instead of calling `robot2`.  
I managed to write a couple find and replace statements to fix the original functions.  
Now `code_to_amount` looks like this:
```rust
pub fn code_to_amount(d1: Numpad, d2: Numpad, d3: Numpad, robots: u8) -> u64 {
    let mut sum = 0u64;
    let table = generate_multirobot_table(robots);
    sum += numpad_robot_with_table(Numpad::A, d1, table);
    sum += numpad_robot_with_table(d1, d2, table);
    sum += numpad_robot_with_table(d2, d3, table);
    sum += numpad_robot_with_table(d3, Numpad::A, table);
    sum
}
```
And that's part 2 *almost* solved.

Turns out the shortest route can change when the amount of robots changes.  
Instead of more experimenting and finding minimums manually, I simple returned the minimum between each path that has 2 possible routes.  
Applying that fix only to `robot_with_table` was enough to pass part 2.

It is not ideal that each `code_to_amount` call regenerates the entire table, but that won't matter by the end of the optimizations.  

All of the code so far is inside the `day21_cursed.rs` file and will only be used to generate the code that will actually run in the final solution.

## Optimizations
Unlike every other day, today's input is fairly limited, there are only 1000 different codes.  
So I decided to do the following:

1. For every code, print to console `c_table[code]={ans}` where `ans` is the complexity of that code.
2. Take that output and put it in a massive *1000* lined constant expression to create a lookup table.
3. Write a function that for any number between 0-999 looks it up in the table.
4. Write the main function that will extract the 5 codes by directly reading the 15 relevant bytes, combining them to 5 numbers and looking up in the tables 5 times.

I'm printing all the results using this ugly loop:
```rust
for i1 in 0u64..10 {
    for i2 in 0u64..10 {
        for i3 in 0u64..10 {
            let num = i1 * 100 + i2 * 10 + i3;
            let n1 = day21_cursed::i2n(i1);
            let n2 = day21_cursed::i2n(i2);
            let n3 = day21_cursed::i2n(i3);
            let ans = num * code_to_amount(n1, n2, n3, 2);
            println!("c_table[{num}] = {ans};");
        }
    }
}
```
The lookup table looks like this:
```rust
pub fn part2_single_lookup(num: usize) -> u64 {
    const TABLE25: [u64; 1000] = {
        let mut c_table = [0u64; 1000];
        c_table[0] = 0;
        c_table[1] = 80883999266;
        c_table[2] = 128433097960;
        c_table[3] = 201892339872;
        ...
```
It is inside its own file called `day21_extra_cursed_25.rs`  
There is a separate lookup table for part 1 that uses only 2 robots.  
Once again I am wondering why I can't use loops in constant expressions.


And the main function looks like this:
```rust
#[aoc(day21, part2)]
pub fn part2_table(input: &[u8]) -> u64 {
    let num1 = (input[0] - b'0') as usize * 100
        + (input[1] - b'0') as usize * 10
        + (input[2] - b'0') as usize;
    let num2 = (input[5] - b'0') as usize * 100
        + (input[6] - b'0') as usize * 10
        + (input[7] - b'0') as usize;
    let num3 = (input[10] - b'0') as usize * 100
        + (input[11] - b'0') as usize * 10
        + (input[12] - b'0') as usize;
    let num4 = (input[15] - b'0') as usize * 100
        + (input[16] - b'0') as usize * 10
        + (input[17] - b'0') as usize;
    let num5 = (input[20] - b'0') as usize * 100
        + (input[21] - b'0') as usize * 10
        + (input[22] - b'0') as usize;
    day21_extra_cursed_25::part2_single_lookup(num1)
        + day21_extra_cursed_25::part2_single_lookup(num2)
        + day21_extra_cursed_25::part2_single_lookup(num3)
        + day21_extra_cursed_25::part2_single_lookup(num4)
        + day21_extra_cursed_25::part2_single_lookup(num5)
```

And now the actual runtime is 5 simple table lookups.

I did not fully benchmark the original version, using `hyperfine` I measured  around 350µs.

This version is by far the fastest in both parts between all days:
```
Day21 - Part1/(default) time:   [7.6939 ns 7.7111 ns 7.7284 ns]
Day21 - Part2/(default) time:   [7.6811 ns 7.6994 ns 7.7198 ns]
```
That's an `n`, for nanoseconds, not microseconds like most solution so far, it is 45000x faster than the original version, ignoring the fact `hyperfine` sometimes overestimates a little.
