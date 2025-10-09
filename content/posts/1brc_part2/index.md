---
publishDate: 2025-11-01
title: The One Billion Row Challange Part 2 - Using Multithreading To Go Sub Second
author: Barr
keywords: [Rust, 1BRC, Performance, Optimization, Parallelism]
description: Improving on my solution for the one billion row challange from part 1 by using multiple threads.
summary: |
  ["The One Billion Row Challenge"](https://github.com/gunnarmorling/1brc) is a programming challenge orignally written for Java, where the goal is to summarize a billion rows of temprature measurements as fast as possible. In part 1, I maximized the performance of solving this challenge for a single thread, and in this part I will incorporate multithreading to go even faster.
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
| Time (s) | 18.9 | 21.4 | 16.3 | 14.9 | 13.6 | 12.4 | 12.5 | 12.7 | 12.9 |

Next, we are going back to single threaded maps to actually achieve higher performance.

## Back To Single Threaded Hash Maps

Concurrent hash maps are useful when the different worker threads actually care what the other threads put in the hash map, but that is not the case here.  
For this challenge, every thread can work on its own, generating its own summary without any synchronization with other threads.  
That will result in generating a summary per thread, each containing at most a few hundred stations.  
Then, the main thread can combine these summaries relatively cheaply and produce the final result.  

Combining the different hash maps looks very similar to how they were built to begin with, except the count is increased by the amount of time that station was seen, and not just by 1:

```rust
fn merge_summaries(
    summary: &mut FxHashMap<StationName, (i32, i32, i32, i32)>,
    partial_summary: FxHashMap<StationName, (i32, i32, i32, i32)>,
) {
    partial_summary.into_iter().for_each(
        |(station_name, (partial_min, partial_sum, partial_max, partial_count))| {
            summary
                .entry(station_name)
                .and_modify(|(min, sum, max, count)| {
                    if partial_min < *min {
                        *min = partial_min;
                    }
                    if partial_max > *max {
                        *max = partial_max;
                    }
                    *sum += partial_sum;
                    *count += partial_count;
                })
                .or_insert((partial_min, partial_sum, partial_max, partial_count));
        },
    );
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

| Threads  | 1    | 2    | 4    | 6    | 8    | 10   | 12   | 14   | 16   | 18   | 20   | 22   |
| -------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Time (s) | 8.05 | 4.1  | 2.15 | 1.48 | 1.45 | 1.25 | 1.14 | 1.04 | 0.98 | 0.93 | 0.91 | 0.91 |

And we finally crossed the 1 second barrier!  
I considered rewriting the `merge_summaries` function to reuse the same hash instead of computing every hash twice, but the entire function does not even register on the profile, so there is no reason to do it.

Looking at the run times we got, we can see that the performance is equal to the single threaded performance with 1 thread, which means no overhead was added.  
Additionally, the performance scaled almost perfectly up to 6 threads and then the scaling started to slow down. This matches with the fact that this laptop has exactly 6 performance cores.



And with the CPU frequency unlocked it gets much faster at lower thread counts and very slightly faster at higher thread counts:

| Threads  | 1    | 2    | 4    | 6    | 8    | 10   | 12   | 14   | 16   | 18   | 20   | 22   |
| -------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Time (s) | 6.25 | 3.3  | 1.86 | 1.34 | 1.34 | 1.16 | 1.04 | 0.96 | 0.91 | 0.88 | 0.87 | 0.86 |

This can be explained by looking at the power usage and frequencies of the CPU, it appears that past 6 threads the frequencies get throttled by missing power, as the power usage hits 41W and doesn't rise further no matter how many threads participate.

## Summary

In this part of the one billion rows challenge, I used multithreading to make my already pretty fast single threaded solution even faster.  
I demonstrated a few ways to achieve this, and as expected, the fastest way is the one that requires the least synchronization between the threads.  
Finally, with all the optimizations applied, the solution achieved a time of only 0.86 seconds.
