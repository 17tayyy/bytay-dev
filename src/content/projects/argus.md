---
title: "Argus"
---

OSINT platform for real-time monitoring of Telegram bots and chats. Register authorized bots, manage their allowed chats, ingest messages in the backend, store them in PostgreSQL, and consume them live from the frontend via SSE.

> Responsible use: only use with bots and chats you are explicitly authorized to monitor.

## Architecture

```
Telegram Chats → Bot Workers → FastAPI Backend → PostgreSQL (persistence)
                                              → Redis Pub/Sub → SSE → React Frontend
```

The bot worker receives Telegram messages and forwards them to the backend via an internal endpoint. The backend persists them and publishes to Redis. The frontend subscribes to an SSE stream and gets events in real time.

## Stack

- **Backend** — FastAPI, async SQLAlchemy, aiogram (multi-bot manager), Redis Pub/Sub + SSE for live streaming
- **Frontend** — React + TypeScript + TanStack Query + shadcn/ui
- **Database** — PostgreSQL
- **Auth** — JWT (`Authorization` header or `?token=` query param for SSE)

## Real-time flow

1. Bot worker receives a Telegram message
2. Sends payload to `POST /internal/messages` with `X-Argus-Bot-Token`
3. Backend persists the message in PostgreSQL and publishes to `chat:{chat_id}:messages` on Redis
4. Frontend `EventSource` at `GET /messages/sse/{chat_id}` receives the event live

## Main API endpoints

**Auth** — `POST /auth/register`, `POST /auth/login`, `GET /auth/me`

**Bots** — register, activate, deactivate, list chats per bot

**Messages** — list, filter by chat or sender, SSE stream per chat

**Senders** — list senders and their message history

## Running locally

```bash
# Backend
cd backend
uv sync
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Bot worker (separate terminal)
uv run python -m bots.telegram

# Frontend
cd frontend
pnpm install && pnpm dev
```

Swagger docs at `http://localhost:8000/docs`.

## Production

Docker Compose setup using images published to GHCR. Includes backend API, frontend (nginx), bot worker, Postgres, and Redis as separate services.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

## Roadmap

- Keyword-based alerts
- Notifications (Telegram, WhatsApp, Discord)
- Heartbeat monitoring for bots
- Track which group senders come from
- Initial message scan when registering new chats
