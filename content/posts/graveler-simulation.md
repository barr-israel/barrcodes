---
publishDate: 2024-11-21
title: Exploding Pokemon As Fast As Possible
author: Barr
keywords: [Rust, CUDA, Pokemon, Random Number Generation]
description: Answering ShoddyCast's challenge by simulating 1 billion battles in less than a second using Rust, and later, less than 10ms using CUDA.
summary: In this post I will answer [ShoddyCast](https://www.youtube.com/@ShoddyCast)'s challange and simulate Pokemon battles looking for an extremely rare sequence of results that can save a theoretical game save from a softlock using Rust, and later, also CUDA.
github: https://github.com/barr-israel/graveler-sim
---
## Background
  In Pokemon, it is sometimes possible to "softlock" the game, meaning putting it in a state that is impossible to progress through the main story, but the game is otherwise still functional.  
In some cases, the softlock is not actually impossible, but simply so hard/time consuming to fix, that it is significantly easier to simply reset the game.  
These are the sort of scenarios the YouTube channel [Pikasprey Yellow](https://www.youtube.com/@Pikasprey) explores in his videos.  
Today I will focus on one video in particular, [Graveler's Unlikely Escape](https://www.youtube.com/watch?v=GgMl4PrdQeo), which has inspired [a video by ShoddyCast](https://www.youtube.com/watch?v=M8C8dHQE2Ro).  
I will not go into all the little details of the softlock, but the root of the issue boils down to:

- The only Pokemon the player has is a single Graveler
- This Graveler only has 2 non-damaging moves and the moves explosion and selfdestruct, which makes the Graveler feint.
- There is a single trainer blocking the way to the rest of the game.
- The only way to beat the trainer is to:
  1. Getting the Graveler paralyzed by a Paras  
  2. Spending the 54 non-damaging moves  
  3. Losing Graveler's turn to paralysis 177 times in a row in order for the enemy Pokemon to knock themselves out without the Graveler making itself feint.

### The Challenge
ShoddyCast has attempted to simulate 1 billion battles by rolling a number between 1 and 4 231 times for each battle.  
His solution was written in [Python](https://github.com/arhourigan/graveler/blob/main/graveler.py), and not a very fast python solution either, so it took about 8 and a half days to run.  
Understanding 8 and a half days is not an impressive amount of time, he challenged his viewers to create a faster simulation, which is where I come in.

### Ignoring The Real Cartridge
Before I begin, I want to mention that simply rolling random numbers does not mirror that actual possible results in a real game, that has its own Pseudo-RNG algorithm, which in reality, cannot ever roll a sequence of turns that will save the Graveler.  
This challenge ignores this behaviour and its goal is to simply roll a number between 1 and 4, 231 times per battle, for 1 billion battles, and return the biggest amount of lost turns.

Now it's time to write some code:

## The Naive Solution - Sub 10 Minutes
Before minimizing runtime, its easy to minimize coding time, using Rust's iterators and the `rand` crate, a basic working solution is:
```rust
fn roll(rng: &mut ThreadRng) -> usize {
    (0..231).filter(|_| rng.next_u32() % 4 == 0).count()
}
fn main(){
  let mut rng = rand::thread_rng();
  let best = (0..1_000_000_000).map(|_| roll(&mut rng)).max().unwrap();
  println!("{best}");
}
```
Which gets me a runtime of 7-8 minutes, already orders of magnitude faster than the ShoddyCast solution, but nowhere near as fast as it can go, so I am not going to properly benchmark it beyond running it through `time`.

## Being Wise With Bits - Sub 1 Minute
Brief explanation for bitwise operations:  
If we have 2 `u8` numbers, let's say 7 and 10, we can apply a bitwise AND(`&`) between them to apply the logical AND operation to each of their bits:  
```
7  = 0b00000111
&      &&&&&&&&
10 = 0b00001010
=      ========
2  = 0b00000010
```

For this problem, AND is the only bitwise operation needed.  
Like other basic operators, bitwise operators are a single CPU instruction, so they are very fast and very useful.  
Now how do I use these to make the code faster?  
The naive roll simply generated a `u32`, and checked for the remainder when divided by 4, usually remainder and division are slow but for power of 2 they are optimized to bitwise operations, in this case, `x % 4` optimizes to `x & 3`, meaning "keep only the last 2 bits".  
Which means, I am rolling 32 bits, using the last 2, and throwing away the other 30, not very efficient.

To utilise bitwise operations for this problem, it is useful to notice 1 statistical property:  
Rolling 2 numbers between 0 and 1 twice and returning 1 if both are 0, has the same statistical distribution as rolling a number between 0 and 3 and returning 1 if it is 0(both represent a Bernoulli trial with a chance of 0.25).  
So if I had 2 random bits, I can apply AND between them, and get 0 25% of the time, simulating a single turn.  
Next, if I have a pair of 231 bit numbers, I can apply AND between them, and get the result of 231 turns at once.  
In reality, we don't have 231 bit numbers(usually), we have powers of 2, like 32, 64, and 128.  
`rand` can only roll `u32` and `u64`, so for now, I will use 4 64 bit numbers for each set.  
That gets me 256 turns! Too many for this problem, but this is not an issue, using another AND operation, I can simply force the last 25 bits to always be 0.
```rust
const MASK: u64 = !((1 << 25) - 1); // !((1 << C) - 1) is a known trick to easily get a mask that keeps the rightmost C bits
let r1 = rng.next_u64() & rng.next_u64();
let r2 = rng.next_u64() & rng.next_u64();
let r3 = rng.next_u64() & rng.next_u64();
let r4 = rng.next_u64() & rng.next_u64() & MASK;
```
Now I need to somehow count those bits, fortunately, counting the amount of ones or zeroes in a binary number is important enough to have its own CPU instruction, with a function that uses it in many languages, including rust, so the roll function now looks like this:
```rust
const MASK: u64 = !((1 << 25) - 1);
fn roll(rng: &mut ThreadRng) -> u32 {
    let r1 = (rng.next_u64() & rng.next_u64()).count_ones();
    let r2 = (rng.next_u64() & rng.next_u64()).count_ones();
    let r3 = (rng.next_u64() & rng.next_u64()).count_ones();
    let r4 = (rng.next_u64() & rng.next_u64() & MASK).count_ones();
    r1 + r2 + r3 + r4
}
```
And the performance improvement speaks for itself: this program runs in **~40s** on my laptop, over a 10x improvement from the naive solution.

## Benchmarking
40 seconds is still quite a while, but its just enough to start benchmarking.  
I like using [hyperfine](https://github.com/sharkdp/hyperfine) for most of my benchmarks, it is not as fine grained and configurable as [criterion](https://github.com/bheisler/criterion.rs) and [divan](https://github.com/nvzqz/divan), but it is a lot simpler to use and does what I need most of the time, kind of a supercharged `time`.  
Running `hyperfine ./target/release/graveler` gives an output that looks like this:
```
Benchmark 1: target/release/graveler
  Time (mean ± σ):     40.986 s ±  1.040 s    [User: 40.572 s, System: 0.266 s]
  Range (min … max):   39.837 s … 43.665 s    10 runs
```
The important part is that the current solution takes ~41 seconds to run, this will be helpful when comparing to future solutions.  
Note: all but the final benchmark will be ran on my laptop, using an i7-10750H CPU.

## Free Gains - Sub 10 Seconds
Sometimes there are small changes that don't change the algorithm itself but still improve performance significantly, I'll start by using 2 of them:

### Compilation Settings
The easiest gain to make is to simply apply more performance oriented compilation settings.  
By default `--release` already applies a few, but it can go further.  
I like adding this [profile](https://doc.rust-lang.org/cargo/reference/profiles.html) to my `Cargo.toml`:
```toml
[profile.max]
inherits = "release" # start from the release defaults
panic = "abort" # abort on panic instead of unwind, removes unwinding codepaths
codegen-units = 1 # do not split into "code generation units", a little faster code at the cost of parallel codegen
lto = true # enable "Fat" Link-Time-Optimization, allows optimization to work across linked source files
```
and use the `RUSTFLAGS='-C target-cpu=native` environment variable, which allows to compiler to target *my* CPU, instead of a generic one that doesn't have all the modern CPU extensions.

> [!WARNING]
> Generally, `native` is not recommended when publishing the output because the resulting executable is only guaranteed to be able to run on a CPU that has at least every extension available on the CPU used to compile. Targeting [x86-64-v2/3/4](https://en.wikipedia.org/wiki/X86-64#Microarchitecturelevels) is more universal, if going beyond the default `generic` at all.

### Faster Random Number Generation
Generating random numbers can take a while, depending on the algorithm used, every algorithm targets different things: performance, security, statistical accuracy, etc.  
The goal here is performance, so I first replaced `rand` with `fastrand`, which implements the `wyrand` algorithm.  
Swapping between the crates is as simple as replacing the function calls in-place, `fastrand` doesn't even require us to hand over a generated seed, it creates a thread-local one on its own:
```rust
fn roll() -> u32 {
    let r1 = (fastrand::u64(..) & fastrand::u64(..)).count_ones();
    let r2 = (fastrand::u64(..) & fastrand::u64(..)).count_ones();
    let r3 = (fastrand::u64(..) & fastrand::u64(..)).count_ones();
    let r4 = (fastrand::u64(..) & fastrand::u64(..) & MASK).count_ones();
    r1 + r2 + r3 + r4
}
```
So comparing the old solution with these changes using hyperfine, the results are:

| Version  | Average Time |
|----------|--------------|
| Original | 40.986s      |
| fastrand | 11.552s      |
| profile  | 35.526s      |
| both     | 6.848s       |

The random number generation took a significant amount of the time before, and there is a massive improvement from using a faster implementation.

## SIMD Is Fast
Modern CPUs have access to SIMD(Single Instruction Multiple Data) instructions, that can operate on multiple numbers at the same time with a single instruction, and fortunately, the `simd_rand` crate has implementations for various PRNG algorithms that utilise these instructions.  
For the highest performance, while ignoring minor statistical downsides, I picked the [xorshiro256plus](https://prng.di.unimi.it/) algorithm.  
The new roll function looks like this:
```rust
fn roll(rng: &mut Xoshiro256PlusX4) -> u32 { // Xoshiro256PlusX4 is the state struct for this method
    let roll = rng.next_u64x4();
    let roll2 = rng.next_u64x4();
    let res = roll & roll2;
    res[0].count_ones() + res[1].count_ones() + res[2].count_ones() + (res[3] & MASK).count_ones()
}
```
When starting to use code that utilises SIMD, it is important to have the required instructions available to the compiler, meaning having the right target-cpu/target-feature set, which is another reason to only measure the performance using the same settings as `both` from the last section.  
With the new crate, `hyperfine` reports a time of **3.119s**, another massive leap in performance.

### Even Bigger SIMDs
`simd_rand` can generate up to a `u64x8` SIMD, which means 512 bits per roll.  
Only CPUs with the AVX512 instruction set can actually perform operations directly on such big SIMDs, but on other CPUs these operations are simply converted to multiple smaller SIMD instructions.  
My laptop does not have AVX512 so I don't expect a very noticeable improvement, but it will be useful when testing on a different CPU later.
Since I only need 231 bits, I can actually fit 2 rolls for every 2 sets I generate:
```rust
fn double_roll(rng: &mut Xoshiro256PlusX8) -> u32 {
    let roll = rng.next_u64x8();
    let roll2 = rng.next_u64x8();
    // if both bits are 1, that roll is a 1 out of 4
    let res = roll & roll2;
    // res contains 2 sets of 256 bits, split the sets and mask the 25 bits we don't want
    u32::max(
        res[0].count_ones()
            + res[1].count_ones()
            + res[2].count_ones()
            + (res[3] & MASK).count_ones(),
        res[4].count_ones()
            + res[5].count_ones()
            + res[6].count_ones()
            + (res[7] & MASK).count_ones(),
    )
}
```
And now I only need to call this function 500 million times, and not 1 billion times.  
The new time is **2.886s**, an appreciable improvement.

This is as far as I got with a single thread, now it's time to use next tool: ***more threads***

## More Threads - Sub 1 Second
My i7-10750H has 6 cores and 12 threads, so one would imagine I can achieve another 12x improvement, but that is not accurate.  
Because these calculations are 100% compute and have no memory access, hyper-threading is expected to suffer, but 6x is still theoretically within grasp and would be very nice to achieve.  
Thanks to [rayon](https://docs.rs/rayon/latest/rayon/), multithreading in Rust is a breeze.  
In many cases all I need to do is add the crate, and turn the iterator to a parallel one(add `.into_par_iter()` before the `.map`).  
But in this case the mutable state struct `rng` poses an issue to be solved.

But first..

### The Need For More Accuracy
Since every change so far had a big effect on performance, the setup used until now was sufficient, but when looking for more minor differences there are a few more things that help improve benchmark stability:

- Locking the CPU to its base clock prevents random clock boosts from affecting the results, this can reduce the deviation of the runs significantly, especially when the boosts cause thermal throttling.
- Warmup runs put the CPU in a higher power state(unless locked) and causes the program to be cached, making the first real runs more accurate. In some languages, it also causes code to be JIT compiled during the warmup, making the actual runs only run the optimized version instead of a mix that also includes the compilation time.
- Running the program more times means more numbers to work with, giving a more accurate average.

In this case I've seen the standard deviation go down from 5-6% to sometimes as low as 0.5~1%.  
For these reasons, all benchmarks until the final one will use 10 warm-up rounds, 50 real runs, and the CPU will be locked to its base 2.6GHz.  
For comparison, the last single-threaded version takes **4.6s** under these conditions.

### The Solution
There needs to be a state for each thread separately, one option is to use a thread-local variable the roll function can access:
```rust
thread_local! {
    static STATE: RefCell<Xoshiro256PlusX8> = RefCell::new({ let mut seed: Xoshiro256PlusX8Seed = Default::default(); rand::thread_rng().fill_bytes(&mut *seed); Xoshiro256PlusX8::from_seed(seed) })
}
fn double_roll() -> u32 {
    let roll = STATE.with_borrow_mut(|state| state.next_u64x8());
    let roll2 = STATE.with_borrow_mut(|state| state.next_u64x8());
```
The time for this first multi-threaded solution is **985ms**

With the way `rayon` works, in this case there are 1 billion tasks split into the work queues of all the threads, and when each thread finishes a task, it gets another task from the queue, and makes sure it wasn't "stolen" by another thread before executing it.  
This is a useful model but too complicated for this problem and adds overhead.

The first improvement was to only call a few functions in parallel, as many as the threads I want to use, and have each function perform (500 million / threads) iterations.
```rust
fn thread_roll() -> u8 {
    // seeding the generator
    let mut seed: Xoshiro256PlusX8Seed = Default::default();
    rand::thread_rng().fill_bytes(&mut *seed);
    let mut rng = Xoshiro256PlusX8::from_seed(seed);
    (0..((1_000_000_000 / 2) / rayon::current_num_threads()) + 1)
        .map(|_| double_roll(&mut rng))
        .max()
        .unwrap() as u8
}
fn par_roll() -> u8 {
    (0..rayon::current_num_threads())
        .into_par_iter()
        .map(|_| thread_roll())
        .max()
        .unwrap()
}
```
I added +1 to the roll count to account for truncation, in the worst case each thread simulates 1 more battles than needed, another solution can add 1 only to some of the threads, to get exactly 1 billion.

Actually, `rayon` is not even needed anymore, it can be removed from the project completely and replaced with `std::thread`(`thread_roll` was modified to get the amount to roll as a parameter):
```rust
    let thread_count: u32 = thread::available_parallelism().unwrap().get() as u32;
    let per_thread: u32 = 500_000_000 / thread_count + 1;
    let threads: Vec<thread::JoinHandle<u8>> = (1..thread_count)
        .map(|_| thread::spawn(move || thread_roll(per_thread)))
        .collect();
    let local_result = thread_roll(per_thread);
    threads
        .into_iter()
        .map(|t| t.join().unwrap())
        .max()
        .unwrap_or(0) // for the single thread case
        .max(local_result)
```
`local_result` makes use of the main thread instead of spawning one more and waiting for the rest to finish.  
In this case I am not concerned about the order the threads finish because they are all expected to take the same time.  
To find the ideal number of threads, I ran it with different amounts of threads.

| Thread Count | Time    | Speedup compared to 1 | Speedup / threads |
|--------------|---------|-----------------------|-------------------|
| 1            | 4.575s  | 1x                    | 1                 |
| 2            | 2.293s  | 1.995x                | 0.9976            |
| 4            | 1.173s  | 3.9x                  | 0.975             |
| 6            | 866.6ms | 5.279x                | 0.8799            |
| 8            | 904.8ms | 5.056x                | 0.632             |
| 10           | 880.1ms | 5.198x                | 0.5198            |
| 12           | 815.4ms | 5.611x                | 0.4676            |

The `Speedup / threads` column helps measure at what point does the algorithm stop scaling as well.
From these results, it looks like going for more than 6 threads hardly helps, and sometimes even hurts the performance.
Even with 6 threads the scaling was not as good as expected, only 5.279x and not 6x.

## The End Of The Line For CPU
Running the 1/half threads/all threads version with no clock locking on both my laptop, and a borrowed Ryzen 9 7950X3D(16 cores 32 threads), here are the final results for this solution:

| CPU                               | Single Thread | Half Threads | All Threads |
|-----------------------------------|---------------|--------------|-------------|
| i7-10750H 6 Cores 12 Threads      | 2.78s         | 512ms        | 531ms       |
| Ryzen 7950X3D 16 Cores 32 Threads | 1.78s         | 134ms        | 117ms       |

Getting close to sub 100ms, but not quite there.  
Fortunately, this is not the end of the challenge just yet, while I could not go faster on a CPU, I can go a lot faster on a device built for massively parallel computation: a GPU.

## Enter The GPU - Sub 100 Milliseconds

### CUDA 101
Sorry Rust, your GPU game is not quite there yet.  
My laptop is equipped with an Nvidia RTX 2070 Max-Q GPU, not particularly strong, but it will get the work done for now.  
Computationally heavy GPU code is often written in CUDA, a C++ like language that is compiled for Nvidia GPUs specifically as "kernel"s, and those kernels are usually called from normal C/C++ code.
In CUDA, each kernel runs in a grid, each made out of blocks.  
Kernel code looks like a normal function, but it is ran at the same time by all the thread.

### Boilerplate
Setting up CUDA and the various variables needed to use it has a lot of boilerplate:
```c++
#define BLOCKSIZE 1024
int main() {
  int *d_grid_max;
  int deviceId;
  cudaDeviceProp prop;
  cudaEvent_t start, stop;
  cudaEventCreate(&start);
  cudaEventCreate(&stop);
  cudaEventRecord(start);
  cudaGetDevice(&deviceId);
  cudaGetDeviceProperties(&prop, deviceId);
  int sm_count = prop.multiProcessorCount;
  int block_per_sm = 0;
  cudaOccupancyMaxActiveBlocksPerMultiprocessor(&block_per_sm, rng, BLOCKSIZE, 0);
  int block_count = sm_count * block_per_sm;
  cudaMallocManaged(&d_grid_max, block_count*sizeof(int));
  rng<<<block_count, BLOCKSIZE>>>(d_grid_max, 42);
  cudaDeviceSynchronize();
  float t = 0;
  int global_max = d_grid_max[0];
  for (int i = 1; i < block_count; i++) {
    global_max = max(global_max, d_grid_max[i]);
  }
  cudaEventRecord(stop);
  cudaEventSynchronize(stop);
  std::cout << "Max: " << global_max << '\n';
  cudaEventElapsedTime(&t, start, stop);
  std::cout << "kernel ran in " << t << "\n";
  cudaFree(d_grid_max);
  return 0;
}
```
This code will run on the CPU, and call the kernel on the GPU.
The important things to note in this function are that I am creating an array `d_grid_max` that will hold the max value found in each block that runs, and after the kernel finishes running, I pick the max from that array on the CPU.  
The kernel is expected to simulate the 1 billion battles, split across all the threads, and write into each entry in `d_grid_max` the maximum value generated in each block.  
The `42` passed into the kernel is simply a seed to start the PRNG inside the kernel.  
Now it's time to write the code that will actually run on the GPU.  

### The Kernel
I first tried writing `xorshiro256plus` in CUDA and using a state for each thread, but it turns out the built-in and simple `curand` is a lot faster, so I will not show the `xorshiro256plus` code.  
The first step in a kernel is usually self-identification:  
Each thread has local variables for the block ID within all the blocks running the kernel, the thread ID within all the threads in the same block, and the size of the block.  
Both of these are 3 dimensional, meaning one can set x,y, and z dimensions. But this is not useful in this case.  
So I start the kernel by having the thread figure out its index:
```c++
unsigned int index = threadIdx.x + blockIdx.x * blockDim.x;
```
Next is a little more setup, notably, an array shared within the block to save the per-thread max(normal variables are thread-local):
```c++
  __shared__ unsigned char max_block_arr[BLOCKSIZE];
  curandState state;
  curand_init(seed + index, 0, 0, &state);
  long runs = 1000000000UL / (blockDim.x * gridDim.x) + 1; // +1 to make up for truncation
  int max_t = 0;
```
Next is the actual simulation loop, `curand` generates 32 bit integers, so the code is a little different:
```c++
  for (int i = 0; i <= runs; i++) {
    int count = 0;
    count += __popc(curand(&state) & curand(&state));        // 32
    count += __popc(curand(&state) & curand(&state));        // 64
    count += __popc(curand(&state) & curand(&state));        // 96
    count += __popc(curand(&state) & curand(&state));        // 128
    count += __popc(curand(&state) & curand(&state));        // 160
    count += __popc(curand(&state) & curand(&state));        // 192
    count += __popc(curand(&state) & curand(&state));        // 224
    count += __popc(curand(&state) & curand(&state) & MASK); // 231
    max_t = max(max_t, count);
  }
  max_thread_arr[threadIdx.x] = max_t;
```

(`__popc` is the CUDA equivalent of `count_ones`)  
And finally, 1 thread within the block will pick the maximum for the block(I will improve this later):
```c++
__syncthreads();
  if (threadIdx.x == 0) {
    for (int i = 1; i <= BLOCKSIZE; i++) {
      max_t = max(max_t, max_thread_arr[i]);
    }
  }
  max_block_arr[blockIdx.x] = max_t;
```

`__syncthreads` is required to ensure that all the threads finished writing their own max into `max_thread_arr`.
And that's the entire kernel, the CPU will wait for it to finish(`cudaDeviceSynchronize()`) and continue to find the max from `max_block_arr`.  

### First CUDA benchmark
CUDA benchmarking is a little more complicated than CPU benchmarking:

- There is a measurable, and in this case, significant, set up time when starting a CUDA program.
- CUDA is more sensitive to warm-up than the code I ran earlier.

For those reasons, I will mostly benchmark the code using CUDA specific timing, already visible in the boilerplate from earlier, but in my benchmark I added 50 warmup runs and 1000 real runs inside the main function.
```c++
  // warm-up
  for (int i = 0; i < 50; i++) {
    rng<<<block_count, BLOCKSIZE>>>(d_grid_max, time(nullptr));
    cudaDeviceSynchronize();
    global_max = d_grid_max[0];
    for (int i = 1; i < block_count; i++) {
      global_max = max(global_max, d_grid_max[i]);
    }
    black_box += global_max;
  }
  cudaEventRecord(start);
  for (int i = 0; i < 1000; i++) {
    rng<<<block_count, BLOCKSIZE>>>(d_grid_max, time(nullptr));
    cudaDeviceSynchronize();
    global_max = d_grid_max[0];
    for (int i = 1; i < block_count; i++) {
      global_max = max(global_max, d_grid_max[i]);
    }
    black_box += global_max;
  }
  cudaEventRecord(stop);
```
black_box is printed later, it is simply there to make sure compiler optimizations don't remove the entire loop.

And the results are an average of **33.07ms** per kernel run.

### Kernel Improvements
There are a couple optimizations I applied to the kernel:

#### Less Rolls Means Less Work
Because I am working with 32 bit integers, I implemented a new little trick that was not viable with bigger sized integers:  
7 pairs of rolls give 448 bits, that combine to 224 turns, meaning I need 7 more turns, made out of 14 bits.  
1 more roll is 32 bits, enough to fill the missing bits for 2 simulations.  
This means that with 29 integer rolls, 2 simulations can be generated(instead of the previous 32 rolls).  
It's not a huge difference, at best I'll get a ~10% improvement(~10% less rolls).  
So now the loop body looks like this(also reduced the loop count to 500 million):
```c++
    int count1 = 0;
    count1 += __popc(curand(&state) & curand(&state)); // 32
    count1 += __popc(curand(&state) & curand(&state)); // 64
    count1 += __popc(curand(&state) & curand(&state)); // 96
    count1 += __popc(curand(&state) & curand(&state)); // 128
    count1 += __popc(curand(&state) & curand(&state)); // 160
    count1 += __popc(curand(&state) & curand(&state)); // 192
    count1 += __popc(curand(&state) & curand(&state)); // 224
    int count2 = 0;
    count2 += __popc(curand(&state) & curand(&state)); // 32
    count2 += __popc(curand(&state) & curand(&state)); // 64
    count2 += __popc(curand(&state) & curand(&state)); // 96
    count2 += __popc(curand(&state) & curand(&state)); // 128
    count2 += __popc(curand(&state) & curand(&state)); // 160
    count2 += __popc(curand(&state) & curand(&state)); // 192
    count2 += __popc(curand(&state) & curand(&state)); // 224
    unsigned int final_set = curand(&state);
    count1 += __popc(final_set & final_set << 7 & MASK);        // 231
    count2 += __popc(final_set << 14 & final_set << 21 & MASK); // 231
    max_t = max(max_t, max(count1, count2));
```
This optimization reduces the time to **31.85ms**, only 4% lower than before, a small but measurable improvement.

#### Warp-Level Reduction
The current solution puts all the work if summarizing the block on one thread, while the others are doing nothing, 
Warp-Level Reduction is a method that uses "Warp-Level" primitives to make use of all the blocks in the thread. I will make use of one very useful primitive: ` __shfl_down_sync`(I'm just going to call it "shuffle").  
This shuffle primitive fetches a local variable from another thread inside the same warp, the specific thread is chosen using an offset:
```c++
  __syncwarp();
  // intra-warp reduction
  max_t = max(max_t, __shfl_down_sync(0xFFFFFFFF, max_t, 16));
  max_t = max(max_t, __shfl_down_sync(0xFFFFFFFF, max_t, 8));
  max_t = max(max_t, __shfl_down_sync(0xFFFFFFFF, max_t, 4));
  max_t = max(max_t, __shfl_down_sync(0xFFFFFFFF, max_t, 2));
  max_t = max(max_t, __shfl_down_sync(0xFFFFFFFF, max_t, 1));
```
`__syncwarp` is the same as `__syncthreads` but only needs to sync threads within the same warp.  
A warp is a group of 32 threads that start execution together, but more importantly, allow us to easily move variables between them.  
Lets break down one of these calls: `__shfl_down_sync(0xFFFFFFFF, max_t,16)`  
`0xFFFFFFFF` means all the threads within the warp will participate in the shuffle.  
`max_t` means the `max_t` variable will be transferred.  
`16` means each thread will get the variable from the thread 16 places after it.
If an offset puts it outside the 32 threads, the retrieved value is undefined, but it doesn't matter for the use cases of this primitive.  
After the first line, the first thread contains the max between it and thread #17, thread 2 contains the max between it and thread #18 and so on until thread #16, the contents of thread #17 are undefined.  
The next line does the same, but combined threads 1-16 into threads 1-8.  
This continues until the max of the entire warp is in thread 1.  
There is a useful image from NVIDIA that shows this process:  
![warp-reduction](https://developer-blogs.nvidia.com/wp-content/uploads/2018/01/reduce_shfl_down-625x275.png)  
But this only summarizes each warp, next I need to summarizes all the warps together:  
First I need to put the result of each warp in shared memory, but now the shared memory can be made smaller:
```c++
  unsigned int warpIdx = threadIdx.x / WARPSIZE;
  unsigned int index_in_warp = threadIdx.x % WARPSIZE;
  __shared__ unsigned char max_warp_arr[WARPSIZE]; // replaces max_block_arr
  ...
  <Warp-Level Reduction>
  if (index_in_warp == 0) {
    max_warp_arr[warpIdx] = max_t;
  }
```
And finally, I used another Warp-Level Reduction within the first warp to find the max within the entire block:
```c++
  __syncthreads();
  if (warpIdx == 0) { // reduce all other warps in the block to one value
    unsigned char max_block = max_warp_arr[index_in_warp];
    max_block = max(max_block, __shfl_down_sync(0xFFFFFFFF, max_block, 16));
    max_block = max(max_block, __shfl_down_sync(0xFFFFFFFF, max_block, 8));
    max_block = max(max_block, __shfl_down_sync(0xFFFFFFFF, max_block, 4));
    max_block = max(max_block, __shfl_down_sync(0xFFFFFFFF, max_block, 2));
    max_block = max(max_block, __shfl_down_sync(0xFFFFFFFF, max_block, 1));
    max_block_arr[blockIdx.x] = max_block;
  }
```
I replaced a few thousand operations in 1 thread with ~20 operations across all of them, but compared to the ~1 million random numbers each thread generates, I don't expect a measurable difference.  
The new time is 31.51ms, to make sure I ran it a couple more times and got 31.99ms and 31.75ms, So I'll just consider it statistically insignificant, nevertheless, it was interesting to learn the proper way to reduce within a block.

### The Secret Time Sink
All this time I showed the CUDA timings of the kernels, they only included the time it took for the GPU to generate all the random numbers and find the maximum.  
As I explained earlier, this is not the full picture.  
Running the basic 1 run version in hyperfine I get a time of **109.7ms**!  
Even accounting for not having the warm up(the basic version reports ~40ms for kernel run), where is all this time coming from?
Using a tool called `nvprof` that comes included with the CUDA compiler, I can see another 55ms going to `cudaEventCreate`:
```
            Type  Time(%)      Time  Name
 GPU activities:  100.00%  41.459ms  rng(int*, int)
      API calls:   46.54%  55.093ms  cudaEventCreate
                   35.03%  41.465ms  cudaDeviceSynchron
```
At first, it might seem weird that such a basic function takes most of the time of the program. But in reality, it's not the function that takes all that time, it is the initialization of the CUDA runtime, no matter what CUDA call comes first, it will take a lot of time.  
What is the real time that should be measured? The depends on what the goal of the measurement is, in my case, the goal is simply to get a smaller number, and I have no control over the initialization overhead, so I'm taking the kernel time.  
Additionally, if I scaled the program to a bigger amount of battles, the overhead will remain the same size and disappear within the rest of the runtime.

## Bigger GPU Means Lower Time - Sub 10 Milliseconds
One final benchmark, this time with the added comparison with a borrowed Desktop RTX 4080:

| GPU                   | Average |
|-----------------------|---------|
| RTX 2070 Mobile Max-Q | 31.51ms |
| RTX 4080              | 6.36ms  |

Sometimes the best optimization is just throwing more money at the problem.

## Summary
Optimizing code is a lot of fun, and I'm pretty satisfied with the results I achieved and the things I learned.  
The final version of the solutions is available on my [GitHub](https://github.com/barr-israel/graveler-sim) (the CUDA code is in the cuda directory)

