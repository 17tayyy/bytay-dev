---
title: "How I Structure FastAPI Projects in Production: and Why"
date: 2026-09-25
description: "What most FastAPI tutorials skip: how I structure routes, services, transactions, exceptions, logging, multi-tenancy and background tasks in production, and the reasoning behind each decision."
tags: ["fastapi", "architecture", "python"]
draft: false
---

> **Originally published in May 2026, updated in September.** Four months is a long time in a codebase. The background tasks section went out of date three weeks after publishing (ARQ, then Celery, now ArdiQ), a few snippets aged badly, and some rules that belong here were missing entirely: transactions, pagination order, and what to test. The rules from May still stand. This version just has more of them.

Most FastAPI tutorials will get you to a working endpoint in five minutes. What they won't show you is what happens six months later when the codebase has grown, someone else is touching it, and every router file has become a 300-line mix of business logic, database queries, and HTTP concerns tangled together.

This is how I structure FastAPI in production, and the reasoning behind each decision. Not just theory, but production code.

The examples mix MongoDB with Beanie and PostgreSQL with SQLAlchemy 2.0 async. The rules are the same on both. Where the database changes the details, I show both.

---

## **Your router is not your application**

The most common mistake I see in FastAPI codebases is logic living in routers. A router has one job: receive an HTTP request, validate the input via Pydantic, call a service, and return a response. That's it. It's a translator between HTTP and your actual application.

If your router is doing database queries, running business logic, or mapping data manually, it's doing too much.

```python
@router.post("", status_code=status.HTTP_201_CREATED)
async def create_ticket(data: TicketCreate, user: CurrentUser, db: DbSession) -> DataResponse[TicketRead]:
    ticket = await ticket_service.create_ticket(db, data, user)
    return DataResponse(data=TicketRead.model_validate(ticket))
```

Input comes in, service handles it, response goes out. The router doesn't know what creating a ticket involves, and it shouldn't. The service is pure Python, no FastAPI imports, no HTTPException, no Request object. It could run in a CLI, a test, or a background task without modification.

And it will. Background tasks call the same services your routers call. The day you need that, you'll be glad the service never imported `Request`.

---

## **One use case, one commit**

This one was missing from the first version, and it's the rule that saves you from the bugs that don't show up in tests.

If every service function commits on its own, you can't combine two of them. Close a ticket, then write an audit entry: if the second write fails, the ticket is closed and nobody knows who closed it. Two commits, two transactions, half a use case saved.

The rule: **the service function the router calls owns the transaction, and it commits once, at the end.** Helpers called by other services only add and flush. They never commit.

```python
async def close_ticket(db: AsyncSession, ticket_id: UUID, user: User) -> Ticket:
    ticket = await get_ticket(db, ticket_id, user.organization_id)
    ticket.status = TicketStatus.CLOSED
    await audit_service.record(db, user, "ticket.closed", ticket.id)  # add() only
    await db.commit()
    return ticket
```

On MongoDB the rule is the same, it just costs more. Multi-document transactions need a replica set and a session passed to every write, so often the cheaper fix is modeling the data so a use case writes a single document. What you don't get to do is pretend two separate writes are atomic.

Same idea for anything that leaves your process: enqueue background tasks and send emails **after** the commit, never before. Otherwise the worker can pick up a job for a row that was rolled back, or that doesn't exist yet.

---

## **Use Annotated. Seriously.**

FastAPI supports `Annotated` natively and recommends it in their own docs, yet most codebases still write dependencies like this:

```python
# verbose, repetitive, and easy to get wrong
async def create_ticket(data: TicketCreate, user: User = Depends(get_current_user)):
    ...
```

The correct approach is to define type aliases once and use them everywhere:

```python
# dependencies.py
CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentAdmin = Annotated[User, Depends(require_role(Role.ADMIN, Role.OWNER))]
DbSession = Annotated[AsyncSession, Depends(get_db)]
```

```python
# clean, readable, consistent
async def create_ticket(data: TicketCreate, user: CurrentUser, db: DbSession):
    ...
```

`Annotated` attaches metadata to a type, in this case the `Depends()`, which FastAPI reads at startup to wire up dependency injection. You're not doing anything clever, you're using the framework as intended. The alias means you define the dependency once, and if `get_current_user` ever changes, you update it in one place instead of hunting through every router file.

The same goes for query and path parameters: `limit: Annotated[int, Query(ge=1, le=100)] = 20`. And you don't have to enforce any of this by hand. Ruff ships FastAPI-specific rules, and `FAST002` flags every dependency that isn't declared with `Annotated`.

---

## **Custom exceptions, not HTTPException**

