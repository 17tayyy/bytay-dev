---
title: "What Writing a Rust Extension Taught Me About Python"
date: 2026-06-05
slug: writing-python-extensions-in-rust-pyo3
description: "PyO3 from the brain of a Python dev learning Rust: where the two languages disagree, what hurts first, and what stuck."
tags: ["rust", "pyo3", "python", "maturin"]
draft: false
---

I've been writing Python for years and Rust for months. Most of those months went into Ardiq, a task queue for Python with a Rust core, and this post is what building it did to how I think about Python.

## Why PyO3, and when it actually makes sense

I didn't reach for Rust because Python was too slow. I reached for it because there was no Rust-core task queue for Python, I wanted to learn Rust on a problem I already understood, and I'm betting that writing native modules is going to matter more. Ardiq came out of that bet: a real problem I knew well, used as an excuse to learn the hard parts of a language I didn't.

So this isn't a "rewrite your hot path in Rust and watch it fly" post. The "should I rewrite this in Rust?" question is usually the wrong one, because it frames the decision around speed. The real question is where you want the type boundary to live, how much of the truth about your data you're willing to make explicit, and who pays when it's wrong.

Three tools sit at different points on that line. With ctypes or cffi, you call into native code by promising, yourself, that the types line up; you are the safety boundary, which is fast to start and easy to blow up at runtime. Cython is Python with type annotations; you get speed without leaving your mental model, which is comfortable but also means you never really leave Python. PyO3 is the expensive one: you cross into a type system that won't let you lie. That price, actually learning Rust, is what the rest of this post is about.

I want to be honest about that cost, because most posts aren't. PyO3 is the most expensive option here in pure effort. If all you want is to make a tight loop faster, Cython will probably do the job and leave you in familiar territory. You don't pick PyO3 for development speed. You pick it when you want a core that's genuinely robust and portable, or, like me, when learning the tool is half the point.

So when does it make sense? Not for rewriting your application; that's the framing trap. It makes sense when you can isolate an engine, a core with a small, well-defined surface that the rest of your Python just consumes. In Ardiq that engine is the worker loop and all the Redis I/O, running in Rust on top of tokio, off the GIL. You write tasks in plain Python, and the two worlds meet at a single point. It also makes sense when you want to ship something native and portable: one wheel that works across many Python versions, which is where the next section goes.

That single small surface where the two worlds touch is the whole game. The rest of this post is what that surface costs you, and what it taught me.

## Setup with maturin

The build tooling is the part where I expected the most friction and got the least. You don't write a `setup.py`, you don't fight `setuptools-rust`, you keep a normal `pyproject.toml` and swap the build backend for maturin. From the outside, `uv add ardiq` or `pip install ardiq` looks like any other package. The interesting decision isn't the backend, it's the layout.

Ardiq is one repo with two languages living side by side: a Rust crate under `core/`, a plain Python package under `ardiq/`. A small `[tool.maturin]` block stitches them together:

```toml
[build-system]
requires = ["maturin>=1.0,<2.0"]
build-backend = "maturin"

[tool.maturin]
manifest-path = "core/Cargo.toml"
module-name = "ardiq._core"
features = ["pyo3/abi3-py39"]
python-source = "."
```

`manifest-path` points maturin at the Rust crate, `python-source = "."` tells it the Python package sits at the repo root, and `module-name` is the line that matters: the compiled Rust lands inside the Python package as `ardiq._core`, with a leading underscore. That underscore is a decision, not a convention. The Rust core is private. Nobody imports it directly; the public API (`Ardiq`, `@app.task`, `Job`) is plain Python sitting on top, and it's the only thing users see. The engine is Rust, the face is Python. That split is the same idea as the single small surface from the last section, now expressed in the file tree.

The other line worth pausing on is `abi3-py39`. Without it, you ship one wheel per Python version. With it, you compile against Python's stable ABI and ship one wheel that works from 3.9 onward: far less CI pain, far fewer artifacts. (Ardiq still declares a higher `requires-python` for unrelated reasons, but the wheel itself is forward-compatible.)

