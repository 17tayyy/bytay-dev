---
title: "TgCloud"
---

Full-stack cloud storage platform built on top of Telegram's infrastructure. Web frontend, encrypted CLI, JWT auth. Uses Telegram as the actual storage backend — unlimited space, no self-hosted storage costs.

## Features

- **Unlimited storage** — Telegram as the backend, files stored in a private channel
- **Secure sharing** — expiring public links for files and folders (60 min default)
- **Real-time** — WebSocket-powered progress tracking for uploads and downloads
- **Encrypted CLI** — for people who'd rather not use a browser for anything
- **JWT auth** — standard token-based authentication
- **Docker-ready** — single-script deployment

## Tech stack

**Backend** — FastAPI, SQLAlchemy (SQLite), Telethon (Telegram client), WebSocket

**Frontend** — React 18 + TypeScript, Vite, TailwindCSS + shadcn/ui, TanStack Query

## Quick start

```bash
git clone https://github.com/17tayyy/TgCloud.git
cd TgCloud

# Production deployment (Docker)
python deploy.py deploy

# Development (no Docker)
python deploy.py dev
```

You'll need Telegram API credentials from [my.telegram.org/apps](https://my.telegram.org/apps) and a Telegram channel to use as storage.

```env
API_ID=your_api_id
API_HASH=your_api_hash
CHAT_ID=your_channel_id
```

## API

```
POST /api/v1/register
POST /api/v1/token

GET    /api/v1/folders/
POST   /api/v1/folders/
GET    /api/v1/folders/{name}/files/
POST   /api/v1/folders/{name}/files/          # upload
GET    /api/v1/folders/{name}/files/{file}/download
DELETE /api/v1/folders/{name}/files/{file}

POST /api/v1/folders/{name}/files/{file}/share   # returns expiring token
GET  /access/file/{token}                         # public file access
```

## Project structure

```
TgCloud/
├── deploy.py           # deployment script
├── backend/
│   ├── app/
│   │   ├── api/        # endpoints + websocket handlers
│   │   ├── auth/       # JWT auth
│   │   ├── client/     # Telegram integration + DB models
│   │   └── services/
│   └── main.py
└── frontend/
    └── src/
        └── components/ # Dashboard, FileItem, Login, SharedFile...
```