Since services are pure Python with no FastAPI imports, they can't raise `HTTPException`. Which is fine, they shouldn't. Instead, define a base exception class and subclass it per error type:

```python
class AppError(Exception):
    status_code: int = 400
    code: str = "bad_request"
    default_message: str = "Bad request"

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"

    def __init__(self, resource: str = "Resource") -> None:
        super().__init__(f"{resource} not found")
```

Then register a global exception handler in your app startup:

```python
@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message)
```

Your services raise `NotFoundError("Ticket")`. Your handler catches it and returns a consistent JSON response. No HTTP knowledge leaks into your business logic.

What I got wrong in the first version: one handler isn't enough. FastAPI's own validation errors, unknown routes and unhandled crashes all come back in FastAPI's default format, so your "consistent" error format is only consistent for the errors you raised yourself. Register handlers for `RequestValidationError`, Starlette's `HTTPException` and `Exception` too, and route all of them through the same function:

```json
{ "error": { "code": "not_found", "message": "Ticket not found", "request_id": "3f2a9c..." } }
```

The `request_id` is there so a user reporting an error can hand you the one string that finds it in your logs.

One hard rule: never expose internal details in error messages. `NotFoundError("Ticket")` is correct. `NotFoundError(f"DB query failed on tickets with filter {filter}")` is a security issue and an embarrassment. Same for validation errors: don't echo the submitted input back, it may contain a password.

---

## **Consistent response structure**

Every endpoint returns one of a few wrappers. Always. No raw objects, no arbitrary dicts, no `{"status": "ok"}` invented on the spot.

```python
# core/http/responses.py
class DataResponse[T](BaseModel):
    data: T


class PaginatedResponse[T](BaseModel):
    data: list[T]
    total: int
    skip: int
    limit: int


class MessageResponse(BaseModel):
    message: str
```

The rule is simple: if you're returning data, use `DataResponse`. If you're returning a list, use `PaginatedResponse`. If you're confirming an action with no data to return, like resending an invite, use `MessageResponse`. And a delete returns `204` with no body at all.

```python
@router.get("/{ticket_id}")
async def get_ticket(...) -> DataResponse[TicketRead]: ...

@router.get("")
async def list_tickets(...) -> PaginatedResponse[TicketRead]: ...

@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticket(...) -> None: ...
```

Two reasons this matters. First, whoever consumes your API, a frontend, a mobile app, another service, always knows what shape is coming back. They don't need to check the docs for every endpoint to know if the data is nested under a key or not. Second, if you ever need to change the response format, you change it in one place. Not across 50 endpoints.

Combined with the error format from the previous section, your API now has a fully predictable contract: successes always look one way, errors always look another.

---

## **Pagination without an order is a bug**

Every list endpoint is paginated, with a hard upper limit on page size. Everyone knows that part. The part that bites is this:

```python
# SQLAlchemy: looks fine, isn't
query.offset(skip).limit(limit)

# SQLAlchemy: correct
query.order_by(Ticket.created_at.desc(), Ticket.id.desc()).offset(skip).limit(limit)

# Beanie: same rule
Ticket.find({"organization_id": org_id}).sort("-created_at", "-_id").skip(skip).limit(limit)
```

Without an explicit order on something unique, the database returns rows in whatever order is convenient for it at that moment. Page 2 can repeat items from page 1, or skip some entirely. It won't happen on your laptop with twelve rows. It will happen in production, and it will look like a frontend bug.

For tables that grow fast, feeds, messages, logs, skip offset pagination altogether and use a cursor. `OFFSET 100000` means reading and throwing away 100,000 rows to show you twenty.

---

## **If you're on SQLAlchemy async**

SQLAlchemy 2.0 async is excellent, but it has a few defaults that were designed for sync code and hurt you in async. Three settings and one habit fix most of it.

**`expire_on_commit=False`, always.** By default SQLAlchemy expires every attribute after a commit, so the next time you read `ticket.title` it goes back to the database to reload it. In sync code that's a hidden query. In async code it's a crash: `MissingGreenlet`, because attribute access can't `await`.

```python
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
```

**`lazy="raise"` on every relationship.** Lazy loading is the same problem one level down. Accessing `ticket.comments` without loading it first either crashes in async or fires an N+1 in sync. With `lazy="raise"` it fails immediately and loudly in your tests, and you load what you need explicitly:

```python
comments: Mapped[list["Comment"]] = relationship(back_populates="ticket", lazy="raise")

tickets = await db.scalars(select(Ticket).options(selectinload(Ticket.comments)))
```

**Timezone-aware datetimes everywhere.** Map every `Mapped[datetime]` to `TIMESTAMPTZ` once, in the declarative base, and never touch `datetime.utcnow()` again. Ruff's `DTZ` rules will catch the ones that slip through.