Day to day the loop is uv: `uv sync` to set everything up, and after touching the Rust core, `uv sync --reinstall-package ardiq` to rebuild it: the same uv-based toolchain I wrote about _[here](https://bytay.dev/blog/python-toolchain-uv-ruff-ty/)_. Edit Rust, rebuild, the change shows up in Python. That's the whole cycle, and it's fast enough that you forget there's a compiler in the loop, until the compiler starts having opinions, which is the next section.

## Crossing the boundary: types and conversions

In Python you pass objects across a function call without thinking about it. An `int` is an `int`, a `dict` is a `dict`, and nobody asks you to prove it. The moment you cross into Rust, every value has to *become* a concrete Rust type, and that becoming is a real step, one that costs something and can fail. PyO3 hides it well enough that you forget it's there, which is exactly why it's worth looking at first.

Here's the version where PyO3 does the work for you:

```rust
#[pyfunction]
fn add(a: i64, b: i64) -> i64 {
    a + b
}
```

Coming from Python, those `i64`s look like type hints, decoration, a suggestion. They're not. They're contracts, checked at runtime on the way in. Call `add("two", 3)` from Python and you get a `TypeError` before a single line of your function runs. PyO3 tried to turn the Python object into an `i64`, failed, and raised. The annotations you can ignore in Python are load-bearing here.

That conversion has a name: the `FromPyObject` trait. You can do it by hand to see the seam the macro was hiding:

```rust
#[pyfunction]
fn add(a: &Bound<'_, PyAny>, b: &Bound<'_, PyAny>) -> PyResult<i64> {
    let a: i64 = a.extract()?;
    let b: i64 = b.extract()?;
    Ok(a + b)
}
```

`extract()` returns a `PyResult`: the conversion is explicitly fallible, and the `?` is where a bad type turns into a Python exception. The tidy first version was doing exactly this; it just spelled the `extract` and the `?` for you. Once you've seen it written out, the typed signature stops feeling like magic and starts feeling like a shorthand.

This is where it stops being a toy. In Ardiq the core takes its whole config as a Python `dict`, and pulling typed values out of it with optional keys and defaults looks like this:

```rust
fn opt<'py>(dict: &Bound<'py, PyDict>, key: &str) -> PyResult<Option<Bound<'py, PyAny>>> {
    Ok(dict.get_item(key)?.filter(|value| !value.is_none()))
}

// inside ArdiqCore::new(...)
let redis_url: String = opt(&config, "redis_url")?
    .map(|v| v.extract())
    .transpose()?
    .unwrap_or_else(|| "redis://localhost:6379".to_string());
```

In Python this is one line: `config.get("redis_url", "redis://localhost:6379")`. You never think about what happens if the key holds the wrong type. Here every piece is explicit: `opt` looks the key up and treats `None` as absent, `.map(|v| v.extract())` tries to turn it into a `String`, `.transpose()?` flips the `Option<Result<...>>` into a `Result<Option<...>>` so the `?` can surface a bad type as an exception, and `.unwrap_or_else` supplies the default only when the key was genuinely missing. It's verbose, but every failure mode that Python papered over is now named in the code.

The boundary runs both ways. On the way out, Rust values become Python objects through `IntoPyObject` (if you find `IntoPy` in a tutorial, it's the old name, it's been replaced). When Ardiq hands a task result back, it materializes the raw bytes as a real Python `bytes` object:

```rust
PyBytes::new(py, &bytes).into_any().unbind()
```

And here's the thing I didn't appreciate until I'd written a lot of these: that materialization is a *copy*. Extracting a `String` or a `Vec<u8>` doesn't borrow Python's memory; it allocates fresh Rust memory and copies the bytes over. In a task queue, every payload crosses that boundary twice, in as arguments and out as a result, and the copy is real work that Python had simply never shown me. I'll come back to that in the last section, because it changed how I read my own Python.

## Where it starts to hurt

The first three sections are the part PyO3 makes easy. This is the part it makes honest. Three Python instincts of mine broke here, and each one broke in a way that taught me something I couldn't unlearn afterward.

### Who owns this Python object?

In Python you never ask who owns a value. Everything is a reference, the garbage collector keeps score, and an object lives exactly as long as something points at it. You pass it around, stash it in a list, capture it in a closure, and it's just there.

In PyO3 you have to answer that question out loud, because there are two ways to hold a Python object and they mean different things. `Bound<'py, T>` is borrowed: it's tied to the `'py` lifetime, the window in which your thread is allowed to touch the interpreter. `Py<T>` is owned: it carries no lifetime and can outlive that window. The choice isn't style, it's about how long the object needs to live.

Ardiq's worker loop runs for as long as the process does, and it has to hold onto your task callback the entire time, far beyond any single window where it's talking to Python. So the callback can't be a `Bound`; it has to be owned:

```rust
struct PyExecutor {
    callback: Py<PyAny>,
    locals: TaskLocals,
}
```

When the moment comes to actually call it and the loop does hold the interpreter, it converts the owned handle into a borrowed one for the duration: `self.callback.bind(py)`. Store owned, borrow on use. That distinction has no equivalent in Python, and it's the first thing that forced me to think about lifetime instead of letting the GC think for me.

The second ownership tax shows up everywhere in the codebase. Every async method clones a handful of `Arc`s before it does anything:

```rust
fn enqueue<'py>(&self, py: Python<'py>, /* ... */) -> PyResult<Bound<'py, PyAny>> {
    let queue = self.queue.clone();
    let conn = self.conn.clone();
    let client = self.client.clone();
    future_into_py(py, async move {
        // the future now owns queue, conn, client
    })
}
```

Coming from Python this looked like noise. Why clone anything? In Python a coroutine just captures `self` and moves on. But the future here might run later, on a different runtime thread, so it can't borrow `self`; it has to own what it touches. `Arc::clone` is how you hand it an owned share. And once I saw what `Arc::clone` actually is (a reference-count bump, nothing copied), I realized it's the exact thing Python's been doing invisibly on every single assignment. I'd just never had to type it.

### The GIL becomes something you hold

You can write Python for years and treat the GIL as trivia. In PyO3 it stops being trivia, because touching any Python object requires proof that your thread is currently attached to the interpreter, and that proof is a value: a `Python<'py>` token. You can't fabricate it. You either receive it as a function argument or you ask for it.

