---
title: "How I Structure FastAPI Projects in Production: and Why"
date: 2026-05-05
description: "What most FastAPI tutorials skip: how I structure routes, services, exceptions, logging, and multi-tenancy in a production B2B SaaS, and the reasoning behind each decision."
tags: ["fastapi", "architecture", "python"]
draft: false
---

Most FastAPI tutorials will get you to a working endpoint in five minutes. What they won't show you is what happens six months later when the codebase has grown, someone else is touching it, and every router file has become a 300-line mix of business logic, database queries, and HTTP concerns tangled together.

This is how I structure FastAPI in a production B2B SaaS, and the reasoning behind each decision. Not just theory, but production code.

---

**Your router is not your application**

The most common mistake I see in FastAPI codebases is logic living in routers. A router has one job: receive an HTTP request, validate the input via Pydantic, call a service, and return a response. That's it. It's a translator between HTTP and your actual application.

If your router is doing database queries, running business logic, or mapping data manually, it's doing too much.

```python
@router.post("/tickets")
async def create_ticket(data: TicketCreate, user: CurrentUser) -> DataResponse[TicketRead]:
    ticket = await ticket_service.create_ticket(data, user)
    return DataResponse(data=TicketRead.model_validate(ticket))
```

Four lines. Input comes in, service handles it, response goes out. The router doesn't know what creating a ticket involves, and it shouldn't. The service is pure Python, no FastAPI imports, no HTTPException, no Request object. It could run in a CLI, a test, or a background task without modification.

---

**Use Annotated. Seriously.**

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
CurrentAdmin = Annotated[User, Depends(require_admin)]
CurrentOwner = Annotated[User, Depends(require_owner)]
```

```python
# clean, readable, consistent
async def create_ticket(data: TicketCreate, user: CurrentUser):
    ...
```

`Annotated` attaches metadata to a type, in this case the `Depends()`, which FastAPI reads at startup to wire up dependency injection. You're not doing anything clever, you're using the framework as intended. The alias means you define the dependency once, and if `get_current_user` ever changes, you update it in one place instead of hunting through every router file.

---

**Custom exceptions, not HTTPException**

Since services are pure Python with no FastAPI imports, they can't raise `HTTPException`. Which is fine, they shouldn't. Instead, define a base exception class and subclass it per error type:

```python
class AppError(Exception):
    status_code: int = 400
    code: str = "bad_request"
    def __init__(self, message: str) -> None:
        self.message = message

class NotFoundError(AppError):
    status_code = 404
    code = "not_found"

class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"
```

Then register a global exception handler in your app startup:

```python
@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )
```

Your services raise `NotFoundError("Ticket")`. Your handler catches it and returns a consistent JSON response. No HTTP knowledge leaks into your business logic, and your error format is consistent across the entire API.

One hard rule: never expose internal details in error messages. `NotFoundError("Ticket")` is correct. `NotFoundError(f"DB query failed on tickets with filter {filter}")` is a security issue and an embarrassment.

---

**Consistent response structure**

Every endpoint returns one of three wrappers. Always. No raw objects, no arbitrary dicts, no `{"status": "ok"}` invented on the spot.

```python
# core/http/responses.py
class DataResponse(BaseModel, Generic[T]):
    data: T

class PaginatedResponse(BaseModel, Generic[T]):
    data: list[T]
    total: int
    skip: int
    limit: int

class MessageResponse(BaseModel):
    message: str
```

The rule is simple: if you're returning data, use `DataResponse`. If you're returning a list, use `PaginatedResponse`. If you're confirming an action with no data to return, use `MessageResponse`.

```python
@router.get("/tickets/{ticket_id}")
async def get_ticket(...) -> DataResponse[TicketRead]: ...

@router.get("/tickets")
async def list_tickets(...) -> PaginatedResponse[TicketRead]: ...

