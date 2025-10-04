---
publishDate: 2024-12-24
title: Day 24 - Crossed Wires
author: Barr
keywords: [Advent of Code, Rust]
description: Building a logic circuit
summary: |
  The elves monitoring device is malfunctioning, and as always, its my job to figure out what went wrong.
github: https://github.com/barr-israel/aoc2024/blob/main/src/day24.rs
---
## Input
The input begins with the state of the x registers and y registers like so:
```
x00: 1
x01: 1
x02: 1
y00: 0
y01: 1
y02: 0
```
The real input has 45 of each.

Next, comes a list of logic gates that save results into new registers, most notable, the z registers:
```
ntg XOR fgs -> mjb
y02 OR x01 -> tnw
kwq OR kpj -> z05
```
The order of the gates is irrelevant, each register will only be set once by a single gate, the available operators are `AND`,`OR`, and `XOR`.

## Part 1
What is the decimal representation of all the z registers together?

This solution is split to 3 parts:

- Parse initial x and y registers.
- Parse gates.
- Run gates recursively

### Parsing X and Y
I decided to store x,y and z as bits in a single `u64` for each of them.
Each line is the same length and the only byte that matters in each line is the bit itself, so the parsing is simple:
```rust
let mut x_reg = 0u64;
let mut y_reg = 0u64;
for i in 0usize..45 {
    let v = input[5 + i * 7];
    if v == b'1' {
        x_reg |= 1 << i
    }
}
for i in 0usize..45 {
    let v = input[5 + (i + 45) * 7];
    if v == b'1' {
        y_reg |= 1 << i
    }
}
```
Parsing the gates is more complicate, to represent them I decided to use the following structures:
```rust
#[derive(Clone, Copy, Debug)]
enum Pointer {
    X(u8),
    Y(u8),
    Z(u8),
    Mem(u32),
}
#[derive(Clone, Copy, Debug)]
enum Operator {
    And,
    Or,
    Xor,
}
#[derive(Clone, Copy, Debug)]
struct Gate {
    operand1: Pointer,
    operand2: Pointer,
    op: Operator,
}
```
Each gate applies one of the 3 operators between the 2 operands, that could be read from `X`,`Y` or `Mem`.  
Pointers to `Z` are used only as targets.


I created a "memory" array for all the intermediary values, these have 3 states: `true`, `false`, and not yet evaluated, which means the gate that writes to them needs to be evaluated.  
So each line that represent a gate is parsed into its 4 components, and gets added to the array at the location of the target operand, to be evaluated later.  
It is important to be able to replace the gates in the array with a concrete boolean value because the same value could be read multiple times, and without storing the result, I would need to reevaluate the gate.  

```rust
fn parse_operand(from: &[u8]) -> Pointer {
    match from[0] {
        b'x' => Pointer::X((from[1] - b'0') * 10 + from[2] - b'0'),
        b'y' => Pointer::Y((from[1] - b'0') * 10 + from[2] - b'0'),
        b'z' => Pointer::Z((from[1] - b'0') * 10 + from[2] - b'0'),
        _ => Pointer::Mem(
            (from[0] - b'a') as u32 * 26 * 26
                + (from[1] - b'a') as u32 * 26
                + (from[2] - b'1') as u32,
        ),
    }
}
fn parse_gates(mut remainder: &[u8]) -> ([Either<bool, Gate>; 26 * 26 * 26], [Gate; 64]) {
    let mut memory: [Either<bool, Gate>; 26 * 26 * 26] =
        [const { Either::Left(false) }; 26 * 26 * 26];
    let mut z_gates = [Gate {
        operand1: Pointer::X(0),
        operand2: Pointer::X(0),
        op: Operator::And,
    }; 64];
    loop {
        let operand1 = parse_operand(&remainder[..3]);
        let (op, skip) = match remainder[4] {
            b'A' => (Operator::And, 8),
            b'X' => (Operator::Xor, 8),
            b'O' => (Operator::Or, 7),
            _ => unreachable!("invalid operator"),
        };
        let operand2 = parse_operand(&remainder[skip..skip + 3]);
        let operand3 = parse_operand(&remainder[skip + 7..skip + 10]);
        let gate = Gate {
            op,
            operand1,
            operand2,
        };
        match operand3 {
            Pointer::Mem(m) => memory[m as usize] = Either::Right(gate),
            Pointer::Z(z) => z_gates[z as usize] = gate,
            _ => unreachable!("gate never writes to x,y"),
        }
        remainder = &remainder[skip + 10..];
        if remainder.is_empty() {
            return (memory, z_gates);
        }
        remainder = &remainder[1..];
    }
}
```

