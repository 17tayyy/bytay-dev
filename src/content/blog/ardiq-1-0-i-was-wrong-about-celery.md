---
title: "ArdiQ 1.0: I Was Wrong About Celery"
date: 2026-08-13
description: "In May I wrote that Celery was the safe default and migrated our backend to it. Three months later Celery broke our async code in production, and we replaced it with the Rust-core queue I'd been building on the side. This is what that cost, and what it taught the queue."
tags: ["python", "rust", "redis", "task-queue", "celery", "benchmarks"]
draft: false
---

In May I published [a comparison of Python task
queues](/blog/celery-is-not-always-the-answer/). I had just migrated our
backend from ARQ to Celery, I benchmarked every serious option while I was at
it, and I closed with this:

> Celery is not the obvious best choice but is the safe default. Everyone uses
> it, there's an answer for every problem on Stack Overflow, it's battle
> tested, and it's not going anywhere.

I want to retract the useful half of that. Everything factual in it still
holds. What was wrong was the conclusion I drew from it: that "safe default"
and "safe for us" were the same sentence.

They weren't. Three months later Celery took down outgoing messages in
production, and today Intake runs on **ArdiQ**, the task queue I've been
writing in Rust, which hits **1.0** with this post.

That's a suspicious story. A guy writes his own task queue and then discovers
his employer needs exactly that queue. So let me be precise about what
actually happened, in what order, and what it cost.

---

## What Celery did to us

Intake is a customer support platform with an AI agent in the middle of it. I
co-founded it and I run its engineering, which is the only reason a decision
like this one was mine to make. The product details don't matter much here;
what matters is that the backend is FastAPI and **every single background task
was already async**. Sending a
WhatsApp reply, running a custom AI action, importing a help-center article:
all coroutines, all talking to services over HTTP.

For scale, so you can weigh the rest of this post: **33 tasks across two
services**, running on ECS Fargate, each worker service autoscaling from 1 to
4 instances, three priority lanes. Not a large deployment. Large enough that
things break in ways a test suite doesn't reproduce, which is the only
property that matters here.

Celery's prefork worker is sync. So every task had to be two functions: the
real coroutine, and a sync shim to drive it.

```python
@celery_app.task(name="deliver_channel_reply")
def deliver_channel_reply_task(...):
    return _run_async(_deliver_channel_reply(...))
```

The first version of that shim used `asyncio.run()`. That works exactly once
per worker process. We have module-level `httpx` clients, one in the
integrations service and one in the custom AI actions, and `asyncio.run()`
closes the loop when it returns, along with everything bound to it. The second
task to land in the same prefork worker got this:

```
RuntimeError: Event loop is closed
```

Outgoing channel replies stopped. Custom AI actions stopped. Not loudly, not
for everyone, and not on the first task, which is the worst combination for
finding it.

The fix was one commit: keep one persistent loop per worker process instead of
creating one per task.

```python
def _run_async(coro):
    loop = _worker_loop()   # created once, reused for the process lifetime
    return loop.run_until_complete(coro)
```

That held. It's the correct workaround and I'd write it again. But look at what
it is: a piece of async lifecycle management, living in our codebase, existing
only because the queue underneath is sync and our code isn't. Every task paid
for it. Every new task had to remember it.

**That's when I stopped defending the decision.** Celery didn't fail because
Celery is bad. It failed because we had asked a prefork sync queue to run an
entirely async codebase, and the seam between those two facts is where our bug
lived. ARQ never gave us that bug. Neither would Taskiq or Streaq.

Which leaves the obvious question, and it's the one I'd ask if I were reading
this: if two maintained async queues would have fixed it, why did we end up on
mine?

---

## Why my own queue, honestly

I'm not going to pretend this was a neutral evaluation.

I'd been building ArdiQ for months. That's what [the PyO3
post](/blog/writing-python-extensions-in-rust-pyo3/) was about. When Celery
gave us a reason to move, I had a queue sitting there that was async-native,
that I understood completely, and that I wanted to put under real load. Both
things were true at once: we needed to leave, and I wanted a user.

So the honest version is: **the migration was a decision I was biased toward,
and I took it anyway**, because the alternative (Taskiq or Streaq, both good)
would have solved the async problem without teaching me anything about my
own queue.