@router.delete("/tickets/{ticket_id}")
async def delete_ticket(...) -> MessageResponse: ...
```

Two reasons this matters. First, whoever consumes your API, a frontend, a mobile app, another service, always knows what shape is coming back. They don't need to check the docs for every endpoint to know if the data is nested under a key or not. Second, if you ever need to change the response format, you change it in one place. Not across 50 endpoints.

Combined with the custom exception format from the previous section, your API now has a fully predictable contract: successes always look one way, errors always look another.

---

**Don't add layers you don't need**

Two patterns I see constantly in FastAPI projects that add complexity without value:

**Repository pattern** — if you're using an ORM like Beanie or SQLAlchemy, you already have an abstraction layer over the database. Adding a repository layer on top is just writing your own ORM on top of an ORM. The only case where it makes sense is if you're using raw SQL without an ORM, where you actually need that abstraction. Otherwise you end up with `ticket_repository.find_by_id()` that does nothing except call `Ticket.find_one()`.

**Abstract base classes for services** — services are not interchangeable. You're never going to swap `TicketService` for a `MockTicketService` at runtime. Abstract base classes here are cargo cult from Java-style architecture applied to a language and framework that don't need it. Write plain functions in your service files and call them directly.

The general principle: every layer you add has a cost. It needs to be maintained, understood by new developers, and debugged when something goes wrong. Only add a layer when it solves a real problem you actually have.

---

**Structured logging with structlog**

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
structlog.contextvars.bind_contextvars(request_id=str(uuid.uuid4()))
```

Now every log line in that request lifecycle carries the same `request_id`. Debugging a production issue goes from "grep for something that might be related" to "filter by request_id and see exactly what happened."

One hard rule: never log passwords, tokens, raw LLM responses, or file contents. Ever.

---

**Multi-tenancy is a hard rule, not a guideline**

In a multi-tenant SaaS every database query must be scoped to the current organization. Not most queries, every query.

```python
# This is a security bug
await Ticket.find_one({"_id": ticket_id})

# This is correct
await Ticket.find_one({"_id": ticket_id, "organization_id": user.organization_id})
```

The first version is an IDOR vulnerability, Insecure Direct Object Reference. Any authenticated user can access any other organization's data by guessing or enumerating IDs. I've found this exact bug in production systems, including one I reported publicly. It's one of the most common vulnerabilities in multi-tenant applications and one of the easiest to prevent: always include `organization_id` in your queries, no exceptions.

For projects with stricter isolation requirements, you can go further, dynamic database sessions scoped per tenant, or data isolation at the schema or database level. For most early-stage SaaS applications, consistent query scoping is sufficient if applied without exceptions.

---

**ARQ over Celery for async stacks**

When you need background tasks in a FastAPI application, Celery is the default answer. It's mature, well-documented, and battle-tested. It's also synchronous at its core, which means running it alongside an async FastAPI app requires managing two different concurrency models.

ARQ is the modern alternative. It's built on asyncio, so it runs natively in the same async context as FastAPI. No separate thread pool, no synchronous worker process, just async functions that run in the background via a Redis queue.

```python
# Enqueue from anywhere
pool = await get_arq_pool()
await pool.enqueue_job("process_knowledge_file", str(node_id))

# The task itself
async def process_knowledge_file(ctx: dict, node_id: str) -> None:
    logger.info("knowledge.indexing_started", node_id=node_id)
    # async work here
    logger.info("knowledge.indexing_done", node_id=node_id)
```

The configuration is minimal compared to Celery, and since everything is async you can use your existing database clients, HTTP clients, and utilities without any adaptation.

Two rules for background tasks: they must be idempotent (safe to retry if they fail), and you never enqueue a task from inside another task.

---

**The structure that holds all of this together**

```
app/
├── core/                    # Cross-cutting infrastructure
│   ├── config.py           # Settings via pydantic-settings
│   ├── dependencies.py     # CurrentUser, CurrentAdmin, CurrentOwner
│   ├── http/
│   │   ├── exceptions.py   # AppError and subclasses
│   │   └── responses.py    # DataResponse, PaginatedResponse, MessageResponse
│   ├── logging/logger.py   # structlog setup
│   ├── db/database.py      # DB initialization
│   └── arq.py              # ARQ pool
│
└── [domain]/               # tickets/, auth/, users/, billing/, etc.
    ├── router.py           # HTTP endpoints only
    ├── service.py          # Business logic, pure Python
    ├── model.py            # ORM models
    └── schemas.py          # Pydantic I/O schemas
```

`core/` contains everything that cuts across domains, infrastructure, not business logic. Each domain folder is self-contained. The dependency direction is always inward: routers depend on services, services depend on models, nothing depends on routers.

---

This isn't the only way to structure a FastAPI project. But every decision here exists because the alternative caused a real problem, either in code I wrote, code I inherited, or vulnerabilities I found in other people's systems. The patterns that survive production tend to be the simple ones.

---

**If you want to use these conventions with an LLM**

I put all of these rules together as a `SKILL.md` you can drop into any LLM context, Claude, Cursor, Copilot, or any other. It covers everything in this post plus more, with a complete CRUD example at the end.

→ [fastapi-production-rules](https://github.com/17tayyy/fastapi-production-rules)
