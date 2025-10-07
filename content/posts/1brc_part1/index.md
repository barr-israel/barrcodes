---
publishDate: 2025-11-01
title: The One Billion Row Challange Part 1 - Single Threaded Solution From Minutes To Seconds
author: Barr
keywords: [Rust, 1BRC, Performance, Optimization]
description: Tackling the "The One Billion Row Challange" in Rust, and optimizing it for maximum performance. Part 1 will only focus on single threaded performance
summary: |
  ["The One Billion Row Challenge"](https://github.com/gunnarmorling/1brc) is a programming challenge orignally written for Java, where the goal is to summarize a billion rows of temprature measurements as fast as possible. But since its invention, it has been solved in many other languages. In this blog post I will tackle the challenge myself and try to make my solution as fast as possible using Rust using a single thread, and in the next post I will use multiple threads to make it even faster.
github: https://github.com/barr-israel/1brc
---

## Preface

I will start with a simple and slow solution, and among other optimizations, I will incorporate some assumptions into the code to make it even faster.  
While making too many assumptions can lead to errors, making the correct assumptions enables very effective optimizations. And this is just a performance challenge with input that is generated from a known range of options, so we can make a lot of assumptions.  
Additionally, this blog post is written as I am optimizing my solution, and not as a retrospective on optimizing it, so it is long and not entirely grouped by the type of optimization used.  
Instead, it shows the spiral nature of performance optimization: targeting the hot spots one by one, and returning to already improved sections to improve them again once their relative run time grows once other parts became faster.  

Almost every variation of the solution shown here can be seen in the GitHub repository linked above.

## Defining The Problem

In this challenge, we are given a text file containing one billion lines, each consisting of a station name, a semi-colon, and a temperature measurement. For example:
```txt
Hamburg;12.0
Bulawayo;8.9
Palembang;38.8
St. John's;15.2
Cracow;12.6
Bridgetown;26.9
Istanbul;6.2
Roseau;34.4
Conakry;31.2
Istanbul;23.0
```
The output of the solution needs to be the minimum, mean average and maximum value seen for each station, rounded to 1 decimal place and sorted alphabetically, in the following format:
```txt
{Abha=-23.0/18.0/59.2, Abidjan=-16.2/26.0/67.3, Abéché=-10.0/29.4/69.0, Accra=-10.1/26.4/66.4, Addis Ababa=-23.7/16.0/67.0, Adelaide=-27.8/17.3/58.5, ...}
```

This kind of problem allows for some impressive performance gains by making assumptions about the inputs, such as:

 - No errors in the text allows skipping any validation.
 - The possible length of station names is known in advance because we have the list of station before the dataset is generated.
 - We know the range of possible measurements and their precision.

## Generating The Dataset

To generate the dataset, I used the original Java code given in the challenge repository:
```bash
./mvnw clean verify
```
To simply build the generation code, after spending a while looking for the correct version of JDK that will actually manage to build the project.  
And then waiting waiting a few minutes for the 14GB text file to be generated:
```bash
./create_measurements.sh 1000000000
```

## Benchmarking Methodology

Unless stated otherwise, all measurements in this challenge will be done using [hyperfine](https://github.com/sharkdp/hyperfine), on the same machine equipped with an Intel Core Ultra 7 165H and 32GiB of LPDDR5 Memory running at 6400 MT/s.  
For more stable results and to avoid thermal throttling, until the final benchmark the CPU frequency will be locked to 3.5GHz using `cpupower frequency-set`, and the single-threaded versions will be locked to a single core using `taskset -c 2`.  
Core 2 is specifically chosen to avoid core 0(and its SMT sibling core 1) which handles some kernel related work, and to ensure the program always runs on a performance core and not an efficiency core, as Intel's newer CPUs utilise a hybrid approach combining two different types of cores on the same CPU.  

> [!NOTE] hyperfine
> [hyperfine](https://github.com/sharkdp/hyperfine) is a simple benchmarking tool that automatically runs a program enough time to be statistically certain to a high enough degree that the measurement is accurate.
> It is useful to very easily measure the run time of complete and short programs in their entirety without modifying or recompiling the code, which fits this challenge.

The measurements file is preloaded into the page cache using [vmtouch](https://github.com/hoytech/vmtouch) to eliminate the overhead of reading it from disk.

```bash
./vmtouch -t ../1brc/measurements.txt
           Files: 1
     Directories: 0
   Touched Pages: 3367990 (12G)
         Elapsed: 16.386 seconds
```

> [!NOTE] vmtouch
> [vmtouch](https://github.com/hoytech/vmtouch) is a useful utility that can show information about, and control the status of files in the file cache.
> Running it without any parameters shows the current status, running it with the `-f` flag reads a single byte from every page in every file to cause them all to be cached, and the `-e` flag evicts a file from the cache. There are a few more useful flags.

## Baseline Measurements

My first step is gauging a rough possible range of run time.

### Lower Bound
By simply reading the entire file without doing any computation, we can approximate the fastest we can go on one core:

```bash
$ taskset -c 2 hyperfine 'cat measurements.txt'
Benchmark 1: cat measurements.txt
  Time (mean ± σ):      1.355 s ±  0.007 s    [User: 0.005 s, System: 1.346 s]
  Range (min … max):    1.347 s …  1.368 s    10 runs
 ```

Note that the entire file is in file cache, so no actual disk I/O is done:

### Upper Bound

The challenge repository also contains a [baseline implementation](https://github.com/gunnarmorling/1brc/blob/main/src/main/java/dev/morling/onebrc/CalculateAverage_baseline.java) in Java, the runs on a single core and does not have any particular optimizations applied to it.  
Of course, my solution could still be slower, but it provides a simple rough upper bound:
```bash
$ taskset -c 2 hyperfine ./calculate_average_baseline.sh
Benchmark 1: ./calculate_average_baseline.sh
  Time (mean ± σ):     137.615 s ±  7.713 s    [User: 134.325 s, System: 2.623 s]
  Range (min … max):   130.097 s … 148.467 s    10 runs
```

So we can expect the solutions to be somewhere in that range.  
As another point of reference, without the CPU frequency setting, the same baseline solution takes **116 seconds**(and the lower bound 1.16 seconds).  


#### Output Verification

I have also saved the output of the baseline solution to compare to my output and verify it.  
All solutions shown in this post have been verified to be identical to the baseline using `cmp`.

> [!Note] cmp
> [cmp](https://www.man7.org/linux/man-pages/man1/cmp.1.html) is a standard Linux utility to compare files, and it is often the easiest way to verify two files are identical: if the output of `cmp file1 file2` is empty, the files are identical.
> In the past I used [diff](https://man7.org/linux/man-pages/man1/diff.1.html) for this purpose.  
> `diff` has the advantage of showing all differences, and not just *where* the first difference is like `cmp` does, but `cmp` is a lot faster.

## First Attempt - 95 Seconds

My initial version is the naive solution: 

1. For every line of text:
    1. Split the line into station name and measurement.
    1. Parse the measurement.
    1. Add the measurement to a hash map using the station name as the key.
1. For every station in the hash map, summarize its measurements.
1. Sort the summary.
1. Print the results.

The code for solution is short and simple, and it contains a lot of room for improvement:
```rust
// naive.rs
let file = File::open("measurements.txt").expect("measurements.txt file not found");
let reader = BufReader::new(file);
let mut map = HashMap::<String, Vec<f32>>::new();
for line in reader.lines() {
    let line = line.unwrap();
    let (station_name, measurement) = line.split_once(';').expect("invalid line");
    let measurement_value: f32 = measurement.parse().expect("not a number");
    map.entry(station_name.into())
        .or_default()
        .push(measurement_value);
}
let mut summary: Vec<(&String, f32, f32, f32)> = map
    .iter()
    .map(|(station_name, measurements)| {
        let min = *measurements.iter().min_by(|a, b| a.total_cmp(b)).unwrap();
        let avg = measurements.iter().sum::<f32>() / measurements.len() as f32;
        let max = *measurements.iter().max_by(|a, b| a.total_cmp(b)).unwrap();
        (station_name, min, avg, max)
    })
    .collect();
summary.sort_unstable_by_key(|m| m.0);
print!("{{");
for (station_name, min, avg, max) in summary[..summary.len() - 1].iter() {
    print!("{station_name}={min:.1}/{avg:.1}/{max:.1}, ");
}
let (station_name, min, avg, max) = summary.last().unwrap();
print!("{station_name}={min:.1}/{avg:.1}/{max:.1}}}");
```

This approach of summarizing the measurements at the end instead of while parsing, is obviously not ideal, and it is simple to improve. Even the baseline solution already implemented this improvement, so it's possible that this first solution will be even slower.

This solution passes the verification and it is already faster than the baseline:
```bash
Time (mean ± σ):     95.499 s ±  0.319 s    [User: 91.841 s, System: 3.413 s]
Range (min … max):   95.028 s … 96.116 s    10 runs
```

## Better Compilation Parameters - 89 Seconds

Most of the times I am trying to optimize some Rust code, I use the following Cargo profiles to maximize performance and gather performance metrics:
```Cargo
[profile.max]
inherits = "release"
panic = "abort"
codegen-units = 1
lto = true

[profile.bench]
inherits = "max"
debug = true
strip = false
```

The `max` profile contains the most aggressive optimizations that a profile can apply, and the `bench` profile is the same with the addition of some debugging information that can help debug and gather performance metrics.  
In most cases there will actually be no measurable difference between the two profiles.

Running the same code with the `max` profile improves the performance a little, to **90 seconds**:
```bash
Time (mean ± σ):     90.245 s ±  0.619 s    [User: 86.582 s, System: 3.426 s]
Range (min … max):   89.227 s … 91.232 s    10 runs
```

We can additionally compile the code specifically for the host CPU, which mostly means allowing the compiler to automatically use all available CPU extensions, such as AVX2 in my case. This is done by creating a file called `config.toml` in a new directory called `.cargo` and writing to it:
```
[build]
rustflags = ["-Ctarget-cpu=native"]
```

This addition shaved off one more second:
```bash
Time (mean ± σ):     89.016 s ±  0.825 s    [User: 85.358 s, System: 3.429 s]
Range (min … max):   88.010 s … 90.681 s    10 runs
```
The current code is not very friendly to vectorization, which often gets the biggest gain from native compilation. This explains why we only see a very small improvement.
I will be using these parameters in the rest of the measurements.

## Optimizing The Wrong Part: Updating The Summary During Parsing - 86 Seconds

The first optimization that comes to mind, which the baseline already does, is that we fortunately(or more likely, it was specifically designed this way) don't actually need to store all the measurements for every station, for any specific station we only need to store the highest measurement, the lowest measurement, the sum of all measurements, and the amount of measurements.  
Using the sum and amount of measurements we can instantly calculate the average at the end of the scan.  
So the new algorithm is:
1. For every line of text:
    1. Split the line into station name and measurement.
    1. Parse the measurement.
    1. Update the hash map with the new min/sum/max/count for that station name
1. Turn the hash map into a summary vector while computing the averages.
1. Sort the summary
1. Print the results

And as code, the updated section looks like this:
```rust
// no_store.rs
let mut summary = HashMap::<String, (f32, f32, f32, i32)>::new();
for line in reader.lines() {
    let line = line.unwrap();
    let (station_name, measurement) = line.split_once(';').expect("invalid line");
    let measurement_value: f32 = measurement.parse().expect("not a number");
    summary
        .entry(station_name.into())
        .and_modify(|(min, sum, max, count)| {
            *min = min.min(measurement_value);
            *sum += measurement_value;
            *max = max.max(measurement_value);
            *count += 1;
        })
        .or_insert((measurement_value, measurement_value, measurement_value, 1));
}
let mut summary: Vec<(String, f32, f32, f32)> = summary
    .into_iter()
    .map(|(station_name, (min, sum, max, count))| (station_name, min, sum / count as f32, max))
    .collect();
summary.sort_unstable_by(|m1, m2| m1.0.cmp(&m2.0));
```

And running the code now results in:
```bash
Time (mean ± σ):     86.487 s ±  0.404 s    [User: 84.134 s, System: 2.151 s]
Range (min … max):   85.941 s … 86.997 s    10 runs
```

It is faster, but the improvement is much smaller than I expected. Why?

### Reading Flamegraphs

Flamegraphs are a way to visualize the time a program spent in every function in the code, and here it can show us how much did the previous solution spend in gathering the measurements, which should consist mostly of reallocating the vectors the measurements are stored in.  
In Rust, the easiest way to generate flamegraphs is using [cargo-flamegraph](https://github.com/flamegraph-rs/flamegraph).  
After installing the package, it can be ran using:
```
cargo flamegraph --profile bench
```
I am using the `bench` profile because the flamegraph generation needs the debug information to give any useful results.

The resulting flamegraph shows this rough breakdown of the time:

 - `readline` - 34.9%
 - `str::parse` - 8.7%
 - `str::split_once` - 5%
 - `HashMap::entry` - 26.2%

 And the rest spread in various other parts of the code, that don't take enough time to be important yet.
 
So targeting the measurements vectors was not a great decision, which would have been more obvious if measured before applying this optimization, but at least it takes up significantly less memory, which can be measured using `/bin/time -v`, which shows the "maximum resident set size" used by the program(this output is from the first solution):

```bash
	User time (seconds): 85.25
	System time (seconds): 3.48
	Percent of CPU this job got: 99%
	Elapsed (wall clock) time (h:mm:ss or m:ss): 1:28.91
	Average shared text size (kbytes): 0
	Average unshared data size (kbytes): 0
	Average stack size (kbytes): 0
	Average total size (kbytes): 0
	Maximum resident set size (kbytes): 4201520
	Average resident set size (kbytes): 0
	Major (requiring I/O) page faults: 0
	Minor (reclaiming a frame) page faults: 742454
	Voluntary context switches: 1
	Involuntary context switches: 545
	Swaps: 0
	File system inputs: 0
	File system outputs: 0
	Socket messages sent: 0
	Socket messages received: 0
	Signals delivered: 0
	Page size (bytes): 4096
	Exit status: 0
```

> [!Warning] time
> `time` is also a built-in command in many shells, which do not support the `-v` flag, so to invoke the actual `time` program, the full path `/bin/time` must be used(and might need to be installed via your package manager).

The original solution peaks at `4201520 KB`, or about `4 GB`, which fits with the one billion 4 byte floats it needs to store.  
In comparison, the new version peaks at only `2196 KB`, or about `2 MB`, 2000 times less than the original solution:
```bash
Maximum resident set size (kbytes): 2196
```

Generating a flamegraph for the new version shows roughly the same breakdown of time as before.

## Optimizing The Right Part: A New Parser - 59 Seconds

The [generated flamegraph](flamegraph1.svg) shows that a quarter of the time is spend in `readline`, and almost 15% is spent in the rest of the parsing. It also shows that there is effectively nothing to gain improving the sorting phase as it is so short it does not even appear on the flamegraph.  
Digging down more into `readline`, we can see that its time is split very roughly equally between UTF-8 validation, vector allocation and searching for the line separator(using `memchr`).  
These are all things that can be improved by writing a new parser.

### Byte Are Faster Than Chars

Reading the file as an array of bytes into a pre-allocated buffer allows the line splitting to speed up, and already gives a measurable speedup to lowering the run time to **75 seconds**:
```rust
// bytes.rs
...
let mut buffer = Vec::new();
while reader.read_until(b'\n', &mut buffer).unwrap() != 0 {
    let line = std::str::from_utf8(&buffer[..buffer.len()-1]).unwrap();
    ...
    buffer.clear();
}
...
```

This still works despite the input containing some non-ASCII characters in station names because those are taken whole, and they will be turned back to UTF-8 strings later.  
The conversion to `&str` and later scanning over it eliminates a lot of the gain, and I will solve that later.  

### Measurement Value Parsing

One useful observation is that all measurements are always in the range -99.9 to 99.9, and always have exactly 1 decimal digit, so we can actually parse it more easily into an integer(with its units being tenths of degrees), and only convert it back to the expected format at the end.

This is not necessarily the fastest implementation under these constraints, but it will do for now:

```rust
// bytes.rs
fn parse_measurement(text: &[u8]) -> i32 {
    if text[0] == b'-' {
        -parse_measurement_pos(&text[1..])
    } else {
        parse_measurement_pos(text)
    }
}
fn parse_measurement_pos(text: &[u8]) -> i32 {
    if text[1] == b'.' {
        // 1 digit number
        (text[0] - b'0') as i32 * 10 + (text[2] - b'0') as i32
    } else {
        // 2 digit number
        (text[0] - b'0') as i32 * 100 + (text[1] - b'0') as i32 * 10 + (text[3] - b'0') as i32
    }
}
```

The main change to the rest of the code is that the hash map now holds `i32`s, and that they are being converted to `f32` and divided by 10 after parsing.

This solution has 2 main benefits over the standard `str::parse<f32>`:

- It does not require parsing the byte slice into a string slice, which includes a validation if not using the unsafe unchecked variation.
- It utilizes the known constraints of the values to do the minimum amount of work.

Using the new value parsing reduces the run time to **64 seconds**, and looking at a [new flamegraph](flamegraph2.svg), it reduced the value parsing related section from 9% to 2.6%.  
The hash map part of the run time is getting bigger with every optimization, I'll tackle it after one more small optimization to the parsing.

### Slightly Faster Line Splitting

We know that the separating `;` is always in the last 7 bytes of a line, because every line has its line break, and at most 5 bytes related to the measurement value, so we can just skip to that part of the line:
```rust
// bytes.rs
let first_possible_split = buffer.len() - 7;
let split_pos = buffer[first_possible_split..]
    .iter()
    .position(|c| *c == b';')
    .unwrap()
    + first_possible_split;
let (station_name, measurement) = buffer.split_at(split_pos);
```

This optimization saves a few more seconds, for a total run time of **59 seconds** and shrinking the relative time spent in `position`:
```bash
Time (mean ± σ):     59.171 s ±  0.528 s    [User: 56.978 s, System: 2.031 s]
Range (min … max):   58.439 s … 60.107 s    10 runs
```

I also tried splitting the reading of a line into 2: reading up to the `;` and then up to the `\n`, but that ended up being slower.  

## Faster Hash Map - 27 Seconds

### Hashing Less

My first idea was to eliminate the use of `Vec` as the hash map key by using `[u8;32]` keys, which can fit any of the possible station names:  
```rust
// faster_hash_map.rs
...
let mut summary = HashMap::<[u8; 32], (i32, i32, i32, i32)>::new();
...
    let mut station_name_array = [0u8; 32];
    station_name_array[..station_name.len()].copy_from_slice(station_name);
    summary
        .entry(station_name_array)
...
```
Unfortunately, while it replaced the time spent allocating a vector with a shorter time copying a slice, it also increased the time spent hashing, so the entire program ended up being slightly slower.  
Hashing 32 bytes every time is slow, and the default hasher hashes every byte individually, as we can see on the [flamegraph](flamegraph3.svg): hashing takes up 17% of the time, and the hasher calls `u8::hash_slice` which calls the hash function for every individual byte. Additionally, it hashes the length of the slice as well, which is unnecessary.  
Instead, I wrote a new struct for the station name, that implements a custom hash for the station name, that only takes the first 8 bytes as a `u64` and hashes that:
```rust
// faster_hash_map.rs
#[derive(Eq, PartialEq)]
struct StationName([u8; 32]);

impl Hash for StationName {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        let ptr = self.0.as_ptr() as *const u64;
        unsafe { ptr.read_unaligned() }.hash(state);
    }
}
impl From<&[u8]> for StationName {
    fn from(source: &[u8]) -> Self {
        let mut s = Self([0; 32]);
        s.0[..source.len()].copy_from_slice(source);
        s
    }
}
impl From<StationName> for String {
    fn from(val: StationName) -> Self {
        String::from_str(std::str::from_utf8(&val.0).unwrap()).unwrap()
    }
}
```

And using it as the key to the hash map. Not using all the bytes could increase the collision rate in the hash map, but the station names are varied enough that almost no pair of stations share the same first 8 bytes.    
This takes the run time down to **47 seconds**.  

There is no point to hash less than 8 bytes at a time because every smaller size will just get automatically extended to 8 bytes if it is smaller, before the hashing(in the default hasher and many other hashers).

### Hashing Faster

Instead of hashing less times or hashing less bytes, we can replace the hashing function itself, there are many crates that offer different hashing algorithm, so I tried several of the most popular options:

- `ahash::AHashMap`: improved the run time to **39 seconds**.
- `fnv::FnvHashMap`: improved the run time to **43.6 seconds**.
- `rustc-hash::FxHashMap`: improved the run time to **34.8 seconds**.
- `hashbrown::hash_map::HashMap`: improved the run time to **35.3 seconds**.

I also tried `nohash-hasher::NoHashHasher` which does not actually do any hashing and just passes the `u64` as the hash, which can be useful when the keys are already random, but it worsened the run time to **103 seconds**

So I'll continue with `FxHashMap`.

## Mapping Is Faster Than Reading - 27.7 seconds

Up until now I relied on `BufReader` to get the data from the file, one common alternative way to read data from a file is using `mmap`.  
`mmap` is a system call that maps a file into memory, making it appear to the program as a big array that can be read directly, it can even map files much larger than the system memory can contain.  
Of course, the file is not actually copied into system memory until it is actually touched, but that part is handled by the operating system.
To use `mmap` in Rust, you can use a crate such as `memmap` or its replacement, `mememap2`, or you can the call `mmap` system call directly via the `libc` crate, like `memmap` and `memmap2` do:

```rust
// use_mmap.rs
fn map_file(file: &File) -> Result<&[u8], Error> {
    let mapped_length = file.metadata().unwrap().len() as usize;
    match unsafe {
        libc::mmap(
            std::ptr::null_mut(),
            mapped_length,
            libc::PROT_READ,
            libc::MAP_SHARED,
            file.as_raw_fd(),
            0,
        )
    } {
        libc::MAP_FAILED => Err(Error::last_os_error()),
        ptr => {
            unsafe { libc::madvise(ptr, mapped_length, libc::MADV_SEQUENTIAL) };
            Ok(unsafe { from_raw_parts(ptr as *const u8, mapped_length) })
        }
    }
}
```

Now the iterator needs to be updated to use a slice:
```rust
// use_mmap.rs
...
let mapped_file = unsafe { MmapOptions::new().map(&file).expect("mmap failed") };
for line in mapped_file.split(|c| *c == b'\n')
    if line.is_empty() { // the last item in the iterator will be an empty line
      break;
    }
    ...
```

This change improves the run time to **27.8 seconds**

I then tried splitting the reading of the line into reading up to `;` and then up to `\n` again:
```rust
// use_mmap.rs
let mut remainder = &*mapped_file; // get to the underlying slice
while !remainder.is_empty() {
    let station_name_slice: &[u8];
    let measurement_slice: &[u8];
    (station_name_slice, remainder) =
        remainder.split_at(remainder.iter().position(|c| *c == b';').unwrap());
    remainder = &remainder[1..]; //skip ';';
    (measurement_slice, remainder) =
        remainder.split_at(remainder.iter().position(|c| *c == b'\n').unwrap());
    remainder = &remainder[1..]; //skip \n;
```

And it is very slightly faster now, at **27.7 seconds**:
```bash
Time (mean ± σ):     27.721 s ±  0.105 s    [User: 27.202 s, System: 0.410 s]
Range (min … max):   27.637 s … 27.889 s    10 runs
```

The updated [flamegraph](flamegraph4.svg) shows 2 things:

- Reading the file disappeared completely from the flamegraph
- `position` is becoming a considerable bottleneck again(especially now that we are using it twice)

The reason we can't see the reading itself at all is also part of the reason `position` takes such a long time now: there is dedicated section of code for getting the bytes from the file into the program, it is done entirely during page faults, which are attributed to the assembly instructions that cause the faults.  
These instructions would mostly be inside `position`, since it is the first to touch any line of text.

> [!Note] Page Faults
> As I explained before, `mmap` does not actually copy the entire file into memory, it just makes it appear to be in memory.  
> When the program tries to access a part of the file, the CPU detects that the memory page(a small section of memory, 4KiB unless using huge pages) containing the accessed address is not actually in memory, and causes a page fault.  
> The page fault is handled by the operating system, which copies the missing page from the file into memory, and then control can be given back to the program, which will read the value as if nothing happened.

## memchr - 26.1 seconds

`memchr` is a crate that provides optimized functions to search in byte slices. It uses SIMD instructions to make finding specific bytes extremely fast.

Using it is as simple as replacing the `position` calls with `memchr` calls:
```rust
// use_memchr.rs
    ...
    (station_name_slice, remainder) = remainder.split_at(memchr(b';', remainder).unwrap());
    remainder = &remainder[1..]; //skip ';';
    (measurement_slice, remainder) = remainder.split_at(memchr(b'\n', remainder).unwrap());
    remainder = &remainder[1..]; //skip \n;
    ...
```

This change improves the runtime to **26.1 seconds**:
```bash
Time (mean ± σ):     26.059 s ±  0.228 s    [User: 25.446 s, System: 0.411 s]
Range (min … max):   25.778 s … 26.376 s    10 runs

```
Not as big of an improvement as I expected, but still a win.


## Eliminating Copies - 25 seconds

In all previous versions, the station name had to be copied into a new vector/array in order to use it, and looking at an updated [flamegraph](flamegraph5.svg), 17% of the run time is spent in `StationName::from<&[u8]>`, which consists of copying the slice into the 32 byte array.  
Instead, I want to store a reference to the slice instead of copying it.  
This also allows arbitrarily long station names, and not only 32 bytes long ones(despite the longest possible name from the generator is shorter than 32 bytes, the rules specify up to 100 bytes should be supported).

So I converted `StationName` to simply hold a reference to the slice:
```rust
// station_name_slice.rs
#[derive(Eq, PartialEq)]
struct StationName<'a>(&'a [u8]);

impl<'a> Hash for StationName<'a> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        let mut num = 0u64;
        for c in &self.0[..8.min(self.0.len())] {
            num = (num << 8) + *c as u64;
        }
        num.hash(state);
    }
}
```

> [!Important] Impossible Without Mapping
> It is important to note that storing the slices like this was impossible when we read the file using `BufReader`, since the line was lost after every iteration.
> But using the mapped file, the slice is always mapped in memory, and even if it is swapped out by the operating system due to low memory, it will be swapped back in like nothing happened when the slice is read.

This solution runs faster, at **25 seconds**:
```bash
Time (mean ± σ):     25.029 s ±  0.203 s    [User: 24.237 s, System: 0.426 s]
Range (min … max):   24.812 s … 25.260 s    10 runs
```

### Fixing Hashing Again - 19.2 seconds

The new `StationName` can't rely on the same method to hash the full 8 bytes, as not all station names have enough bytes, so reading them is both unsafe, and could read part of the following number to compute the hash, which will result in an inconsistent hash.  
And a [new flamegraph](flamegraph6.svg) shows that the byte by byte hashing is again very slow, taking 9.6% of the time.  
To solve that, one solution is to notice that all possible station names *are* at least 3 bytes, and with the separating `;` character, the first 4 bytes are consistent for the same station.  
So by taking the `;` along with the character(and stripping it during printing), hashing 4 bytes at a time is possible.  
```rust
// station_name_slice.rs
fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
    let ptr = self.0.as_ptr() as *const u32;
    unsafe { ptr.read_unaligned() }.hash(state);
}
```
The run time has now improved to **19.2 seconds**:
```bash
Time (mean ± σ):     19.216 s ±  0.033 s    [User: 18.747 s, System: 0.416 s]
Range (min … max):   19.179 s … 19.258 s    10 runs
```

And looking at the [flamegraph](flamegraph7.svg), `make_hash` shrunk to just 1.7%.

The issue with this hash implementation is that despite the shortest possible station name created by the generator being 3 bytes long, the rules actually specify that that length of a name can be as short as 1 byte.  
Adding a fallback that hashes the name byte by byte if it is too short does affect the performance even if the branch predictor should perfectly predict it:
```bash
Time (mean ± σ):     19.510 s ±  0.098 s    [User: 18.772 s, System: 0.412 s]
Range (min … max):   19.386 s … 19.632 s    10 runs
```
To keep things more interesting, I will be making the assumption that station names are between 3 and 26 bytes, as they are in the possible generated names.  

## Optimizing Line Splitting Again - 15.1 seconds

The optimizations made since adding the usage of `memchr` made its relative time grow to 22.1%, so it is probably time to take another look at it.  
Taking another look at out assumptions opens up the next optimization:  
The longest possible station name has 26 bytes, and the longest measurement has 5 bytes, along with the `;` and `\n`, we get 33 bytes at most per line.  
Additionally, we know the shortest station name is 3 bytes, so we really only need to look at 30 bytes, but that is actually not important with this optimization.  
Fortunately, most modern machines have 256-bit SIMD registers, which are 32 bytes, enough to fit an entire line.

> [!Note] SIMD
> SIMD stands for "Single Instruction, Multiple Data", and it refers to a set of registers available on most CPUs that are capable of applying computations to multiple values at once, each taking only a part of the register. These registers can have different sizes depending on the CPU architecture.  
> For example, 256-bit SIMD registers can fit 32 1 byte values, 16 2 byte values, 8 4 byte values, or 4 8 byte values.  
> Common operations supported by SIMD registers are operations such as load, store, addition,comparison, etc.
> In this case we are working with `u8` values, so I'll be using the 256-bit SIMD register for 32 `u8` values at once.
> The group of values stored in a SIMD register are often also called a vector.

`memchr` already uses SIMD for its searching, but it does not know that the values I'm searching for will *always* be within the first 33 bytes.  
To find a byte within a SIMD register containing the line, we need to compare it to another SIMD register containing the byte we are searching for at every position:

### Using SIMD Intrinsics In Rust

There are a few ways to use SIMD in Rust, the two main ways are:

- `std::simd`: a portable SIMD module that uses a generic `Simd<T,N>` type to represent all SIMD variables, and compiles them to the best available native SIMD types depending on the compilation flags(I have set `-Ctarget-cpu=native`, so it should be using the 256-bit registers that are available).  
  These portable types have 2 downsides: The first is that they only have a subset of the available operations, since they must work on supported platform and not just one specific extension. And the second is that they are nightly only and require a feature flag.
 - `core::arch`: A module containing modules for every supported architecture, such as `x86_64` or `arm`, each containing the available SIMD intrinsics for that architecture.  
  Even within a specific architecture there is a separation between different extensions, since some operations are only available on a specific extension of a specific architecture.

This time I chose to use `core::arch`.  
To actually use these instructions we must tell the compiler that our machine has the required capabilities:
```rust
// use_simd.rs
#[cfg(target_feature = "avx2")]
#[target_feature(enable = "avx2")]
fn read_line(text: &[u8]) -> (&[u8], &[u8], &[u8]) {
    todo!()
}
```

`#[cfg(target_feature = "avx2")]` causes the function to only be compiled if the feature is enabled, and `#[target_feature(enable = "avx2")]` allows using AVX2 operations inside the function without `unsafe`
So now we can to use any SIMD operation that requires the `AVX2`(or any of the extensions it is a superset of, such as `SSE` and `AVX`) inside the function.

I am not planning to run this code on any machine that does not support `AVX2`, but I might as well support doing that.  
We can put the old parsing code in a function that will only be compiled if `AVX2` is *not* available:

```rust
// use_simd.rs
#[cfg(not(target_feature = "avx2"))]
fn read_line(mut text: &[u8]) -> (&[u8], &[u8], &[u8]) {
    let station_name_slice: &[u8];
    let measurement_slice: &[u8];
    (station_name_slice, text) = text.split_at(memchr(b';', &text[3..]).unwrap() + 3);
    text = &text[1..]; //skip ';';
    (measurement_slice, text) = text.split_at(memchr(b'\n', &text[3..]).unwrap() + 3);
    text = &text[1..]; //skip \n;
    (text, station_name_slice, measurement_slice)
}
```

### Finding Bytes With SIMD

In this section, I'll be using the longest line in my input file:

First, comparing it to a SIMD full of `;`:

```rust
let separator: __m256i = _mm256_set1_epi8(b';' as i8);
let separator_mask = _mm256_cmpeq_epi8(line, separator);
```

```
L a s   P a l m a s   d e   G r a n   C a n a r i a ; - 1 0 . 4
‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖
; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ; ;
↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓
0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 
```

The result is a SIMD full of 0s and a single 1 at the position of the `;` we are looking for.

Next, the result is converted from a SIMD vector to a `u32`:

```rust
let separator_mask_u32 = _mm256_movemask_epi8(separator_mask);
```

Now the position is encoded in a `u32` and not a 256-bit register, so we can use `trailing_zeroes` to get the actual position:
```rust
let separator_pos = separator_mask_u32.trailing_zeroes();
```

`trailing_zeroes` returns the amount of consecutive 0 bits there are in the value starting from the least significant bit.


> [!Important] Trailing Or Leading?
> When first writing this code I accidentally used `leading_zeroes`, because I expected the `u32` to look the same as the SIMD register but packed, but the `u32` stores the bits from least to most significant, so the `u32` is actually mirrored from how the SIMD register looks.

Finding the position of the `\n` is the same, but it is worth nothing that if the line is of the maximum length of 33, the `\n` will not appear in the loaded SIMD.  
But that is okay, because this check will return a mask of all 0s, which means `trailing_zeroes` returns 32, the correct position.  
If the longest line was longer than 35 bytes(because we could skip the first 3 if needed), this method would not work.

The full function looks like this:
```rust
// use_simd.rs
#[cfg(target_feature = "avx2")]
#[target_feature(enable = "avx2")]
fn read_line(text: &[u8]) -> (&[u8], &[u8], &[u8]) {
    let separator: __m256i = _mm256_set1_epi8(b';' as i8);
    let line_break: __m256i = _mm256_set1_epi8(b'\n' as i8);
    let line: __m256i = unsafe { _mm256_loadu_si256(text.as_ptr() as *const __m256i) };
    let separator_mask = _mm256_movemask_epi8(_mm256_cmpeq_epi8(line, separator));
    let line_break_mask = _mm256_movemask_epi8(_mm256_cmpeq_epi8(line, line_break));
    let separator_pos = separator_mask.trailing_zeros() as usize;
    let line_break_pos = line_break_mask.trailing_zeros() as usize;
    (
        &text[line_break_pos + 1..],
        &text[..separator_pos],
        &text[separator_pos + 1..line_break_pos],
    )
}
```

As is, there is UB here, since reading the last line can go past the memory of the slice, to fix this I mapped a 32 extra bytes so I can read and ignore them without UB:

```rust
// use_simd.rs
fn map_file(file: &File) -> Result<&[u8], Error> {
    let mapped_length = file.metadata().unwrap().len() as usize + 32;
    ...
}
...
while (remainder.len() - 32) != 0 {
  ...
```

> [!Warning] Undefined Behaviour
> Undefined behaviour(or UB), refers to code whose execution is not defined by the programming language, for example, reading and writing to arbitrary memory locations.  
> When a piece of code contains UB, the compiler is allowed to do many things, including crash, silently ignore it, or do any other read/write.computation.  
> In this case, I am reading past the end of the array, which is considered UB.  
> If the end of the array happens to be at the end of a memory page, it is very likely that the program will crash when trying to load the last line.

The new version is faster, running for **14.9 seconds**:
```bash
Time (mean ± σ):     14.938 s ±  0.104 s    [User: 14.500 s, System: 0.400 s]
Range (min … max):   14.788 s … 15.144 s    10 runs
```

An updated [flamegraph](flamegraph8.svg) shows that the time to read and split a line has shrunk from 22.1% to 9.1%.

## Revisiting The Hash Map: Faster Comparison - 11.3 seconds

The flame graph now shows 2 major potential spots for improvement:

- `parse_measurement`: takes 16% of the time, it should be possible to improve with some very complicated SIMD code.
- `[u8]::eq`(called inside the hash map): takes 33% of the time, might be possible to improve it by comparing using SIMD if the standard implementation does not already do it, and might be possible to improve it by simply calling it less, which means reducing the amount of collisions in the hash map.

I decided to look into the slice comparisons first.  
Until now I have only looked at replacing the entire hash map and making hashing faster, but another part of the operations of the hash map is comparing keys directly to find the correct item. This includes calling `[u8]::eq` at least once per lookup, and there is a huge amount of lookups in the program.
In an attempt to reduce collisions, I tried preallocating the hash map with more capacity than it has at the end of the run, so I set it to 1024.  
The run time did appear to very slightly improve, to **14.7 seconds**:
```bash
Time (mean ± σ):     14.693 s ±  0.038 s    [User: 14.257 s, System: 0.399 s]
Range (min … max):   14.603 s … 14.740 s    10 runs
```
But looking at a flamegraph, the time spent comparing did not change, and there was never a significant time spent reallocating to begin with.  
So I tried increasing the capacity to a more extreme value of `2**20`, which slowed it down, and still did not change the time taken by comparisons.  
So there are probably not as many collisions as I thought there are to begin with.  
I am not sure what exactly caused the time to improve, and counting cycles with `perf stat -e cycles` also confirms that the version preallocating with a capacity of 1024 consumed less cycles, and `perf stat`(the default metrics) shows that it has 0.2% less branch mispredictions, so I am going to keep it like that.  
Other values for the capacity lead to an equal or worse time.

So instead of reducing the amount of comparison, I need to make every comparison faster.  
We know that we can fit every station name in a 256-bit SIMD register, but AVX2 does not have operations that select which bytes to load(which are known as masked operations), which are only available in the newer AVX512.

Fortunately, we know that there are 32 bytes to read from the start of every station name, so we could load them all and simply ignore the irrelevant ones.  
The problem with doing that is that simply loading 32 bytes when the slice might be shorter than 32 bytes is undefined behaviour, even if we know that the slice came from a bigger slice that *does* allow this wide load.  

To solve this issue, I had to turn the `StationName` struct into a pair of pointer and a length:
```rust
// simd_eq.rs
struct StationName {
    ptr: *const u8,
    len: u8,
}

impl Hash for StationName {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        let ptr = self.ptr as *const u32;
        unsafe { ptr.read_unaligned() }.hash(state);
    }
}
impl From<StationName> for String {
    fn from(StationName { ptr, len }: StationName) -> Self {
        let slice = unsafe { from_raw_parts(ptr, len as usize) };
        String::from_str(std::str::from_utf8(slice).unwrap()).unwrap()
    }
}
```

So now I need to implement `Eq` myself:  
First we need to verify that both names are the same length, this also allows us to exit early if they are not:
```rust
if self.len != other.len {
    return false;
}
```

Then we load both names:

```rust
let s = unsafe { _mm256_loadu_si256(self.ptr as *const __m256i) };
let o = unsafe { _mm256_loadu_si256(other.ptr as *const __m256i) };
```

And then we create a mask of only the bytes we care about:
```rust
let mask = (1 << self.len) - 1;
```
For example, for a name with a length of 5, it will create the mask `0b00000000000000000000000000011111`.

And create a `u32` that says exactly which bytes differ:
```rust
let diff = _mm256_movemask_epi8(_mm256_cmpeq_epi8(s, o)) as u32;
```

Which looks something like this:

```
A l e x a n d r a ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ?
‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖
A l e x a n d r i a ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ?
↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓
1 1 1 1 1 1 1 1 0 ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ?
```

With the `?` being unknown values that we do not care about. Remember that integers are stored in little-endian order, which means the result is stored in reverse order in `diff`.  

And finally, combining the mask and the difference value tells us whether the names are the same:
```rust
diff & mask == mask
```

So the full function looks like this:
```rust
// simd_eq.rs
impl StationName {
    #[cfg(target_feature = "avx2")]
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
}
impl PartialEq for StationName {
    fn eq(&self, other: &Self) -> bool {
        unsafe { self.eq_inner(other) }
    }
}
```

In this case I have to use an extra function for the conditional compilation because `eq` is defined by the trait to be safe, and conditional compilation functions are always unsafe, so this is the solution.

Testing the run time again shows an impressive improvement, down to **11.3 seconds**:
```bash
Time (mean ± σ):     11.337 s ±  0.005 s    [User: 10.899 s, System: 0.410 s]
Range (min … max):   11.330 s … 11.343 s    10 runs
```

## Branch-Less Measurement Parsing - 8.38 seconds

At this stage I wanted to check how much of the time the program waits for data to come from memory using `perf stat -M TopDownL2`, and instead of a very high `tma_memory_bound` which indicates that, I saw:
```
3.1 %  tma_memory_bound       
33.2 %  tma_branch_mispredicts
```
Which indicates that only 3.1% of the time is spent waiting for memory, and an extremely high 33.2% of the time is wasted on branch mispredictions.  
Running a plain `perf stat` with the default metrics(which include branch mispredictions), show that 3.3% of branches were mispredicted, that is usually a very high number.  
To see exactly where the mispredictions happen, I used `perf record -e branch-misses:pp` to generate a profile showing which branches specifically were mispredicted often.

The generated report shows 3 major spots where branch mispredictions occur:

The first is checking for the `.` before the decimal number, contributing 45% of the branch misses:
```asm
Percent │
        │     if text[1] == b'.' {
        │     ↓ jmp          43e
   0.01 │3d0:   cmp          $0x1,%esi
        │     ↓ je           aea
        │       movzbl       0x1(%rax),%r9d
  42.66 │       cmp          $0x2e,%r9b
   2.67 │     ↓ jne          450
```

The second is the length comparison when comparing station names, contributing 25% of the branch misses:
```asm
Percent │
        │     if self.len != other.len {
   3.68 │    ┌──cmp          %bpl,-0x18(%rdi)
  21.73 │    ├──jne          22a
```

And the third is again in the measurement parsing, checking if the measurement is negative, contributing another 25% of the misses(there is another copy of these instructions later with another 4%):
```asm
Percent │
        │     if text[0] == b'-' {
        │       movzbl       (%rax),%r8d
  21.28 │       cmp          $0x2d,%r8b
   0.16 │     ↓ jne          3d0
```

This makes sense as we've seen that it now makes up a more significant amount of the time, and it contains two very hard to predict branches.

There is no way I can think of to eliminate the length comparison. Even if there was, it is an early-exit branch, so any other method will likely be slower.  

One way to eliminate the cost of branch mispredictions is to write branch-less code, which means writing code that contains no branch instructions while achieving the same result.  
Branch-less code is often harder to write, and is sometimes slower than the branching version when the branch is predicated well by the CPU, but this is not the case here.  
One useful tool for branch-less programming is the conditional move instruction.  

### The Conditional Move Instruction

The `cmov` instruction(and its variants), take 2 parameters: 1 destination register and 1 source register, and it copies the value of the source register if the last comparison done was true by checking the comparison flag in the CPU.  
Usually there is no need to explicitly write this instruction, and instead we write in a way that encourages the compiler to use it, for example:

```rust
let bonus = if team = TEAM::BLUE{
  5
}else{
  10
}
```

is one way to encourage the compiler to use `cmov`.  
In other languages, ternary operators(which do not exist in Rust) achieve a similar result, and sometimes using an array of size 2 and indexing into it also helps achieve this:

```rust
let bonus_options = [10,5];
let bonus = bonus_options[(team==TEAM::BLUE) as usize];
```

Alternatively, multiplying by a boolean cast to a number often achieves a similar result:

```rust
let bonus = 10-(5*(team==TEAM::BLUE as i32));
```

Conditional moves have 2 downsides compared to normal branches:

- They are limited to moving values, and can't do the general flow control normal branches can.
- They create a data dependency chain in the CPU, unlike normal branches.

Data dependencies are a complicated topic that in this case they boil down to the following example:  
Consider the following code:
```rust
fn calc_points(player_id: u32, player_team: Team, winning_team: Team, base_points: i32){
  if player_team == winning_team{
    let player_data: Player = get_player_data(player_id);
    base_points + player_data.winner_bonus
  }else{
    base_points
  }
}

```

We have 2 ways to compile this code:  
If this code is compiled into a branch that chooses one of the paths, into effectively the following pseudo-assembly:
```
move base_points to register1
compare player_data,player_team
if not equal jump to "lost"
move player_data.winner_bonus to register2
add register2 to register1
lost: return register1
```
This pseudo-assembly contains a single jump that skips getting the player data(represented as just getting the bonus here), and adding it to the base points.

The time spent on this function is the following:

- The ratio of the time the player's team won multiplied by the time to get their data and add it to the base points and returning
- The ratio of the time the player's team lost multiplied by the time to return the base points.
- The time spent recovering from branch mispredictions.

And if we compile the code using a conditional move instead, we could get the following pseudo-assembly:
```
move base_points to register1
move base_points to register2
move player_data.winner_bonus to register2
compare player_data,player_team
if equal move register2 to register1
return register1
```
No branches required, so the time spent on this function is always the same, which always includes getting the player data, but never includes any branch mispredictions recovery time.

Now consider the following:  
- If whether the player won can't be well predicated by the CPU, the time spent recovering from branch mispredictions is going to be very large.
- If whether the player won *is* well predicated by the CPU, the time spent recovering will be small.
- If the time to get a player's data is small enough, we could do it even when it is not needed without significantly hurting performance.
- If the time to get a player's data is large, getting it even when it is not required could significantly hurt performance.

So depending on these factors, we should guide the compiler what to do.

### Implementing A Branch-less Measurement Parser

In this case, after a lot of trial and error, the branch-less solution I found was the following:
```rust
// branchless_measurement.rs
fn parse_measurement(mut text: &[u8]) -> i32 {
    unsafe { assert_unchecked(text.len() >= 3) };
    let negative = text[0] == b'-';
    if negative {
        text = &text[1..];
    }
    unsafe { assert_unchecked(text.len() >= 3) };
    let tens = [b'0', (text[0])][(text.len() > 3) as usize] as i32;
    let ones = (text[text.len() - 3]) as i32;
    let tenths = (text[text.len() - 1]) as i32;
    let abs_val = tens * 100 + ones * 10 + tenths - 111 * b'0' as i32;
    if negative { -abs_val } else { abs_val }
}
```

The 3 main changes here are:

- Branch-less calculation of the tens digit via an array.
- Utilizing the fact that the last and third to last are always the tenths and the ones digits respectively.
- Mathematically rearranging the `0` subtraction to occur in one instruction.

> [!Note] Why `assert_unchecked`?
> Unless the Rust compiler can guarantee a given index is within a slice, it will always emit a bounds checking comparison.  
> This comparison will jump to some panicking code if it fails.  
> But a correct program will never fail the bounds check, we just need to give the compiler a few hints.  
> We know that any measurement has at least 3 bytes in the slice, so we can tell that to the compiler using `unsafe { assert_unchecked(text.len() >= 3) };
`.  
> After the negative number check, if the number *is* negative, it was actually at least 4 bytes long to begin with, so it is now at least 3 byte long, and otherwise, it did not change so it is still at least 3 bytes.  
> But the compiler does not know that, so we need to tell it again using the 2nd `assert_unchecked`.  
> And that finally eliminates all bounds checking in the function.  
> Replacing all indexing in the function with `unchecked_get` would have achieved a similar result but less cleanly.  
> I have also tried incorporating the "at least 4 if negative" property within the first `assert_unchecked` using `assert_unchecked(text.len() >= (3 + (text[0] == b'-') as usize));
`, but it did not have the desired effect.

The generated assembly does not contain the offending branches anymore, and it contains many `cmov` instructions:

```asm
let negative = text[0] == b'-';
  movzbl       0x0(%rbp,%rax,1),%eax
  xor          %r9d,%r9d
  cmp          $0x2d,%al
  sete         %r9b
if negative {
  sub          %r9,%rsi
  lea          (%r8,%r9,1),%r10
let tens = [b'0', (text[0])][(text.len() > 3) as usize] as i32;
  movzbl       (%r9,%r8,1),%r8d
  movb         $0x30,0x90(%rsp)
  mov          %r8b,0x91(%rsp)
  cmp          $0x4,%rsi
  lea          0x90(%rsp),%r8
  sbb          $0xffffffffffffffff,%r8
  movzbl       (%r8),%r8d
let ones = (text[text.len() - 3]) as i32;
  movzbl       -0x3(%rsi,%r10,1),%r9d
let tenths = (text[text.len() - 1]) as i32;
  movzbl       -0x1(%rsi,%r10,1),%esi
let abs_val = tens * 100 + ones * 10 + tenths - 111 * b'0' as i32;
  imul         $0x64,%r8d,%r8d
  lea          (%r9,%r9,4),%r9d
  lea          (%r8,%r9,2),%r8d
if negative { -abs_val } else { abs_val }
  mov          $0x14d0,%r10d
  sub          %r8d,%r10d
  sub          %esi,%r10d
let negative = text[0] == b'-';
  cmp          $0x2d,%al
if negative { -abs_val } else { abs_val }
  lea          -0x14d0(%rsi,%r8,1),%ebx
  cmove        %r10d,%ebx
```

Now `perf stat` reports that `tma_branch_mispredicts` is down to 12.9% and the misprediction rate is down to 1.6%, and 91.6% of them are the length comparisons in the name comparison function.

But more importantly, the new run time of the program is faster, taking **8.54 seconds**.

```bash
Time (mean ± σ):      8.383 s ±  0.007 s    [User: 7.970 s, System: 0.391 s]
Range (min … max):    8.374 s …  8.394 s    10 runs
```
This time I ran `hyperfine` with 1 warm-up run and 50 measurement runs to get it accurate enough to compare with the next benchmark.


## Faster Min/Max: Replacing Branch-less With Branching - 8.21 seconds

In contrast to what we just did in the measurement parsing, the minimum and maximum functions used to keep the lower and highest measurement per station already use the branch-less `cmovl`(move if less) and `cmovg`(move if greater) instruction, and they take 7% of the runtime of the entire program:
```asm
Percent │     if other < self { other } else { self }
   0.01 │       cmp          %eax,%ebx
   3.48 │       cmovl        %ebx,%eax
        │     *min = (*min).min(measurement);
   0.03 │       mov          %eax,-0x10(%r8)
        │     *sum += measurement;
        │       add          %ebx,-0xc(%r8)
        │     if other < self { self } else { other }
   3.48 │       cmp          %edx,%ebx
   0.01 │       cmovg        %ebx,%edx
        │     *max = (*max).max(measurement);
```
But we know that finding a new lowest or largest values will not happen often:  
There are only 2000 possible measurements, so no matter what the measurements are, it is impossible to update the min/max more than 2000 times each. And considering there are only a few hundred stations and a billion lines, each station appears millions of times, so only a fraction of them need to update the min/max values.  
Furthermore, with random measurements, the number of total updates will be *even smaller* as statistically the chance to beat the current measurement gets lower every time it is updated(half as likely after every update on average, leading to an average amount of updates of `log2(N)` for `N` lines).  
This low amount of updates will allow the CPU to correctly predict that the value should not be updated almost every time.

Replacing the two lines with:
```rust
// branching_minmax.rs
if measurement < *min {
    *min = measurement;
}
if measurement > *max {
    *max = measurement;
}
```
Causes the conditional moves to be replaced with branches and improves the run time slightly.  
It gets harder to measure such small differences, but the increased amount of runs allows us to maintain statistical certainty that this version is faster(can be seen from the previous result being outside the deviation and range of the new result).

```bash
Time (mean ± σ):      8.215 s ±  0.009 s    [User: 7.804 s, System: 0.390 s]
Range (min … max):    8.203 s …  8.236 s    10 runs
```

## New Allocator - 8.17 seconds

This section is for smaller, unconnected changes that helped push the solution a little bit more.

Replacing the global allocator with `jemalloc` makes the code very slightly faster:
```bash
Time (mean ± σ):      8.165 s ±  0.007 s    [User: 7.743 s, System: 0.402 s]
Range (min … max):    8.151 s …  8.176 s    10 runs
```

## Rewriting The Measurement Parsed Again - 8.02 seconds

I was still unsatisfied with the performance of `parse_measurement`, so I tried implementing it using a different approach: a lookup table.

### Lookup Tables

Lookup tables are used to pre-compute answers ahead of time and store the in an easily accessible form.  
For example, if we had some particularly expensive function `expensive(num:u16)` that we call often, the simple solution would simply call it every time:

```rust
fn calc_thing(item: Item) -> u64{
  expensive(item.group_id)
}
```

But if we know that the input to `expensive` is relatively limited, we can pre-compute every possible result:
```rust
fn calc_thing(item: Item) -> u64{
  static lookup_table: [u64;u16::MAX as usize] = {
    let mut lookup_table = [0u64;u16::MAX as usize];
    let mut i = 0usize;
    while i < u16::MAX as usize{
      lookup_table[i] = expensive(i);
      i+=1;
    }
  }
  lookup_table[item.group_id as usize]
}
```

Notice that `lookup_table` is a static, which means it is computed at compile time and stored in some global location in the binary.  
So when `calc_thing` is called, the only thing it is doing is read a value from `lookup_table` and return it.

### Parsing With A Lookup Table

Unfortunately, we can't just take the 5 relevant bytes from the slice that contains the number and index into an array, since the table for that would be a terabyte in size.  
Fortunately, not all bits in those 5 bytes matter to us, and we can also deduce whether the number is positive or negative and then only parse positive numbers based on the remaining 4 bytes.  

Looking at the binary representation of the digits and the decimal dot:
```
00101110 .
00101111 /
00110000 0
00110001 1
00110010 2
00110011 3
00110100 4
00110101 5
00110110 6
00110111 7
00111000 8
00111001 9
```
We can see that the least significant 4 bits in every byte are the only ones that are relevant, so by taking 4 bits from each of the 4 bytes, we reduces the amount of items needed in the table to 65536, and using a `u16` for each we only need 128KiB to store the entire table.  

To quickly take the first 4 bits from every byte, I used the `pext` instruction, which takes a mask of relevant bits, and returns the relevant bits packed together, for example with the number `45.1`:
```
4       5       .       1
00110100001101010010111000110001
```
Reading it is a `u32` reverses the byte order because the computer stores numbers in little-endian order, so after reading is is actually `00110001001011100011010100110100`.  
And then with the mask `00001111000011110000111100001111`, `pext` returns the output `0001111001010100`, which will be used as the index into the lookup table.

So the full code for the new parsing function is:

```rust
fn parse_measurement(text: &[u8]) -> i32 {
    static LUT: [i16; 1<<16] = {
        let mut lut = [0; 1<<16];
        let mut i = 0usize;
        while i < (1<<16) {
            let digit0 = i as i16 & 0xf;
            let digit1 = (i >> 4) as i16 & 0xf;
            let digit2 = (i >> 8) as i16 & 0xf;
            let digit3 = (i >> 12) as i16 & 0xf;
            lut[i] = if digit1 == b'.' as i16 & 0xf {
                digit0 * 10 + digit2
            } else {
                digit0 * 100 + digit1 * 10 + digit3
            };
            i += 1;
        }
        lut
    };
    let negative = unsafe { *text.get_unchecked(0) } == b'-';
    let raw_key = unsafe { (text.as_ptr().add(negative as usize) as *const u32).read_unaligned() };
    let packed_key = unsafe { _pext_u32(raw_key, 0b00001111000011110000111100001111) };
    let abs_val = unsafe { *LUT.get_unchecked(packed_key as usize) } as i32;
    if negative { -abs_val } else { abs_val }
}
```

Some things to note:

- The code to compute every result is ran at compile time, and it only runs 64K times and not a billion times, so it does not have to be particularly optimized.
- The table has a huge amount of indices that are not actually valid numbers and will never be read, but there is no way to remove them without making the indexing into the table more complicated.

The new parser is much faster:

```bash
Time (mean ± σ):      8.018 s ±  0.012 s    [User: 7.599 s, System: 0.399 s]
Range (min … max):    7.999 s …  8.033 s    10 runs
```

Next, I tried making another memory trade off, by storing the negative measurements in the table as well and incorporating the `negative` boolean into the index, making it twice as big but saving the inversion step:
```rust
fn parse_measurement_(text: &[u8]) -> i32 {
    static LUT: [i16; 1 << 17] = {
        let mut lut = [0; 1 << 17];
        let mut i = 0usize;
        while i < (1 << 16) {
            let digit0 = i as i16 & 0xf;
            let digit1 = (i >> 4) as i16 & 0xf;
            let digit2 = (i >> 8) as i16 & 0xf;
            let digit3 = (i >> 12) as i16 & 0xf;
            lut[i] = if digit1 == b'.' as i16 & 0xf {
                digit0 * 10 + digit2
            } else {
                digit0 * 100 + digit1 * 10 + digit3
            };
            lut[i + (1 << 16)] = -lut[i];
            i += 1;
        }
        lut
    };
    let negative = (unsafe { *text.get_unchecked(0) } == b'-') as usize;
    let raw_key = unsafe { (text.as_ptr().add(negative) as *const u32).read_unaligned() };
    let packed_key = unsafe { _pext_u32(raw_key, 0b00001111000011110000111100001111) };
    unsafe { *LUT.get_unchecked(packed_key as usize + (negative << 16)) as i32 }
}
```

But the result was very slightly slower:
```bash
Time (mean ± σ):      8.030 s ±  0.008 s    [User: 7.616 s, System: 0.393 s]
Range (min … max):    8.020 s …  8.051 s    25 runs
```

## Optimizing The Output For No Benefit

The simple `print!` calls in Rust obtain a lock to access the underlying `stdout`, which they release immediately after printing.  
Rewriting the printing section to obtain and release the lock only once across the entire section should make it faster, but it is already a non-measurable amount of the time of the program:
```rust
// final_single_thread.rs
let mut out = std::io::stdout().lock();
let _ = out.write_all(b"{");
for (station_name, min, avg, max) in summary[..summary.len() - 1].iter() {
    let _ = out.write_fmt(format_args!("{station_name}={min:.1}/{avg:.1}/{max:.1}, "));
}
let (station_name, min, avg, max) = summary.last().unwrap();
let _ = out.write_fmt(format_args!("{station_name}={min:.1}/{avg:.1}/{max:.1}, "));
```
As expected, there is no measurable difference in the run time.

## Failed Optimizations

While solving this challenge I have attempted some optimizations that did not result in any improvement or even a regression so they did not make it into the post until now, but some are still worth mentioning:

- I tried to get the file to be mapped onto huge pages in memory, which should be possible with the correct setup, but nothing I tried made it happen.
- I tried to find a way to completely skip parsing and find max/min/sum without parsing the measurement so I could parse once at the end, but I could not come up with any way that doesn't come with a slow down.
- I found that 90% of the lines are shorter than 16 bytes, which means I can fit at least 2 lines in a single 32 byte SIMD to potential speed up the line reading.  
  Unfortunately, the more complex flow in `line_read` that included a loop that parses a line for every 1 in the resulting mask caused a slowdown of a few seconds.
- Creating the different slices from each line generated a bounds check, which I wanted to eliminate, but adding another `assert_unchecked` did not have an effect, and replacing the slice creation with an `unchecked_get` version resulted in a slowdown of a second and a half I could not explain, and it is not worth exploring it just to save 2 instructions that do not take any significant time.
- I tried using PGO(Profile Guided Optimizations) for a "simple" optimization, but that resulted in a slowdown of around a tenth of a second.
- I was not satisfied with the performance of `parse_measurement`, and thought I could beat the compiler with hand written inline assembly, but the result was tens of milliseconds behind the compiler's version.

## Final Single Threaded Results - 5.9 seconds

In this very long post I have improved my solution for the one billion row challenge from over a minute to under 10 seconds, using a lot of different optimization methods.  
To end this part of the challenge, I will run the benchmark again, without the CPU locked to a stable 3.5GHz to get it even faster:
```bash
PLACEHOLDER, NEED NEW MEASUREMENT
Time (mean ± σ):      6.138 s ±  0.061 s    [User: 5.818 s, System: 0.300 s]
Range (min … max):    5.982 s …  6.322 s    25 runs
```
And the final flamegraph for the solution looks like [this](flamegraph_final.svg)

In my next post I will improve the performance further by utilizing multiple threads.