What I'll defend is what happened next. Running your own infrastructure in
production is not a victory lap, it's an audit. Intake found things in ArdiQ
that a green test suite had not. The suite has gone from 98 tests to 179
since, almost entirely because of what it missed. That section is the real
content of this post.

---

## What ArdiQ actually is

A distributed task queue for Python, backed by Redis streams, whose worker
loop and Redis I/O run in Rust.

```python
from ardiq import Ardiq

app = Ardiq(redis_url="redis://localhost:6379", queue_name="emails")

@app.task(max_retries=3)
async def send_welcome(user_id: int) -> None:
    ...
```

```console
$ ardiq run myapp:app
```

The design in one paragraph: the loop, the stream reads, the acks, the reclaim
of dead workers' tasks and every Redis round trip happen on tokio, off the
GIL. Python and Rust meet at exactly one place, an async callback, and the
GIL is held only for the microseconds it takes to start a task and read its
result back. Your task body is plain Python and runs where you'd expect.

That split is also a rule I kept while building it: **Rust is mechanism,
Python is policy**. Retries, cron, serialization, priorities, anything a user
configures per task lives in Python. Cron and abort both shipped with zero
Rust changes, which is the clearest evidence the split is real.

---

## The migration

The best part of the diff is what disappeared.

Before, every task was a sync shim plus a coroutine, with database setup
wrapped around each call:

```python
@celery_app.task(name="rebuild_shop_index")
def rebuild_shop_index_task(shop_id: str):
    return _run_with_db(_rebuild_shop_index(shop_id))
```

After, the task is the function:

```python
@queue.task(name="rebuild_shop_index", priority="low")
async def rebuild_shop_index(shop_id: str) -> None:
    ...
```

`_run_async`, `_run_with_db` and `_run_ai_task` are gone. Mongo is opened once
per worker by a lifespan hook instead of once per task:

```python
@queue.lifespan
async def lifespan():
    await init_db()
    yield
    await close_db()
```

Sentry moved from `CeleryIntegration` to an error hook, which turned out to be
less code and more control:

```python
@queue.on_error
def report(ctx):
    sentry_sdk.capture_exception(ctx.exc)
```

Two things I'd flag for anyone doing the same move:

**Dispatch by name, not by import.** Our API never imports the worker module,
because importing it drags in the entire AI stack. `queue.send("task_name",
...)` enqueues without a registry, so the web process stays small.

**Priority is the producer's decision.** It selects the Redis stream, and a
bare name carries no registry entry, so the producer has to know the lane. We
keep an explicit table mapping each task to one: `high` for anything a
customer is waiting on, `low` for batch rebuilds. There's a unit test that
fails if the table and the decorators drift apart.

Task names didn't change, so the deploy was a straight cutover: drain the
Celery queue, ship, done.

### What it looks like now

Six days of one-minute CloudWatch samples after the migration: **zero minutes
above 50% CPU**, with a **p99 of 1.03% on the worker** and 7.72% on the API.
We halved the CPU allocation on the strength of that, 0.5 vCPU down to 0.25,
and still left roughly 5x headroom.

Two honest notes on those numbers. First, I can't attribute the whole
difference to ArdiQ: the migration also deleted a shim, a per-task database
connect/close cycle and Celery's prefork model, and I didn't measure them
apart. Second, the containers still carry 1 GB of memory and peak at 72% of
it, and that's Mongo, the AI stack and httpx, not the queue. ArdiQ's own resident
footprint is about 33 MB. **Don't read the benchmark's memory column as the
size of your worker.** It's the size of the queue inside it.

The one deploy setting worth copying: we raised the ECS stop timeout from the
default 30 s to 120 s, so a worker gets the full graceful shutdown ArdiQ's
SIGTERM handler is trying to give it, instead of being killed mid-task.

---

## What production found

This is the part I'd want to read.

### Two tasks can have the same name, and one of them just stops existing

The registry was a dict keyed on the function's `__name__`. Register a second
task with a name already taken and it silently replaced the first. No error,
no warning, no log line.

We had `forward_message_to_backend` in the WhatsApp module *and* in the Twilio
module. And `process_help_center_import` in the Drive module *and* in the
help-center module. One of each pair would have gone dead in production, and
the only symptom would have been work that never happened.