This is the whole reason Ardiq scales: the loop and the Redis I/O run in Rust, off the interpreter, with no token in hand. It only reaches for one in the microseconds it needs to start a task and read its result:

```rust
let future = Python::attach(|py| -> PyResult<_> {
    let bytes = PyBytes::new(py, &payload);
    let coro = self.callback.bind(py).call1((task_id, bytes, tries))?;
    pyo3_async_runtimes::into_future_with_locals(&self.locals, coro)
});
```

Inside that closure, `py` is your permission slip. Building the `bytes` object needs it, binding the callback needs it, calling it needs it. The instant the closure returns, the token is gone and the loop runs free again. The thing I'd treated as an invisible global for years is now a scoped, visible resource I pick up and put down on purpose.

Two footnotes. If you find `Python::with_gil` in a tutorial, that's the same call under its old name; it's `attach` now, because with free-threaded Python "holding the GIL" isn't universal anymore and "attached to the interpreter" is the accurate idea. And that last line, `into_future_with_locals`, is the bridge between Rust's async and Python's; I'm deliberately not unpacking it here: it's a post of its own.

### Errors as values, in both directions

Python raises and you catch. Rust returns a `Result` and makes you handle it. The bridge is one type alias: `PyResult<T>` is just `Result<T, PyErr>`, and a `PyErr` handed back to Python surfaces as a normal exception.

Going out, from Rust to Python, you decide once how your errors become exceptions. Ardiq funnels anything that can fail in the core through one helper:

```rust
fn to_py_err<E: std::fmt::Display>(err: E) -> PyErr {
    PyRuntimeError::new_err(err.to_string())
}
```

