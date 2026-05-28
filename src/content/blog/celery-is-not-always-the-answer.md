---
title: "Celery Is Not Always the Answer: A Real Comparison of Python Task Queues"
date: 2026-05-25
description: "I migrated from ARQ to Celery at work. During that process I tested every serious Python task queue out there. Here's what the benchmarks say, and what they don't."
tags: ["python", "fastapi", "celery", "redis", "benchmarks"]
draft: false
---

## Why I wrote this

At work, we were using ARQ as our task queue in the main backend API, it
worked fine as all that API was async. Some months ago I realized that ARQ
is in maintenance-only mode, no new features and no active development. For
a production system that was a risk because there is no long term safety.

So we migrated to Celery. We were using Celery in some microservices so
that was a big reason for compatibility. Celery is not the obvious best
choice but is the safe default. Everyone uses it, there's an answer for
every problem on Stack Overflow, it's battle tested, and it's not going
anywhere.

But during that migration I started looking at what else was out there.
Dramatiq, Taskiq, Streaq, libraries I'd heard of but never seriously
evaluated. And I couldn't find a single honest comparison that was not made
by the own organization. Most posts are either tutorials or surface-level
overviews with no real benchmark data.

So I tested all of them myself. Same workload, same environment, real
numbers. This is what I found.

---

## The contenders

### Celery
The de facto standard for task queues in Python. Mature, battle tested, and
backed by a large community. Supports multiple brokers (Redis, RabbitMQ) and
has an answer for almost every edge case. The safe choice, but not always
the right one.

### ARQ
Built for async Python from the ground up. Redis-only, simple API, and very
easy to integrate with FastAPI. The problem: it's in **maintenance-only mode**.
No new features, no active development. If you're starting a new project,
think twice.

That said, it still works great. Maintenance-only doesn't mean broken. If
you're already running ARQ and it's doing its job, there's no urgency to
migrate. We did it because we wanted long term safety, not because ARQ was
failing us.

### Dramatiq
A serious Celery alternative that fixes some of its rough edges. Simpler API,
better defaults, and more predictable behavior. Less ecosystem around it, but
the code quality is solid and it's actively maintained.

### Taskiq
The modern async-first option. Built with FastAPI and async Python in mind,
with a broker-agnostic design. Younger than the others, but the direction
is right.

### Streaq
The newcomer. Fast, fully typed, async-native, built on Redis streams. Claims
up to 5x faster than ARQ. Small but opinionated in the right ways, and that
built-in web UI for monitoring is a nice touch.

---

## The benchmark setup