Celery avoids this by naming tasks after their module path. I'd picked the
short name because it reads better. It reads better right up until it costs
you a channel.

Registering a taken name now raises, and the error names the module that
already owns it.

### A task with no priority went to the *lowest* lane

Internally the lanes are stored reversed so the drain loop reads
highest-first, and the default fell out of that as the bottom one. With the
documented `["low", "default", "high"]`, the lane literally named `default`
received nothing.

What makes this worse than a plain bug is the direction. Forgetting an
argument **demoted** your work, and demoted work still completes, just later,
behind everything else. Nothing ever tells you. It now defaults to the middle
lane.

### A lane nobody reads reports itself healthy

Related, and nastier. Nothing validated that a priority named a configured
lane. `@app.task(priority="urgent")` on an app with three other lanes wrote to
a Redis stream no consumer ever read.

Then the two things you'd check as an operator lied in opposite directions at
the same time:

```
app.queue_size() : 0          <- the queue looks empty
job.status()     : queued     <- the job says it's waiting
```

Forever, with no TTL. An unconfigured lane now raises, at registration and at
enqueue.

### Every Redis failure was a bare RuntimeError

The Rust core mapped everything through `PyRuntimeError`, so "Redis is down"
was indistinguishable from a bug in your own callback. Migrating our router
meant widening a precise `except OperationalError` into `except
RuntimeError`. The library made our code *worse*, which is a bar no library
should clear.

Broker failures now raise `BrokerError`, everything else `ArdiqError`, and
both subclass `RuntimeError` so nothing that already worked broke.

### You couldn't read the task id from inside the task

Celery gives you `self.request.id`, and every log line we had used it.
`current_task()` now returns the id, name and attempt from inside the body,
and returns `None` outside a worker, the way `asyncio.current_task()` does.

---

## The bugs only load finds

Two of these never showed up in a test suite, and never would have.

### The segfault

About **1% of workers died with SIGSEGV**: 3 out of 300, with 100 workers
draining 20,000 tasks. Always *after* logging `worker stopped`. Main thread,
no Python frame.

The work was always finished and stored. Only the exit code was wrong, which
sounds harmless until you remember that the exit code is the entire signal for
a Kubernetes Job or a CI step.

It's a race between CPython finalizing and the core's tokio threads, which
outlive the worker and can drop a Python reference while the interpreter is
tearing itself down. Sequential single-worker runs never reproduced it: 0 of
60. It needs concurrency, which is why load found it and tests didn't.

The fix is to not play: the worker now leaves without letting CPython finalize
at all. `atexit` handlers run, logging and the streams flush, then
`os._exit(0)`. Sentry and coverage still get their last write, and the
interpreter never reaches the state where the race exists. `--workers N`
spawns its children as plain `ardiq run` processes specifically so they
inherit that exit path rather than a supervisor's.

That closes it for the worker on every Python version. It does **not** close
it for *your* process, and that's the one caveat I'd put on 1.0.

A short-lived producer (a cron job, a script, a CI step that enqueues a few
tasks and exits) finalizes the interpreter the normal way, because it's your
process and ArdiQ doesn't get to choose how it ends. On **Python 3.12** the
same race applies there: measured at 12% of 100 producers exiting
simultaneously, and never once when run one at a time. Nothing is lost, every
task is enqueued and stored before it can happen, and only the exit code lies.