Used as `.map_err(to_py_err)?`, it turns a dropped Redis connection into a `RuntimeError` the caller sees in Python. In Python I'd improvise the exception type at the throw site every time; here the mapping is a single explicit decision.

Going the other way is the interesting half. A task written in Python can raise, and that must not take the worker down; it has to become "this one failed, maybe retry." Since the loop is Rust, the Python exception has to turn into a Rust value:

```rust
match future.await {
    Ok(obj) => Python::attach(|py| parse_outcome(py, &obj)).unwrap_or_else(|_| failure()),
    Err(err) => {
        tracing::error!("ardiq task raised: {err}");
        failure()
    }
}
```

And notice what crosses the boundary on success: not a rich Python object, but a tuple `parse_outcome` reads as `(code, bytes, retry_after_ms)`, an enum encoded as integers. That's deliberate. Exceptions don't travel well across threads, across the async bridge, or across a language seam, so at the edge you degrade them to plain data. That single decision is most of what changed in how I think about error handling, and I'll come back to it at the end.

These three things, who owns what, when you're allowed to touch Python, and how errors travel, don't live in separate corners of the code. They all converge in a single method, the one the worker calls for every task. The next section walks through it, stripped down to its synchronous bones so the shape is visible.

## A real example: calling your Python function from Rust

Everything so far was a piece. This is where they lock together. The worker has one job that matters: take a task off the queue, run the Python function the user wrote, and turn whatever happens into an outcome it can act on. Here it is, stripped down to its synchronous bones so the three pieces from the last section are visible at once:

```rust
fn execute(&self, task_id: String, payload: Vec<u8>, tries: i64) -> ExecOutcome {
    Python::attach(|py| -> PyResult<ExecOutcome> {
        let bytes = PyBytes::new(py, &payload);
        let result = self.callback.bind(py).call1((task_id, bytes, tries))?;
        parse_outcome(&result)
    })
    .unwrap_or_else(|err| {
        tracing::error!("ardiq task failed: {err}");
        failure()
    })
}
```

Read it as the three instincts converging. `Python::attach` is the GIL made into a value: outside that closure the worker holds no token and touches nothing Python; inside, `py` is the permission slip for everything that follows. `self.callback.bind(py)` is the ownership move: the callback was stored as an owned `Py<PyAny>` because it outlives every one of these windows, and here it's borrowed back into a `Bound` for exactly as long as the call takes. And the error handling is both directions in four lines: the `?` lets any failure building the arguments or calling the function bubble up as a `PyErr`, and the `unwrap_or_else` catches it, logs it, and degrades it to `failure()` so one bad task never takes the worker down.

The other half lives in how the result comes back. The Python side doesn't return a rich object; it returns a tuple, and Rust reads it as plain data:

```rust
fn parse_outcome(result: &Bound<'_, PyAny>) -> PyResult<ExecOutcome> {
    let code: i64 = result.get_item(0)?.extract()?;
    let bytes: Vec<u8> = result.get_item(1)?.extract()?;
    let retry_after_ms: i64 = result.get_item(2)?.extract()?;
    let outcome = match code {
        0 => Outcome::Success,
        2 => Outcome::Retry { delay_ms: (retry_after_ms > 0).then_some(retry_after_ms) },
        _ => Outcome::Failure,
    };
    Ok(ExecOutcome { outcome, result: bytes })
}
```

`(code, bytes, retry_after_ms)`: an integer, some bytes, an integer. An entire success-failure-retry protocol flattened into a tuple of primitives. Coming from Python this felt almost insulting at first, like throwing away type information on purpose. That's exactly what it is, and it's the right call. A rich Python exception is the most natural thing in the world inside one interpreter, and the worst possible thing to move across a thread boundary, an async runtime, and a language seam all at once. So at the edge you flatten it: encode the outcome as integers and bytes on the Python side, decode it back into a real Rust enum on the other. The boundary only carries data, never live objects.

