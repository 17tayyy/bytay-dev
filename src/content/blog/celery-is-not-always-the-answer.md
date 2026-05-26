---
title: "Celery Is Not Always the Answer: A Real Comparison of Python Task Queues"
date: 2026-05-25
description: "I migrated from ARQ to Celery at work. During that process I tested every serious Python task queue out there. Here's what the benchmarks say, and what they don't"
tags: ["python", "fastapi", "celery", "benchmarks"]
draft: true
---

## Why i wrote this

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

## The contenders

### Celery
The de facto standard for task queues in Python. Mature, battle tested, and
backed by a large community. Supports multiple brokers (Redis, RabbitMQ...) and
has an answer for almost every edge case. The safe choice, but not always
the right one.

### ARQ
Built for async Python from the ground up. Redis-only, simple API, and very
easy to integrate with FastAPI. The problem: it's in maintenance-only mode.
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
up to 5x faster than ARQ. Small but opinionated in the right ways and that
web UI for monitoring is a nice touch.