All benchmarks are available in this repo: **[python-task-queue-benchmarks](https://github.com/17tayyy/python-task-queue-benchmarks)**.
Every number in this post can be reproduced on your machine.

### Environment

- Python 3.13, Redis 7 (local)
- 1 worker process, 10 concurrent tasks
- 1000 tasks per run, 3 iterations, final numbers are mean ± std
- Metrics: throughput (tasks/s), latency mean and p99 (ms), memory RSS (MB)

--- 

### Metrics explained

**Throughput**: how many tasks the worker completes per second. Higher is better.

**Latency mean**: average time from when a task is enqueued to when it
finishes. Lower is better.

**Latency p99**: the slowest 1% of tasks. This is the number that really matters:
 your average can look fine while your worst case is on fire.
Lower is better.

**Memory RSS**: resident memory of the worker process during the run.
Lower is better, especially if you're running many replicated workers.

---

### Two scenarios

**cpu_task**: SHA-256 hashing of a 1KB random payload, 1000 iterations.
Measures framing overhead per task, not raw CPU parallelism. All libraries
run under the GIL, so this is a fair comparison of dispatch and scheduling
cost.

**io_task**: `asyncio.sleep(0.1)` for async libraries, `time.sleep(0.1)` for
Celery and Dramatiq. Theoretical ceiling with 10 concurrent workers and
100ms sleep is **100 tasks/s**. How close each library gets tells you how
efficient its concurrency model is.

### A note on configuration

The first run caught two configuration bugs on my end that would have made
the results dishonest:

- **Celery**: `worker_prefetch_multiplier` defaulted to `1`, which capped real
  concurrency to ~1-4 tasks in flight. Set to `10`. Throughput went from
  `12.77 → 54.63` tasks/s on cpu_task.
- **ARQ**: `poll_delay` defaulted to `0.5s`, leaving workers idle half a second
  between fetches. Set to `0.01s`. Throughput went from `20.07 → 84.56`
  tasks/s on io_task.

This is why you should run benchmarks before you publish them.

---

## Benchmark results

All numbers are mean ± std over 3 runs of 1000 tasks each.

### CPU task:

| Library  | Throughput (tasks/s) | Latency mean (ms) | Latency p99 (ms) | Memory (MB) |
|----------|---------------------|-------------------|------------------|-------------|
| streaq   | 251.14 ±2.44        | 1991 ±15          | 3885 ±28         | 53.0        |
| taskiq   | 235.16 ±2.60        | 2105 ±10          | 4160 ±52         | 124.1       |
| arq      | 189.63 ±0.38        | 2605 ±1           | 5181 ±11         | 35.0        |
| dramatiq | 56.35 ±0.89         | 9238 ±156         | 17637 ±257       | 85.8        |
| celery   | 54.63 ±0.44         | 9320 ±114         | 18175 ±199       | 55.2        |

The async-native libraries (streaq, taskiq, arq) are roughly **4× faster**
than the sync ones. This isn't about CPU work, every library runs under the
GIL. What you're measuring here is dispatch and scheduling overhead per task.
If your tasks take more than a few hundred milliseconds each, this gap shrinks
significantly.

### I/O task:

| Library  | Throughput (tasks/s) | Latency mean (ms) | Latency p99 (ms) | Memory (MB) |
|----------|---------------------|-------------------|------------------|-------------|
| taskiq   | 95.90 ±0.11         | 5249 ±3           | 10280 ±5         | 124.1       |
| dramatiq | 90.79 ±3.00         | 5778 ±366         | 10888 ±368       | 87.1        |
| streaq   | 85.70 ±0.93         | 5851 ±104         | 11522 ±129       | 53.2        |
| arq      | 84.56 ±0.55         | 5927 ±21          | 11659 ±77        | 34.9        |
| celery   | 68.10 ±4.19         | 7171 ±220         | 14564 ±941       | 55.8        |

The theoretical ceiling here is 100 tasks/s, 10 concurrent workers each
sleeping 100ms. Taskiq hits 96, dramatiq and the async libraries land between
84-91. Celery reaches 68, losing ground to threading pool overhead even with
prefetch tuned.

### Consistency

One thing the std column tells you that throughput doesn't: **taskiq is
remarkably stable** (±0.11 on io_task). Celery is the least consistent
(±4.19 throughput, ±941ms p99 on io_task). For production systems where
predictable behavior matters as much as raw speed, that's worth noting.

### Memory

arq wins here and it's not close: **35MB against taskiq's 124MB**. If you're
running many replicated workers, that gap compounds fast. 10 workers on
taskiq cost ~900MB more than the same setup on arq. Real numbers on a
cloud bill.

But throughput isn't everything. Here's what the numbers don't show.

---

## Beyond the numbers

Benchmarks tell you how fast a library dispatches tasks. They don't tell you
what it's like to run it in production for months. Here's what the numbers
can't capture.

### Celery

Celery is the only library here with a **complete production ecosystem**. Beat
for scheduled tasks, Flower for monitoring, mature integrations with Django,
FastAPI, Sentry, and practically everything else. When something goes wrong
at 3am, there's a Stack Overflow answer for it. That has real value.

The tradeoff is complexity. Celery has a lot of knobs, and the wrong default
can silently destroy your performance, as the `prefetch_multiplier` bug above
showed. First-time setup is rarely smooth. The documentation is extensive but
dense. For a team that already knows it, Celery is fine. For a team starting
from scratch, expect to spend time on configuration before you see good
results.

### ARQ

ARQ was the easiest library to reason about in this entire comparison. The
API is minimal, the source code is small enough to read in an afternoon, and
integration with async Python is natural. We ran it in a high-traffic async
API for months. It never gave us a reason to worry. **The migration to Celery
wasn't a rescue operation, it was a precaution.**

The problem isn't that ARQ is bad, it isn't. The problem is that it's in
maintenance-only mode. No new features, no active development. For a new
project that will be running in two years, that's a risk you have to
consciously accept.

### Dramatiq

Dramatiq surprised me. The middleware system is genuinely well-designed,
retries, rate limiting, and dead letter queues are first-class concepts, not
afterthoughts. The API is clean and the defaults are more sensible than
Celery's out of the box.

The io_task results were also unexpected: dramatiq landed at **90.79 tasks/s**,
ahead of both streaq and arq in that scenario. A sync library nearly matching
async ones on concurrent I/O is a good sign that its threading model is solid.

The weakness is ecosystem. Less community, fewer integrations, and if you hit
an edge case you're more likely to be reading source code than finding an
answer online.

### Taskiq

Taskiq feels like it was built by someone who uses FastAPI every day. Broker
abstraction, dependency injection, middleware, the design decisions will feel
familiar if you already work in that ecosystem. It also supports multiple
brokers out of the box, not just Redis.

The **124MB memory footprint** is the main thing to watch. If you're running
a single worker, it's irrelevant. If you're scaling to 20+ workers, you're
paying for it.

### Streaq

The newcomer that won the cpu_task benchmark. Fully typed, built on Redis
streams, anyio under the hood so it works with both asyncio and trio. The
built-in web UI for monitoring is a nice touch that more mature libraries
charge you a separate tool for.

The honest caveat: streaq is version 6, but it's **still young in production
years**. The GitHub activity is good and the code quality is solid, but it
hasn't been stress-tested across the variety of edge cases that Celery has
seen over a decade. If you're building something where stability over time
matters more than raw performance, that's worth factoring in.

---

## Decision guide

If you're async-first (FastAPI, aiohttp) and want the best ergonomics
-> **Taskiq**

If you want the fastest dispatcher and don't mind a younger library
-> **Streaq**

If memory per worker is a hard constraint
-> **ARQ**

If you're already running ARQ and it works
-> **Keep ARQ**. There's no urgency to migrate unless you need features
it doesn't have. That's exactly why we migrated, not because it failed us,
but because we wanted long term safety.

If you need scheduled tasks, a mature monitoring UI, or your team
already knows it
-> **Celery**

If you want something simpler than Celery with better defaults
and don't need async
-> **Dramatiq**

If you're processing CPU-heavy workloads that need real parallelism
-> **Celery with prefork**. This benchmark runs everything under the GIL.
For CPU-bound work that actually needs multiple cores, Celery's prefork
worker model is the only one here that gives you that out of the box.

---

The honest summary: for a modern async Python stack, Celery is often chosen
by default when it shouldn't be. But "Celery is not always the answer" doesn't
mean Celery is the wrong answer, it means you should **choose it deliberately,
not by inertia**.

---

## Conclusion

Small verdict for each library:

- **Streaq**: the fastest dispatcher, fully typed, built for modern async
  Python. Young in production years, but technically the strongest option
  if you're starting fresh.

- **Taskiq**: the best developer experience for FastAPI stacks. Slightly
  slower than streaq, significantly more memory, but the ergonomics justify
  it for most teams.

- **ARQ**: lean, simple, and still works great. Maintenance-only is a real
  risk for new projects, but not a reason to migrate if it's already running
  in production.

- **Dramatiq**: underrated. Better defaults than Celery, clean middleware
  system, and a threading model that holds up surprisingly well under
  concurrent I/O. The right choice if you want something between ARQ and
  Celery without going async.

- **Celery**: still the default for a reason. Not the fastest, not the
  simplest, but the most complete. Choose it when you need the ecosystem,
  not because it's the first result on Google.

---

The benchmark repo is at **[python-task-queue-benchmarks](https://github.com/17tayyy/python-task-queue-benchmarks)**.
Every number in this post is reproducible. If you find a configuration
mistake or a better setup for any of these libraries, open an issue.