One honest gap. The real `execute` isn't synchronous. Ardiq's tasks can be `async def`, so the callback doesn't hand back a finished tuple; it hands back a coroutine, and Rust has to turn that coroutine into a future it can await on its tokio runtime. The shape you just read is exactly right, the same `attach`, the same bind, the same flattening, but with a bridge between Python's event loop and Rust's wedged into the middle. That bridge is the densest, most interesting thing in the whole project, and it gets its own post rather than a rushed paragraph here.

What you've seen is the surface from the first section, made real: one small method where Python and Rust touch, owning what must outlive the call, holding the interpreter only as long as needed, and trading data rather than objects across the line. Living at that surface for a few months changed how I see the language I came from. That's the last section.

## What changed in how I think about Python

I went into this to learn Rust. What I didn't expect was to come out reading Python differently.

The first thing that changed is that I see allocations now. Back when we pulled config out of a dict, extracting a `Vec<u8>` from a Python object turned out to be a copy, fresh memory, bytes moved over, every time. Once you've been made to watch that happen at the boundary, you can't stop seeing it everywhere else. The list comprehension that rebuilds a list it could have mutated. The `dict` passed by reference that I assumed was free. None of it was ever free; Python just never made me look. I haven't started micro-optimizing my Python, and I don't plan to. But I have a sense now of where the weight sits, and that sense came entirely from being forced to pay for it explicitly in another language.

The second thing is ownership, and it runs deeper than I expected. The `Arc::clone` that annoyed me in the ownership section, the one I had to type before every `async move`, turned out to be the thing Python does silently on every assignment, every argument pass, every append. Rust didn't teach me a new concept there. It made visible a concept I'd been relying on for years without a name for it. Now when I write `x = y` in Python I actually know what happened: not a copy, a second name for one object, a reference count quietly going up. I knew that before in the way you know a fact. I know it differently after having had to spell it out.

The third thing changed how I write APIs, and it's the one I'll keep longest. The task protocol from the last section degrades a rich result down to `(code, bytes, retry_after_ms)` at the boundary, integers and bytes, no live objects crossing the line. That felt like a loss when I wrote it. It isn't. A boundary is exactly where you want the least magic: plain data, no shared assumptions, nothing that breaks if the two sides drift. I've started designing my pure-Python interfaces that way too, the ones nowhere near Rust. Pass data across the seams, not objects wired to half your system. The clearest lesson Rust gave me about software design, I apply mostly in Python.

So would I reach for PyO3 again? For the right shape of problem, the isolated engine with a small surface from the first section, without hesitation. Not because Rust is faster, though the language is, but because the boundary between the two is now somewhere I can think clearly instead of a place I avoid looking. Ardiq is still young and there's a lot left to build, including the async bridge I kept promising and the question of whether any of this is actually faster in practice, which deserves real numbers rather than my word for it. Both are posts of their own. This one was about the part nobody warns you about: that writing a Rust extension is, mostly, a very thorough lesson in the language you already knew.

## If none of this clicked yet

If you read all of that and a good chunk of it didn't land, that's fine. Genuinely.

I'm still a beginner at Rust. I've been at it for months, not years, and there are parts of my own codebase I had to fight for days before they compiled, and a few I still don't fully understand. The borrow checker still tells me no more often than I'd like. That's not a stage you skip past; it's the work.

So if `Bound` versus `Py` or the lifetime stuff felt like too much, you're not behind. You're exactly where this is supposed to feel hard. Keep showing up to it. Write the thing that doesn't compile, then make it compile, then figure out why it works. That loop is the whole game, and it gets less painful only by doing more of it, not less.

## What's next

There's an obvious question I've dodged this entire post: is any of this actually faster?

I built Ardiq partly to find out, and saying "Rust core, so it's fast" without numbers is exactly the kind of claim I don't want to make. So the next post is the benchmark: Ardiq against the task queues Python already has, Celery, ARQ, and the rest, with a reproducible setup and the results laid out honestly, wins and losses included.

If you've ever wondered whether dropping to Rust for a task queue earns its keep, that's the one to wait for.
