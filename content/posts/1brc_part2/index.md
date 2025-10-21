---
publishDate: 2025-11-01
title: The One Billion Row Challange Part 2 - Using Multithreading To Go Sub Second
author: Barr
keywords: [Rust, 1BRC, Performance, Optimization, Parallelism]
description: Improving on my solution for the one billion row challange from part 1 by using multiple threads and AVX512.
summary: |
  ["The One Billion Row Challenge"](https://github.com/gunnarmorling/1brc) is a programming challenge orignally written for Java, where the goal is to summarize a billion rows of temprature measurements as fast as possible. In part 1, I maximized the performance of solving this challenge for a single thread, and in this part I will incorporate multithreading and a new system with many more cores and AVX512 support to go even faster.
github: https://github.com/barr-israel/1brc
---

## The Starting Point And Making A Plan

My [best single threaded solution](/posts/1brc_part1/#final-single-threaded-results) completes 6.18 seconds on my laptop using a single thread(8 seconds with the CPU locked to 3.5GHz for stable benchmarks).  
Despite the entire optimization journey in part 1, the general flow remains the same:

1. For every line of text:
    1. Split the line into station name and measurement.
    1. Parse the measurement.
    1. Update the current summary to include the new measurement.
1. Sort the summary by station name.
1. Print the results.

The best way to incorporate parallelism into this flow would be to split the entire text into chunks, so each chunk can be read and processed concurrently, and the measurements read from each chunks must still be summarized into the same final output.

Splitting the text is not as simple as dividing the length by the amount of chunks we want and setting the index there, because splitting in the middle of a line will make parsing it impossible.  
That means that we must only split at the end of lines. This can be done by looking around the split location we computed and adjusting it to the next/previous line break.

Additionally, combining the results also needs some consideration:  
One option is to share the hash map containing the information gathered so far between all the threads, which means there must be some synchronization in the access to them, either via a simple lock wrapping the hash map, or using a different hash map built specifically for concurrent access.  
Alternatively, each thread can maintain its own hash map, and we would need to combine all the hash maps after all the text has been processed. This solution eliminates all synchronization during the processing.
I predict the latter will be the faster option by far, but I will test both.

## Benchmarking Methodology

My methodology in this part is unchanged from [part 1](/posts/1brc_part1/#benchmarking-methodology), except that we need to stop restricting the program to a specific core.  
So unless stated otherwise, the benchmarks shown will run on the same specs as shown in part 1, with the CPU frequency locked to 3.5GHz.  
With the CPU frequency locked to 3.5GHz, the best single threaded run time was 8.33 seconds.


## Splitting The Text

Splitting the text involves picking some "ideal" splitting point and then adjusting it to be at a line break.  
Additionally, each chunk needs 32 extra bytes to avoid undefined behaviour in `read_line`.  
I decided to do the splitting on the main thread and not in each thread because the amount of time spent splitting is immeasurably small and it is a simpler to do.  
If I split on each thread individually, each thread would need to compute both of its edges since it can't rely on already knowing the end of the previous chunk.  
So my solution to give each thread the correct chunk looks like this:  

```rust
    std::thread::scope(|scope| {
        for _ in 0..thread_count - 1 {
            let chunk_end = memrchr(b'\n', &remainder[..ideal_chunk_size]).unwrap();
            let chunk: &[u8] = &remainder[..chunk_end + 33];
            remainder = &remainder[chunk_end + 1..];
            scope.spawn(|| process_chunk(chunk, &summary));
        }
        process_chunk(remainder, &summary);
    });
```

`process_chunk` contains the main loop from the single threaded solution.  

Since the main thread doesn't have anything else to do while the rest are processing, I let it process the last chunk.

`thread_count` is obtained from a simple command line argument:
```rust
  let thread_count: usize = std::env::args()
      .nth(1)
      .expect("missing thread count")
      .parse()
      .expect("invalid thread count");
```

Now I can get to actually parallelising the work.

## Simple Mutex

My first parallel solution was written only to verify the splitting works correctly, so I kept it simple and wrapped `summary` hash map with a Mutex:

```rust {hl_lines=[1,8,9]}
fn process_chunk(chunk: &[u8], summary: &Mutex<FxHashMap<StationName, (i32, i32, i32, i32)>>) {
    let mut remainder = chunk;
    while (remainder.len() - 32) != 0 {
        let station_name: StationName;
        let measurement: i32;
        (remainder, station_name, measurement) = unsafe { read_line(remainder) };
        summary
            .lock()
            .unwrap()
        ...
    }
}
```
I also had to mark the pointer inside `StationName` as `Send`, because we know every thread has access to the text that the pointer points to, but the compiler does not know that:
```rust
unsafe impl Send for StationName {}
```

Because the hash map is constantly accessed I already expected it to be far slower, but I measured it with different amounts of threads anyway.  

This time I only ran each once since they take so long getting an accurate measurement is not important.  

| Threads  | 1    | 2  | 4   | 6   |
| -------- | ---- | -- | --- | --- |
| Time (s) | 15.6 | 72 | 121 | 193 |

Clearly, in this case more cores do not mean better performance.  
Looking at a profile of the program, even with a single thread, the added locking and unlocking of the mutex takes **60%** of the time, and with more threads it gets even worse, taking 90% with 2 threads and 96% with 4.  

## DashMap

`DashMap` is a Rust crate that provides a concurrent hash map and it utilizes sharding to achieve that.  

### Sharding

The way `DashMap` works, is that it contains many smaller single threaded hash maps called shards, each wrapped by a `RWLock`.  
When trying to access a key in the `DashMap`, it determines the relevant shard and only locks it and not other shards.  
That means that if 2 or more threads are trying to access different keys that are stored in different shards, they can do so concurrently.  
Additionally, the hash calculation is done before any lock is acquired, which makes the critical section even smaller.  
When working with locks, the critical section that is guarded by a lock generally can't be improved by adding more threads, so it is important to make it as small as possible.  

### Using DashMap

`DashMap` was specifically designed to provide a very similar API to the standard hash map, so the only changes needed are: replacing the type with `DashMap`, remove the calls to lock that we added in the previous section, and make `StationName` also `Sync`.

And the results are significantly better, but still not beating the single threaded performance:  

| Threads  | 1    | 2    | 4    | 6    | 8    | 10   | 12   | 14   | 16   |
| -------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Time (s) | 14.4 | 17.8 | 13.7 | 11.7 | 10.6 | 10.3 | 9.9  | 11.1 | 12.6 |

Next, I am going back to single threaded maps to actually achieve higher performance.

#### Heterogeneous CPUs

One major downside of the very simple method of splitting the text I used, is that all the chunks are effectively equal in size.  
This would be fine if the cores were also equal in performance, but this CPUs is equipped with both performance and efficiency cores.  
More specifically, it is equipped with 6 performance cores with higher boost frequencies capable of hyper-threading, and 10 performance cores with lower boost frequencies and no hyper-threading.  
At the moment all the cores are running at the same frequency so the performance difference is much smaller, but the final time is still limited by the single thread that takes the most time to finish its chunk.  
I will ignore this problem for now, as a more dynamic splitting that accounts for faster threads is more complicated and requires more synchronization overhead.  
Additionally, later I will switch to a different system where all of the cores are equal, minimizing this issue further.


## Back To Single Threaded Hash Maps

Concurrent hash maps are useful when the different worker threads actually care what the other threads put in the hash map, but that is not the case here.  
For this challenge, every thread can work on its own, generating its own summary without any synchronization with other threads.  
That will result in generating a summary per thread, each containing at most a few hundred stations.  
Then, the main thread can combine these summaries relatively cheaply and produce the final result.  

Combining the different hash maps looks very similar to how they were built to begin with, except the count is increased by the amount of time that station was seen, and not just by 1:

```rust
fn merge_summaries(
    summary: &mut FxHashMap<StationName, StationEntry>,
    partial_summary: FxHashMap<StationName, StationEntry>,
) {
    partial_summary
        .into_iter()
        .for_each(|(station_name, partial_entry)| {
            summary
                .entry(station_name)
                .and_modify(|entry| {
                    if partial_entry.min < entry.min {
                        entry.min = partial_entry.min;
                    }
                    if partial_entry.max > entry.max {
                        entry.max = partial_entry.max;
                    }
                    entry.sum += partial_entry.sum;
                    entry.count += partial_entry.count;
                })
                .or_insert(partial_entry);
        });
}
```

So all the main thread needs to do is take the hash map from every other thread and combine it with its own hash map:  
```rust {hl_lines=[1,6,9,10,11]}
let mut threads = Vec::with_capacity(thread_count);
for _ in 0..thread_count - 1 {
    let chunk_end = memrchr(b'\n', &remainder[..ideal_chunk_size]).unwrap();
    let chunk: &[u8] = &remainder[..chunk_end + 33];
    remainder = &remainder[chunk_end + 1..];
    threads.push(scope.spawn(|| process_chunk(chunk)));
}
let mut summary = process_chunk(remainder);
for t in threads {
    merge_summaries(&mut summary, t.join().unwrap());
}
```

And as expected, this solution works much better(these *were* measured with `hyperfine`):

| Threads  | 1    | 2     | 4    | 6    | 8    | 10   | 12   | 14   | 16   | 18   | 20   | 22   |
| -------- | ---- | ----- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Time (s) | 8.02 | 4.06  | 2.12 | 1.46 | 1.44 | 1.25 | 1.10 | 1.01 | 0.96 | 0.89 | 0.86 | 0.88 |

And we finally crossed the 1 second barrier!  
I considered rewriting the `merge_summaries` function to reuse the same hash instead of computing every hash twice, but the entire function does not even register on the profile, so there is no reason to do it.

Looking at the run times we got, we can see that the performance is equal to the single threaded performance with 1 thread, which means no overhead was added.  
Additionally, the performance scaled almost perfectly up to 6 threads and then the scaling started to slow down. This matches with the fact that this laptop has exactly 6 performance cores.

And with the CPU frequency unlocked it gets much faster at lower thread counts and very slightly faster at higher thread counts:

| Threads  | 1    | 2    | 4    | 6    | 8    | 10   | 12   | 14   | 16   | 18   | 20   | 22   |
| -------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Time (s) | 6.02 | 3.15 | 1.78 | 1.30 | 1.30 | 1.13 | 1.02 | 0.95 | 0.91 | 0.86 | 0.84 | 0.83 |

Again, the slower efficiency cores do not gain a lot from the uncapped frequency, and they are slowing down the total run time.  
In addition to the unequal cores that are used when using more threads, this can also be explained by looking at the power usage and frequencies of the CPU, it appears that past 6 threads the frequencies get throttled by missing power, as the power usage hits 41W and doesn't rise further no matter how many threads participate.

## Splitting The Work More Efficiently

The easiest way to split up the work in a way that doesn't slow us down to the performance of the slowest thread, is to split it into many more chunks, and letting each thread process chunks whenever they are ready.  
That means that faster threads will end up processing more chunks compared to slower threads, but that they will end up finishing at roughly the same time.

To make it easy to distribute the work, I used the `rayon` crate, which is the most popular package for concurrent programming in Rust.

Incorporating `rayon` into the existing code include mostly replacing thread creation with turning the chunks into an iterator and giving the iterator to `rayon` to parallelize:
```rust
// use_rayon.rs
rayon::ThreadPoolBuilder::new()
    .num_threads(thread_count)
    .build_global()
    .unwrap();
let chunks_mult = 16;
let chunks = thread_count * chunks_mult;
let ideal_chunk_size = mapped_file.len() / chunks;
let mut remainder = mapped_file;
let summary: FxHashMap<StationName, StationEntry> = (0..chunks)
    .map(|_| {
        let chunk_end = memrchr(b'\n', &remainder[..ideal_chunk_size]).unwrap();
        let chunk: &[u8] = &remainder[..chunk_end + 33];
        remainder = &remainder[chunk_end + 1..];
        chunk
    })
    .par_bridge()
    .map(process_chunk)
    .reduce(
        FxHashMap::<StationName, StationEntry>::default,
        merge_summaries,
    );
```

Now, instead of creating exactly as many chunks as we have threads, I am creating `chunks_mul` chunks per thread.  
I choose to use 16 for a balance between a high chunk size creating unequal thread run times, and a low chunk size adding overhead.  
In general, the less predictable the run time is, the more a higher granularity(amount of chunks) will help balance the work.

And now, benchmarking it again(still with unlocked frequencies):

| Threads  | 1    | 2    | 4    | 6    | 8    | 10   | 12   | 14   | 16   | 18   | 20   | 22   |
| -------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Time (s) | 6.05 | 3.20 | 1.78 | 1.30 | 1.14 | 1.02 | 0.94 | 0.86 | 0.84 | 0.81 | 0.78 | 0.77 |

It appears that there is a small overhead added, which slightly slows down the program with 1 or 2 threads.  
With 8 or more threads is when the gains from having a higher granularity appear, as all of the results are faster than before.

So the final run time on this system by utilizing multithreading is 0.77 seconds.

This is as far as I go on *this* system, but I now have access to a more powerful system to experiment with.

## Better Hardware For Better Performance

The new system is equipped with 2 Xeon Gold 5420+ CPUs.  
Each of these CPUs has 28 cores capable of hyper-threading, for a total of 112 threads.  
These CPUs also support the AVX512 extension.  
I also do not expect to run into power and heat issues this time.  
Unfortunately, there are also a couple downsides:  
The new CPUs are clocked lower, at a 2.0 GHz base and 4.1 GHz turbo frequency, and they are built on the older Intel 7 process, compared to the higher clocks and Intel 4 used for the system I used so far.  
That means that the single threaded performance will likely be slower, but with so many cores I expect the multi-threaded performance to far outweigh these downsides.

The cores on these CPUs are also equal to each other, which means there will a much smaller difference in the time taken to process each chunk and the benefit from switching to `rayon` will shrink.

First, I wanted to check the performance of the single threaded solution(`final_single_thread.rs`) on the new system:
```bash
Time (mean ± σ):     10.752 s ±  0.018 s    [User: 10.168 s, System: 0.583 s]
Range (min … max):   10.729 s … 10.787 s    10 runs
```

As expected, the single threaded performance is much worse now.

And now for multi-threaded benchmarks.

### Benchmarking Many Times

To avoid manually running a benchmark for every possible amount of threads, `hyperfine` allows setting parameters it will automatically scan over, and it also allows outputting the results into JSON to be parsed by tools and scripts.

So to run `hyperfine` with every amount of threads between 1 and 112:

```bash
hyperfine -w 1 -m 10 -P threads 1 112 --export-json bench.json './target/max/one-billion-row-challange {threads}'
```

To extract just the amount of threads and mean time I used `jq`, a JSON parsing CLI:

```bash
jq -r '.results[] | "\(.parameters.threads):\(.mean)"' bench.json
```

And because these are way too many results to put on in a table, I generated a simple graph for it using Python:

![multi-threaded runtime](graph1.png)

This graph shows that there using more threads is definitively much faster, but the speedup is not the ideal linear growth:  

![speedup ratio](speedup_ratio1.png)

Using all 112 is still very fast, taking only 323 ms, and beating all previous results(new benchmark with more runs):
```bash
Time (mean ± σ):     323.7 ms ±   2.7 ms    [User: 16596.7 ms, System: 1063.1 ms]
Range (min … max):   319.5 ms … 333.9 ms    50 runs
```

So it is time to look for what overhead can be eliminated.

## Looking For The Overhead

I first tried running the non-`rayon` version to see whether `rayon` is making the performance worse with its work splitting system.

The performance without `rayon` was actually slightly worse, so that is not it:
```bash
Benchmark 1: ./target/max/one-billion-row-challange 112
  Time (mean ± σ):     330.4 ms ±   9.2 ms    [User: 16311.1 ms, System: 919.7 ms]
  Range (min … max):   311.6 ms … 346.0 ms    20 runs
```

After some profiling that showed no new information, I added a simple time measurement inside the main function instead of measuring via `hyperfine`:
```rust
fn main() {
    let start = Instant::now();
    use_rayon::run();
    let dur = start.elapsed().as_micros();
    eprintln!("{}", dur);
}
```
(using the standard error output to separate it from the answer printed into the standard output)

Across 10 runs, the average timing for this is 687ms on the laptop, and 173ms on the server.  
That means that almost half of the time on the server is spent before and after the main function.  
By manually unmapping the file before returning from `run`, I saw the measured time with this method became equal to the results from `hyperfine`.  
That means the almost half of the run time measured by `hyperfine` is spent unmapping the file when the process exits.  
That also explains unexpectedly low speedup from using so many threads.

Unmapping the file is a serial computation and removing it from the measurement on the graph will show the speedup given by multithreading in the rest of the program, which I have more control over.  
That will show how close the rest of the program is to a linear speedup.

So I measured each thread count 20 times again using a short bash script:
```bash
 #!/bin/bash
for threads in {1..112}; do
    sum=0
    for run in {1..20}; do
        time=$(./target/max/one-billion-row-challange $threads 2>&1 1>/dev/null )
        sum=$(awk "BEGIN {print $sum + $time}")
    done
    avg=$(awk "BEGIN {printf \"%.3f\", $sum / 20}")
    echo "$threads,$avg"
done
```

And then plotted the results:

![multi-threaded runtime](graph2.png)

![speedup ratio](speedup_ratio2.png)

Still not a linear speedup but better than before.


## Eliminating The File Unmapping Time

I really wanted to eliminate this time, and noticed that in the original challenge, some of the Java solutions used a separate worker process to do the work as a trick to not count the unmapping time.

To achieve a similar result in Rust I used this solution:

```rust
fn main() {
    let (mut reader, writer) = std::io::pipe().unwrap();
    if unsafe { libc::fork() } == 0 {
        use_rayon::run(writer);
    } else {
        _ = reader.read_exact(&mut [0u8]);
    }
}
```

And I added this to the end of `run`:
```rust
_ = out.flush();
writer.write_all(&[0]).unwrap();
```

What happens here is that the child process does all the work and prints the result, and then notifies the parent that it may exit.  
Without waiting for the child process to notify it, the parent will immediately exit with an empty output.

> [!Info] The `fork` System Call
> The `fork` system call duplicates the current process, creating a child process(and the original process is called the parent process).
> The child process is almost entirely identical to the original process, with the main distinction being that the `fork` call returns 0 to the child, and the process ID of the child to the parent.  
> `fork` is most often used to start new programs by immediately calling `exec` to replace the child with a different program.  
> But in this case, we actually want the child to be a worker process for the parent.  
> The parent and child start with identical memory, but they do not share it. That is why we need to use a pipe to communicate between them.  
> A pipe is seen as a file that can be written to by one process and read by the other.  

This optimization is relevant for both single and multi-threaded solutions, so I will benchmark it in both cases on both systems:

The single-threaded solution is not entirely "single-threaded" anymore because it uses 2 process, but even running both on a single logical core will have the same results(since the parent process is not doing anything), so I think it still counts.

Laptop, single-threaded:
```bash
Time (mean ± σ):      6.012 s ±  0.061 s    [User: 0.001 s, System: 0.002 s]
Range (min … max):    5.902 s …  6.073 s    10 runs
```

Laptop, 22 threads:
```bash
Time (mean ± σ):     704.3 ms ±   7.2 ms    [User: 0.5 ms, System: 1.8 ms]
Range (min … max):   693.1 ms … 716.3 ms    10 runs
```

Server, single-threaded:
```bash
Time (mean ± σ):     10.604 s ±  0.025 s    [User: 0.000 s, System: 0.002 s]
Range (min … max):   10.574 s … 10.657 s    10 runs
```

Server, 112 threads:
```bash
Time (mean ± σ):     175.0 ms ±   1.6 ms    [User: 0.4 ms, System: 1.6 ms]
Range (min … max):   171.5 ms … 178.2 ms    50 runs
```

All of them lost 70-150ms, but in the multi-threaded cases that is a lot of time, especially on the server where almost half of the time disappeared!

Now, after utilizing the many threads available on this CPU, I will try to utilize the new AVX512 instructions that are available on it.

## AVX512

It is worth noting that because my cargo configuration is set to automatically compile for that existing CPU features, the compiler was already able to utilize AVX512 instructions where it saw fit without any more intervention from me. And as I'll show later, it did in at least one spot.

The main improvement in AVX512 is the new 512 bit registers, that means every SIMD operation can potentially operate on twice as much data compared to the 256 bit registers in AVX2.  
Unfortunately, these operations tend to be slower on some CPU models, so they often don't reach quite 2x the performance even with ideal data access.

My first attempt at speeding up the program was rewrite the line splitting logic to do 2 lines at a time.  
Using the assumption that every line station name is at least 3 bytes, we can always skip the first 3 bytes.  
Using the assumption that every line is at most 33 bytes, we can deduce that after skipping the first 3 bytes, at least 2 entire lines are in the next 64 bytes(33+33-3=63).  
So we can always extract 2 measurements from a read chunk of 64 bytes.  
The benefits from that are not huge, as we only slightly increase the potential for out-of-order execution between 2 lines, and in total work we saved one read per 2 lines(we did one larger read instead of 2 smaller ones).

So the rewritten logic is:

```rust
#[target_feature(enable = "avx512bw")]
fn find_line_splits(text: &[u8]) -> (usize, usize, usize, usize) {
    let separator: __m512i = _mm512_set1_epi8(b';' as i8);
    let line_break: __m512i = _mm512_set1_epi8(b'\n' as i8);
    let line: __m512i = unsafe { _mm512_loadu_si512(text.as_ptr() as *const __m512i) };
    let separator_mask = _mm512_cmpeq_epi8_mask(line, separator);
    let line_break_mask = _mm512_cmpeq_epi8_mask(line, line_break);
    let separator_pos1 = separator_mask.trailing_zeros() as usize;
    let line_break_pos1 = line_break_mask.trailing_zeros() as usize;
    let var_name = separator_mask ^ (1 << separator_pos1);
    let seperator_pos2 = var_name.trailing_zeros() as usize;
    let var_name1 = line_break_mask ^ (1 << line_break_pos1);
    let line_break_pos2 = var_name1.trailing_zeros() as usize;
    (
        separator_pos1,
        line_break_pos1,
        seperator_pos2,
        line_break_pos2,
    )
}
fn process_chunk(chunk: &[u8]) -> FxHashMap<StationName, StationEntry> {
    let mut summary =
        FxHashMap::<StationName, StationEntry>::with_capacity_and_hasher(1024, Default::default());
    let mut remainder = chunk;
    while (remainder.len() - MARGIN) != 0 {
        let (separator_pos1, line_break_pos1, seperator_pos2, line_break_pos2) =
            unsafe { find_line_splits(remainder) };
        let station_name1 = StationName {
            ptr: remainder.as_ptr(),
            len: separator_pos1 as u8,
        };
        let measurement1 = parse_measurement(&remainder[separator_pos1 + 1..]);
        let measurement2 = parse_measurement(&remainder[seperator_pos2 + 1..]);
        add_measurement(&mut summary, station_name1, measurement1);
        let remainder1 = &remainder[line_break_pos1 + 1..];
        if (remainder1.len() - MARGIN) == 0 {
            // need to exit now if odd number of lines in the chunk
            break;
        }
        let station_name2 = StationName {
            ptr: unsafe { remainder.as_ptr().add(line_break_pos1 + 1) },
            len: (seperator_pos2 - line_break_pos1 - 1) as u8,
        };
        add_measurement(&mut summary, station_name2, measurement2);
        remainder = &remainder[line_break_pos2 + 1..];
    }
    summary
}
fn add_measurement(
    summary: &mut FxHashMap<StationName, StationEntry>,
    station_name: StationName,
    measurement: i32,
) {
    summary
        .entry(station_name)
        .and_modify(|e| {
            if measurement < e.min {
                e.min = measurement;
            }
            if measurement > e.max {
                e.max = measurement;
            }
            e.sum += measurement;
            e.count += 1;
        })
        .or_insert(StationEntry {
            sum: measurement,
            min: measurement,
            max: measurement,
            count: 1,
        });
}
```

Resulting in the following times(using 112 threads):
```bash
Time (mean ± σ):     178.5 ms ±   1.4 ms    [User: 0.5 ms, System: 1.6 ms]
Range (min … max):   176.1 ms … 182.3 ms    50 runs
```

Very slightly slower than before..

I also tried replacing the compare and move-mask instructions in the original 256-bit line reading with the new mask variation that directly creates a mask:
```rust
let separator_mask = _mm256_mask_cmpeq_epu8_mask(!0, line, separator);
let line_break_mask = _mm256_mask_cmpeq_epu8_mask(!0, line, line_break);
```

But after inspecting the generated assembly it turns out the same instructions are generated in both cases(probably the compiler detecting the possible optimization with the previous code when AVX512 is available).

Next, I tried using masked instructions in the comparison function that takes a much more significant amount of the time:

```rust
#[target_feature(enable = "avx512bw,avx512vl")]
fn eq_inner(&self, other: &Self) -> bool {
    if self.len != other.len {
        return false;
    }
    let s = unsafe { _mm256_loadu_si256(self.ptr as *const __m256i) };
    let o = unsafe { _mm256_loadu_si256(other.ptr as *const __m256i) };
    let mask = (1 << self.len.max(other.len)) - 1;
    let diff = _mm256_mask_cmpneq_epu8_mask(mask, s, o);
    diff == 0
}
```


And that was slightly faster:

```bash
Time (mean ± σ):     172.9 ms ±   1.5 ms    [User: 0.6 ms, System: 1.4 ms]
Range (min … max):   170.1 ms … 176.8 ms    50 runs
```

I also tried using the masked load instructions available with AVX512 to only load relevant bytes:

```rust
let s = unsafe { _mm256_maskz_loadu_epi8(mask, self.ptr as *const i8) };
let o = unsafe { _mm256_maskz_loadu_epi8(mask, other.ptr as *const i8) };
```

But that was slightly slower:

```bash
Time (mean ± σ):     176.0 ms ±   1.8 ms    [User: 0.5 ms, System: 1.7 ms]
Range (min … max):   172.8 ms … 180.1 ms    50 runs
```

I don't have other ideas how to utilise AVX512 here, so only a very small gain was made, and that is my final time for the challenge.

To make it simpler to run, I combined both the AVX512 and the AVX2 multi-threaded solution into one file `final_multi_thread` that chooses the relevant code at compile time:
```rust
    #[cfg(all(target_feature = "avx512bw", target_feature = "avx512vl"))]
    #[target_feature(enable = "avx512bw,avx512vl")]
    fn eq_inner(&self, other: &Self) -> bool {
        if self.len != other.len {
            return false;
        }
        let s = unsafe { _mm256_loadu_si256(self.ptr as *const __m256i) };
        let o = unsafe { _mm256_loadu_si256(other.ptr as *const __m256i) };
        let mask = (1 << self.len.max(other.len)) - 1;
        let diff = _mm256_mask_cmpneq_epu8_mask(mask, s, o);
        diff == 0
    }
    #[cfg(all(target_feature = "avx2", not(target_feature = "avx512bw")))]
    #[target_feature(enable = "avx2")]
    fn eq_inner(&self, other: &Self) -> bool {
        if self.len != other.len {
            return false;
        }
        let s = unsafe { _mm256_loadu_si256(self.ptr as *const __m256i) };
        let o = unsafe { _mm256_loadu_si256(other.ptr as *const __m256i) };
        let mask = (1 << self.len) - 1;
        let diff = _mm256_movemask_epi8(_mm256_cmpeq_epi8(s, o)) as u32;
        diff & mask == mask
    }
    #[cfg(not(target_feature = "avx2"))]
    fn eq_inner(&self, other: &Self) -> bool {
        let self_slice = unsafe { from_raw_parts(self.ptr, self.len as usize) };
        let other_slice = unsafe { from_raw_parts(other.ptr, other.len as usize) };
        self_slice == other_slice
    }

```

## Benchmarking A Compliant Multi-Threaded Solution

Like in part 1, I wanted to measure the cost of being fully compliant with the rules. Which means supporting station names between 1 and 100 bytes.

By combining the final multi-threaded solution and the exact same changes made in part 1 to make the final single-threaded solution compliant, I created a compliant multi-threaded solution.

Running this version on the laptop with 22 threads:

```bash
Time (mean ± σ):     956.8 ms ±   8.3 ms    [User: 0.4 ms, System: 1.9 ms]
Range (min … max):   945.6 ms … 970.8 ms    10 runs
```

And on the server with 122 threads:
```bash
Time (mean ± σ):     212.0 ms ±   2.3 ms    [User: 0.4 ms, System: 1.6 ms]
Range (min … max):   209.7 ms … 221.4 ms    50 runs
```

36% and 22% slower than the non-compliant versions. But still pretty fast.

## Summary

In this part of the one billion rows challenge, I made my already pretty fast single threaded solution even faster:

- I demonstrated a few ways to parallelize the work and use many threads, and as expected, the fastest way is the one that requires the least synchronization between the threads.  
- When I ran out of software optimizations to apply, using better hardware was the next step. So another huge speedup was achieved by using a server equipped with 112 logical cores.  
- I offloaded the file unmapping to a different process since it started taking a very significant amount of the time.
- I used an AVX512 instruction available on the new system to shave off a couple more milliseconds.

After all of this work, I achieved a final time of 172.9 milliseconds to solve the one billion rows challenge.