Next, the evaluation function takes some gate and evaluates it.  
If one of the operators is an unevaluated gate, it needs to be evaluated as well, so the function gets called recursively.
```rust
fn obtain_value(
    p: Pointer,
    x_reg: u64,
    y_reg: u64,
    memory: &mut [Either<bool, Gate>; 26 * 26 * 26],
) -> bool {
    match p {
        Pointer::X(x) => (x_reg & 1 << x) != 0,
        Pointer::Y(y) => (y_reg & 1 << y) != 0,
        Pointer::Z(_) => unreachable!("Z never src"),
        Pointer::Mem(m) => match memory[m as usize] {
            Either::Left(b) => b,
            Either::Right(g) => {
                // unevaluated gate, evaluate recursively and update result
                let v = compute_gate(&g, x_reg, y_reg, memory);
                memory[m as usize] = Either::Left(v);
                v
            }
        },
    }
}
fn compute_gate(
    gate: &Gate,
    x_reg: u64,
    y_reg: u64,
    memory: &mut [Either<bool, Gate>; 26 * 26 * 26],
) -> bool {
    let v1 = obtain_value(gate.operand1, x_reg, y_reg, memory);
    let v2 = obtain_value(gate.operand2, x_reg, y_reg, memory);
    match gate.op {
        Operator::And => v1 && v2,
        Operator::Or => v1 || v2,
        Operator::Xor => v1 ^ v2,
    }
}
```
And finally, the outer function that calls this `compute_gate` function with every gate that writes to a `z` register:
```rust
#[aoc(day24, part1)]
pub fn part1_first(input: &[u8]) -> u64 {
    let (x_reg, y_reg, mut memory, z_gates) = parse_input(input);
    let mut z_reg = 0u64;
    for (i, gate) in z_gates.into_iter().enumerate() {
        if compute_gate(&gate, x_reg, y_reg, &mut memory) {
            z_reg |= 1 << i;
        }
    }
    z_reg
}

```

### Performance
The run time of part 1 is:
```
Day24 - Part1/(default) time:   [36.428 µs 36.518 µs 36.627 µs]
```

## Part 2
Turns out this circuit is supposed to be an adder, `z` is meant to be the result of `x+y`, but something went wrong, exactly 4 pairs of outputs have been swapped between gates.  
The goal is finding the 4 pairs and return their name in alphabetical order.

I don't know how to solve this automatically for every input but here is how I solved it for my input:  

1. I converted the gate parsing function to a function that builds a [petgraph](https://docs.rs/petgraph/latest/petgraph/) graph.
2. I printed out that graph(`petgraph` can only output graphs in text form in the .dot format) and inserted it into [vis.js](https://viz-js.com/) to get [this graph](graph.svg).
3. I looked over the graph manually looking for mistakes.

The graph building function looks like this:
```rust
fn gates2graph(mut remainder: &[u8]) -> Graph<&str, &str> {
    let mut graph = Graph::<&str, &str>::new();
    let mut nodes: FxHashMap<&str, _> = Default::default();
    loop {
        let operand1 = core::str::from_utf8(&remainder[..3]).unwrap();
        let skip = match remainder[4] {
            b'A' => 8,
            b'X' => 8,
            b'O' => 7,
            _ => unreachable!("invalid operator"),
        };
        let n1 = *nodes
            .entry(operand1)
            .or_insert_with(|| graph.add_node(operand1));
        let op_node = graph.add_node(core::str::from_utf8(&remainder[4..skip]).unwrap());
        let operand2 = core::str::from_utf8(&remainder[skip..skip + 3]).unwrap();
        let n2 = *nodes
            .entry(operand2)
            .or_insert_with(|| graph.add_node(operand2));
        let operand3 = core::str::from_utf8(&remainder[skip + 7..skip + 10]).unwrap();
        let n3 = *nodes
            .entry(operand3)
            .or_insert_with(|| graph.add_node(operand3));
        graph.extend_with_edges(&[(n1, op_node), (n2, op_node), (op_node, n3)]);
        remainder = &remainder[skip + 10..];
        if remainder.is_empty() {
            return graph;
        }
        remainder = &remainder[1..];
    }
}
```
Most of the original code from `parse_gates` has been replaced.

Turns out this circuit is specifically a [Ripple-carry adder](https://en.wikipedia.org/wiki/Adder_(electronics)), one of the simpler adder designs, it contains a repeating pattern of:

- `AND` and `XOR` are applied to a pair of input bits(one from x, one from y)
- If the result of `AND` is true, it means there is a carry to the next pattern(the next pair)
- If the result of `XOR` is true and there is a carry from the previous pattern, it also means there is a carry.
- If and only if there is either a carry from the previous pattern, or `XOR` is true, but not both(this is another `XOR`) the current output bit is 1(otherwise 0).

Additionally, the mistakes in this case were always 2 nearby gates that had swapped outputs, for example the `AND` and `XOR` from the inputs, or the 2 gates that output a bit and pass a carry forward.  
This made it less visually apparent where the mistakes are but I found them after a few minutes of manually going through the graph.

There isn't really a performance metric to speak of this time.  
According to the benchmark, generating the graph takes ~23µs, and including printing it out, it takes ~2.5ms, the rest is all manual, and I simply hard coded the return value after finding the answer.