**The habit: let the database guarantee integrity.** This one applies to Mongo too.

```python
# race condition: two requests both pass the check, both insert
if await db.scalar(select(User).where(User.email == email)):
    raise ConflictError("Email already registered")

# correct: a unique constraint, and you catch the error
db.add(user)
try:
    await db.commit()
except IntegrityError as e:
    await db.rollback()
    raise ConflictError("Email already registered") from e
```

The check-then-insert version passes every test you'll write, because tests don't send two requests in the same millisecond. Users do. On MongoDB it's a unique index and `DuplicateKeyError`, same idea.

---

## **Don't add layers you don't need**

Two patterns I see constantly in FastAPI projects that add complexity without value:

**Repository pattern**: if you're using an ORM like Beanie or SQLAlchemy, you already have an abstraction layer over the database. Adding a repository layer on top is just writing your own ORM on top of an ORM. The only case where it makes sense is if you're using raw SQL without an ORM, where you actually need that abstraction. Otherwise you end up with `ticket_repository.find_by_id()` that does nothing except call `Ticket.find_one()`.

**Abstract base classes for services**: services are not interchangeable. You're never going to swap `TicketService` for a `MockTicketService` at runtime. Abstract base classes here are cargo cult from Java-style architecture applied to a language and framework that don't need it. Write plain functions in your service files and call them directly.

The general principle: every layer you add has a cost. It needs to be maintained, understood by new developers, and debugged when something goes wrong. Only add a layer when it solves a real problem you actually have.

---

## **Structured logging with structlog**

Most projects start with Python's built-in `logging` module, or worse, `print()` statements. The problem with both is that they're designed for human-readable output, which is fine in development but useless in production where you need to query, filter, and aggregate logs programmatically.

structlog organizes log data as key-value pairs instead of formatted strings. In production it outputs JSON that your log aggregator can parse. In development it renders colored, readable lines via `ConsoleRenderer`. Same code, different output depending on environment.

```python
# Instead of this
print(f"Ticket {ticket.id} created by user {user.id}")

# This
logger.info("ticket.created", ticket_id=str(ticket.id), user_id=str(user.id))
```

The event name follows a `domain.action` convention, `ticket.created`, `auth.login_failed`, `billing.webhook_failed`. This makes filtering trivial and gives you a consistent vocabulary across the entire codebase.

The other killer feature is context binding. You can attach a request ID at the start of each request and have it appear automatically in every log line that request generates, without passing it explicitly:

```python
structlog.contextvars.clear_contextvars()
structlog.contextvars.bind_contextvars(request_id=request_id)
```

Now every log line in that request lifecycle carries the same `request_id`. Debugging a production issue goes from "grep for something that might be related" to "filter by request_id and see exactly what happened."

Two details that matter. Do this in a pure ASGI middleware, not with `@app.middleware("http")`: that one runs your endpoint in a separate task, and context you bind there doesn't always make it back. And reuse the incoming `X-Request-ID` header when there is one (validated, it's user input), then echo it in the response. That way the same ID follows a request through your proxy, your API and your workers.

One hard rule: never log passwords, tokens, emails, raw LLM responses, or file contents. Ever. Log the `user_id`, not the email.

---

## **Multi-tenancy is a hard rule, not a guideline**

In a multi-tenant application every database query must be scoped to the current organization. Not most queries, every query.

```python
# This is a security bug
await Ticket.find_one({"_id": ticket_id})               # Beanie
await db.get(Ticket, ticket_id)                          # SQLAlchemy

# This is correct
await Ticket.find_one({"_id": ticket_id, "organization_id": user.organization_id})
await db.scalar(
    select(Ticket).where(Ticket.id == ticket_id, Ticket.organization_id == user.organization_id)
)
```

The first version is an IDOR vulnerability, Insecure Direct Object Reference. Any authenticated user can access any other organization's data by guessing or enumerating IDs. I've found this exact bug in production systems, including [one I reported publicly](/blog/how-bad-authorization-design-put-200k-students-at-risk/). It's one of the most common vulnerabilities in multi-tenant applications and one of the easiest to prevent: always include `organization_id` in your queries, no exceptions.

Three things I'd add now:

- **Another organization's resource returns 404, not 403.** A 403 confirms the ID exists. That's already information you shouldn't be giving away.
- **`organization_id` never comes from the request.** Not from the body, not from the path, not from a query param. It comes from the authenticated user. If your input schema has an `organization_id` field, someone will eventually send a different one.
- **Test it, per endpoint.** Create a resource as org A, request it as org B, assert 404. It's a boring test, and it's the only one that catches the query somebody forgot to scope.

