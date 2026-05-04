---
title: "FastAPI in production: the parts nobody puts in the tutorial"
date: 2025-04-10
description: "The tutorial ends at `uvicorn main:app`. Here's what comes after, and what I wish someone had told me before I deployed to production at 17."
tags: ["python", "fastapi", "devops", "backend"]
draft: false
---

Every FastAPI tutorial ends at the same place: you run `uvicorn main:app --reload`, the server starts, you hit the endpoint in the browser, and the tutorial calls it a day.

Then you have to actually deploy the thing.

This is a collection of notes from building and shipping a FastAPI service at Moodest — a time-tracking integration handling auth, roles, and KPI endpoints for a platform with 300k+ users. Most of this I figured out the hard way.

## The `--reload` flag is a trap

`--reload` watches for file changes and restarts the server. It's great for development. In production, it's dead weight and a potential vector for unintended behavior if anything touches your files unexpectedly.

Remove it. Use a process manager like `supervisord` or, better, just let Docker handle restarts via `restart: unless-stopped` in your Compose file.

## Your database connection pool will lie to you

The default SQLAlchemy pool size is 5. That sounds fine until you have concurrent requests and half of them sit waiting for a connection, and the other half time out, and you're reading error logs at midnight trying to figure out why the endpoint that worked in testing is failing in production.

Set `pool_size`, `max_overflow`, and `pool_timeout` explicitly. Then set `pool_pre_ping=True` so SQLAlchemy checks connections before using them. Your database will drop idle connections. SQLAlchemy doesn't know that unless you tell it to check.

## Async routes aren't automatically faster

FastAPI supports `async def` route handlers, which is great. The catch is that if your async route calls a synchronous blocking operation — a synchronous database driver, a `requests` call instead of `httpx`, anything that blocks the event loop — you've achieved the worst of both worlds.

Use `asyncpg` or `aiomysql` for databases. Use `httpx.AsyncClient` for outbound HTTP. If you have to use a sync library, run it in a thread pool with `asyncio.run_in_executor`.

## Environment variables will absolutely get committed once

Use `python-dotenv`. Put `.env` in `.gitignore` before you write a single value to it. Have a `.env.example` with dummy values. This sounds obvious until 2am when you're rushing to test something and you paste a key directly into a file.

I set up a pre-commit hook that scans for secrets. Still feels like bolting the door after the horse has left, but at least the horse leaves less often now.

## Nginx as a reverse proxy is not optional

Running FastAPI directly exposed to the internet on port 8000 is not how production works. You put Nginx in front of it, and Nginx handles:

- TLS termination (SSL certs, HTTPS)
- Static file serving
- Rate limiting
- Request buffering

The configuration isn't complicated. The part that's easy to miss is setting `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` so your application sees the real client IP instead of the Docker network gateway.

## The moment it works

You push the code. The GitHub Actions workflow runs. The Docker image builds, gets pushed to the registry, the server pulls it, Compose brings the new container up. You hit the endpoint.

It returns a 200.

This feeling lasts about 30 seconds before you start thinking about what you might have missed.

That's about right.