**Python 3.13 and up are unaffected**, because CPython gained the check PyO3
needs to refuse an unsafe release during finalization. So the recommendation
in the docs is 3.13+ if you fan out short-lived producers, and the underlying
gap is tracked upstream in
[pyo3-async-runtimes#40](https://github.com/PyO3/pyo3-async-runtimes/issues/40).

### The 50 ms sleep that was really a rate cap

This one is embarrassing and I'm including it because leaving it out would
make the benchmark section dishonest.

For months my own numbers showed ArdiQ behind Taskiq on throughput, and I had
a tidy explanation: crossing the Rust/Python boundary twice per task costs a
fixed ~0.3 ms, so short tasks pay a proportionally larger toll. It fit. I put
it in the docs.

It was a hardcoded 50 ms sleep. When the producer had no free permits it took
an `else` branch and slept for 50 ms **without looking at the stream again**.
So the worker could never hand out more than `prefetch` messages per tick, no
matter how fast the consumers drained them. Concurrency sets how many tasks
run at once; this set the *rate*, and the rate was the binding constraint.

One worker, 20,000 no-op tasks, everything else held constant:

| prefetch | drain  | throughput | predicted (`prefetch` / 50 ms) |
|---------:|-------:|-----------:|-------------------------------:|
| 32       | 31.78s | 629/s      | 640/s                          |
| 64       | 15.56s | 1,285/s    | 1,280/s                        |
| 256      | 4.14s  | 4,831/s    | 5,120/s                        |
| 1024     | 2.83s  | 7,065/s    | 20,480/s (Redis binds first)   |

Throughput tracks the arithmetic until Redis becomes the limit, which is the
proof: the number was the sleep. Not the core, not Redis, not the task body,
and certainly not the boundary crossing I'd blamed.

It was also the entire gap in the no-op benchmark: 31.81s against streaq's
10.72s and taskiq's 8.32s on the same box. The sleep-based benchmark, where
tasks last long enough that the cap never binds, was a dead heat with both.
**Every scenario where the bug mattered was one I hadn't written a benchmark
for.**

The lesson isn't "measure more". It's that **a plausible explanation for a
number is the most effective way to stop investigating it**. I had a story
that fit, so I stopped looking, for months.

### Burst mode reported success after 32 of 20,000 tasks

The same `else` branch had a worse consequence, and this one isn't about
speed.

`--burst` means "drain the queue and exit", which is how you'd run a worker as
a Kubernetes Job or a CI step. The check that decides the queue is empty
couldn't tell *"I read the stream and there was nothing"* from *"I never
looked"*. When the producer slept without reading, `messages` was empty. If
every in-flight task also finished inside that 50 ms window, the permits were
all back, every condition held, and the worker concluded it was done.

With 20,000 tasks queued, it processed **32** and exited with
`reason=burst`. A clean exit code. A successful-looking deploy. And 19,968
tasks still sitting in Redis.

Slow tasks never free their permits inside the window, which is exactly why
burst looked fine everywhere else, and why **no test with one enqueued task
could ever have caught it**. My whole burst test suite was tasks I'd written
to be individually interesting. The bug needed a backlog and tasks too boring
to bother writing a test for.

It reproduces in 0.1 seconds once you know, and there's a regression test now
that queues more than `prefetch` no-ops and asserts the worker drains all of
them.

---

## What 1.0 means

Not "finished". Two specific things:

**The public API is frozen.** No name, argument or return type in the public
surface changes without a 2.0.

**The feature set is complete for ordinary single-node production use.**
Priorities, cron, delayed and scheduled tasks, retries with backoff, aborts,
results with TTL, introspection, dependency injection via lifespan, error
hooks, deduplication, batch enqueue, and multiprocess workers.

Three things landed late and are worth calling out:

`unique=True` derives a task's id from the call itself (name, args, sorted
kwargs) so an identical call already queued or running is reused
instead of duplicated. It costs no new state in Redis; it reuses the `SET NX`
the publish script always did.

`enqueue_many` stages a batch through one Lua script instead of one round trip
per task. 20,000 enqueues went from 2.7 s to 0.17 s. The API needed care:
`.prepare(*args, **kwargs)` returns the call `.enqueue` would have made, held
back, carrying the same signature, so a batch is still type-checked. That's
exactly where every other API quietly gives up.

`--workers N` spawns N worker processes. They're spawned rather than forked,
each one a plain `python -m ardiq run`, specifically so they keep the exit
path that avoids the segfault above.

And enqueue calls are type-checked against the task's signature:

```python
@app.task()
async def charge(user_id: int, amount: float) -> str: ...

await charge.enqueue(1, 9.99)      # ok
await charge.enqueue("1", 9.99)    # error: str is not int
```

---

## Benchmarks

Same suite as the May post, extended. Six queues, one machine, one sitting,
one worker each, 10 concurrent tasks, Redis on localhost. Rounds are
interleaved and the starting library rotates, so nobody benefits from running
last.

The new scenario is `noop_task`: 20,000 tasks that do nothing, which takes the
work out of the measurement and leaves only the queue's own cost to move a
task.