For projects with stricter isolation requirements, you can go further, dynamic database sessions scoped per tenant, or data isolation at the schema or database level. For most early-stage applications, consistent query scoping is sufficient if applied without exceptions.

---

## **Background tasks: ArdiQ**

The first version of this post recommended ARQ over Celery. Three weeks later I [moved our backend to Celery](/blog/celery-is-not-always-the-answer/). Three months later Celery broke our async code in production, and we replaced it with ArdiQ, the task queue I'd been writing in Rust. The whole story is in [ArdiQ 1.0: I Was Wrong About Celery](/blog/ardiq-1-0-i-was-wrong-about-celery/). I'm not going to repeat it here.

The part that belongs in this post is the architecture. With an async-native queue, a task is just another entry point, like a router. It binds its context, opens a session and calls the same service the API uses:

```python
@task_app.task(name="knowledge.process_file", max_retries=5, timeout=600)
async def process_file(node_id: str) -> None:
    async with task_app.state.sessionmaker() as db:
        await knowledge_service.index_node(db, UUID(node_id))
```

And the service enqueues it after the commit, with an ID that makes a duplicate enqueue harmless:

```python
await db.commit()
await knowledge_tasks.process_file.options(task_id=f"index:{node.id}").enqueue(str(node.id))
```

The rules haven't changed, they've just grown up:

- **Tasks must be idempotent.** Any real queue delivers at least once. A worker dies mid-task and the job runs again somewhere else. Running it twice has to give the same result as running it once.
- **Pass IDs, not objects.** The task reloads fresh state from the database.
- **Every task has a timeout.** A task without one that hangs on a network call holds a slot forever.
- **Enqueue after commit**, as above.

---

## **The structure that holds all of this together**

```
app/
├── core/                    # Cross-cutting infrastructure
│   ├── config.py           # Settings via pydantic-settings
│   ├── dependencies.py     # CurrentUser, CurrentAdmin, DbSession
│   ├── tasks.py            # ArdiQ app, worker lifespan
│   ├── http/
│   │   ├── exceptions.py   # AppError and subclasses
│   │   ├── handlers.py     # one error format for every error
│   │   ├── middleware.py   # request_id, security headers
│   │   └── responses.py    # DataResponse, PaginatedResponse, MessageResponse
│   ├── logging/logger.py   # structlog setup
│   └── db/database.py      # DB initialization
│
└── [domain]/               # tickets/, auth/, users/, billing/, etc.
    ├── router.py           # HTTP endpoints only
    ├── service.py          # Business logic, pure Python
    ├── model.py            # ORM models
    ├── schemas.py          # Pydantic I/O schemas
    └── tasks.py            # Background tasks, thin like routers
```

`core/` contains everything that cuts across domains, infrastructure, not business logic. Each domain folder is self-contained. The dependency direction is always inward: routers and tasks depend on services, services depend on models, nothing depends on routers.

---

## **Test the rules, not just the features**

Everything above is a convention, and conventions erode. Someone is in a hurry, a router grows a query, an endpoint ships without auth. Code review catches some of it. Tests catch the rest, if you write the right ones.

Besides the usual happy path, every endpoint gets tested for 401 without a token, 404 for another organization's resource, and 422 for invalid input. And a couple of tests guard the architecture itself:

- **Services don't import FastAPI.** Walk every `service.py` with `ast` and fail if one imports `fastapi` or `starlette`.
- **Every route is authenticated unless it's explicitly public.** Iterate over the app's routes, check that each one depends on `get_current_user`, and keep a short allowlist for login, register and webhooks. Adding a public endpoint becomes a conscious decision instead of a forgotten `Depends`.

One more: run them against a real database. SQLite in tests proves your code works on SQLite.

---

This isn't the only way to structure a FastAPI project. But every decision here exists because the alternative caused a real problem, either in code I wrote, code I inherited, or vulnerabilities I found in other people's systems. The patterns that survive production tend to be the simple ones.

---

## **If you want to use these conventions with an LLM**

All of this, and a lot more that didn't fit in a post, lives in [fastapi-production-rules](https://github.com/17tayyy/fastapi-production-rules). It started as a `SKILL.md` you pasted into the conversation. Now it's an agent skill you install with one command:

```console
$ npx skills add 17tayyy/fastapi-production-rules
```

It works with Claude Code, Cursor, Codex, Copilot and most other coding agents. The `SKILL.md` has every rule with a short example, and a `references/` folder has the complete implementations the agent reads when it needs them: auth with rotating refresh tokens, zero-downtime migrations, tests against real Postgres, native SSE streaming, ArdiQ tasks, deployment.

FastAPI now ships its own official skill too, and they don't compete. The official one covers how to use FastAPI. This one covers everything around it that decides whether the thing survives production. Install both.
