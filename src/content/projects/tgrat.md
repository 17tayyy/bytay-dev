---
title: "TgRAT"
---

Multi-client Command & Control framework that uses a Telegram group with forum topics as the communication channel between server and agents. Each agent gets its own dedicated thread in the group for individual interaction, while the main channel handles global commands across all connected clients.

Built to understand how C2 frameworks work from the inside. For educational and research purposes only.

## How it works

The server is a Python process connected to a Telegram bot. When an agent connects, the server creates a dedicated forum topic for it in the group — that topic becomes the terminal for that agent. Commands go in as Telegram messages; responses come back as replies.

The general channel handles broadcast commands: `/sendall`, `/statusall`, `/photoall`, etc.

All traffic between server and agent is encrypted with AES-256-CBC + random IV per message, encoded in base64 for safe transmission over the socket.

## Features

### Agent capabilities
- System info on connect (hostname, OS)
- Arbitrary shell command execution
- Screenshot capture
- Webcam photo and video capture
- File upload/download (exfiltration)
- Chrome credential dump
- Periodic heartbeat (every 30s) to track active agents
- Cross-platform (Windows, Linux)

### Server
- Per-agent Telegram forum topics
- SQLite for client state persistence
- Parallel handling of multiple agents
- Heartbeat tracking with `last_seen` field
- Optional logging system with dedicated topic

## Commands

**Per-agent thread:**

| Command | Description |
|---------|-------------|
| `/shell <cmd>` | Execute shell command |
| `/screenshot` | Capture and send screenshot |
| `/download <path>` | Download file from agent |
| `/upload <path>` | Upload file to agent |
| `/photo <index>` | Webcam photo |
| `/stream <index> <time> <fps>` | Webcam video |
| `/dumpchrome` | Dump Chrome credentials |
| `/status` | Check if agent is online |
| `/kill` | Remove agent thread |

**Global (main thread):**

| Command | Description |
|---------|-------------|
| `/sendall <cmd>` | Execute on all agents |
| `/statusall` | Ping all agents |
| `/photoall` | Webcam photo from all |
| `/listclients` | List registered agents |
| `/clean` | Remove inactive agents (48h+) |
| `/logs` | Toggle logging system |
| `/shutdown` | Shut down C2 server |

## Requirements

- Python 3.8+
- Telegram bot token
- Telegram group with **forum topics** enabled
- `pyTelegramBotAPI`, `pycryptodome`, `mss`, `Pillow`, `opencv-python`

---

For educational and research purposes only. Do not use against systems you don't own or have explicit permission to test.