| Queue    | noop tasks/s | CPU tasks/s | I/O tasks/s | Memory |
|----------|-------------:|------------:|------------:|-------:|
| **ArdiQ**| **2,895**    | **394**     | 95.3        | 33 MB  |
| Taskiq   | 2,051        | 356         | **96.9**    | 91 MB  |
| Streaq   | 1,179        | 322         | 91.8        | 48 MB  |
| arq      | 789          | 283         | 87.6        | **30 MB** |
| Dramatiq | 1,787        | 12.5        | 94.1        | 56 MB  |
| Celery   | 861          | 12.5        | 71.2        | 50 MB  |

### The number that killed my theory

Turn that noop column into milliseconds of overhead per task, which is what it
actually measures:

| Queue     | Overhead per task |
|-----------|------------------:|
| **ArdiQ** | **0.345 ms**      |
| Taskiq    | 0.488 ms          |
| Dramatiq  | 0.560 ms          |
| Streaq    | 0.848 ms          |
| Celery    | 1.161 ms          |
| arq       | 1.268 ms          |

**ArdiQ crosses the Rust/Python boundary twice per task and still spends less
per task than the pure-Python queues that never cross anything.**

That's the loop and the Redis I/O being off the GIL. It's also the row that
demolished the 0.3 ms boundary theory I was so pleased with: the boundary was
never the cost, it was the cheapest part.

Now the caveats, because the ones you don't state are the ones that get you:

**Celery and Dramatiq's 12.5 tasks/s on CPU is an artifact of this box.**
16 threads means prefork workers thrash the GIL harder, not less. On a laptop
they land near 55. Do not read that row as a 30× win, because it isn't one.

**The GIL caps in-process CPU work for every Python queue, ArdiQ included.**
Your task body is serial per worker. That's what `--workers N` is for.

**Absolute numbers don't travel between machines**, or even between runs on
the same machine. Compare rows within one table, never against someone else's
hardware.

**I wrote both the queue and the benchmark.** That's a conflict of interest
whether I say so or not, so: [the suite is
public](https://github.com/17tayyy/python-task-queue-benchmarks), every
library is pinned, and the README points at the places the methodology
flatters us. Clone it and check.

---

## When not to use it

**You need real multi-core parallelism inside one process** -> Celery's
prefork model gives you that out of the box. ArdiQ gives you `--workers N`,
which is more processes, not more cores per process.

**You need a mature ecosystem today** -> Celery has a decade of integrations,
schedulers and dashboards. ArdiQ has none of that. It's one person's library
on its first day at 1.0.

**You can't run Redis** -> ArdiQ is Redis-only by design and that won't
change.

**Your stack is sync** -> you'd gain nothing here. Dramatiq is the better
answer.

**You want the safe institutional choice** -> that's still Celery, and I'd
rather say so than pretend three months of my own production traffic
outweighs ten years of everyone else's.

---

## Conclusion

The May post ended by saying you should choose Celery deliberately rather than
by inertia. I stand by that. I just didn't apply it hard enough to my own
migration: we moved to Celery for long-term safety, on a fully async codebase,
and long-term safety turned out to include an event loop closing under our
outgoing messages.

What I'd tell you now, in the same format as that post:

- **If your stack is fully async, a sync queue will cost you something.** Maybe
  a shim, maybe an outage. It won't be free.
- **"Battle-tested" is about the library, not about your use of it.** Celery
  has seen every edge case. It hadn't seen ours.
- **Running your own tool in production is the only real test.** 98 green
  tests missed a silent name collision, a lane that swallowed work, a burst
  mode that declared victory after 32 of 20,000 tasks, and a segfault in 1% of
  workers. The suite is 179 tests now, and every one of the new ones exists
  because something else found the bug first.
- **You don't need scale to find these, you need traffic whose shape you
  didn't write.** Thirty-three tasks on two small services surfaced most of
  this in weeks. My benchmarks missed the rate cap for months because I only
  ever measured the scenarios I'd thought of.

ArdiQ 1.0 is on PyPI:

```console
$ pip install ardiq
```

Docs at [ardiq.bytay.dev](https://ardiq.bytay.dev), source at
[github.com/17tayyy/ardiq](https://github.com/17tayyy/ardiq). MIT, one runtime
dependency, and a benchmark suite that includes the rows where it loses.
