---
publishDate: 2025-11-01
title: The One Billion Row Challange Part 2 - Using Multithreading To Go Even Faster
author: Barr
keywords: [Rust, 1BRC, Performance, Optimization, Parallelism]
description: Improving on my solution for the one billion row challange from part 1 by using multiple threads.
summary: |
  ["The One Billion Row Challenge"](https://github.com/gunnarmorling/1brc) is a programming challenge orignally written for Java, where the goal is to summarize a billion rows of temprature measurements as fast as possible. In part 1, I maximized the performance of solving this challenge for a single thread, and in this part I will incorporate multithreading to go even faster.
github: https://github.com/barr-israel/1brc
---

## The Starting Point And Making A Plan

My [best single threaded solution](/posts/1brc_part1/#final-single-threaded-results) completes in 6.28 seconds on my laptop using a single thread.  
Despite the entire optimization journey in part 1, its general flow remains the same:

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
So unless stated otherwise, the benchmarks shown will run on the same specs as shown in part 1, with the CPU clock locked to 3.5GHz.  
With the CPU clock locked to 3.5GHz, the best single threaded run time was 8.33 seconds.


## Splitting The Text

Splitting the text can be done either by the main thread splitting it before giving every other thread its already adjusted thread, or the main thread could give every thread the entire text and letting each thread split its chunk on its own.  
Splitting on the main thread is slower by a few cycles, but it is simpler and only done once during the entire run time, so the difference is immeasurably small.

```rust

```


