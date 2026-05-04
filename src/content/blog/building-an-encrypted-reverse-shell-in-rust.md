---
title: "Building an encrypted reverse shell in Rust"
date: 2026-05-04
description: "How shellox works under the hood — multi-session management with Tokio and encrypted comms over raw TCP."
tags: ["rust", "security", "systems"]
draft: false
pinned: false
---

This is a post about shellox, a reverse shell I built in Rust. The interesting parts are the session management and the encryption layer, so that's what I'll focus on.

## Why Rust

The short answer: I wanted to learn Rust, and building something I actually cared about seemed like the fastest way to do it. The longer answer involves ownership semantics being genuinely useful for a tool that manages concurrent connections, but that sounds like post-hoc justification and it probably is.

## Session management with Tokio

Each incoming connection gets its own task. Tokio's `mpsc` channels handle communication between the session tasks and the main controller loop.

```rust
use tokio::net::TcpListener;
use tokio::sync::mpsc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let listener = TcpListener::bind("0.0.0.0:4444").await?;
    let (tx, mut rx) = mpsc::channel(32);

    tokio::spawn(async move {
        while let Some(session) = rx.recv().await {
            // handle session commands
        }
    });

    loop {
        let (socket, addr) = listener.accept().await?;
        let tx = tx.clone();
        tokio::spawn(async move {
            handle_session(socket, addr, tx).await;
        });
    }
}
```

The design means you can have 50 sessions open and interact with any of them without blocking the others. This sounds obvious but getting the ownership model right took longer than I'd like to admit.

## Encryption

Communications are encrypted before anything hits the wire. The key is derived from a shared secret at connection time — nothing fancy, but enough that the traffic doesn't look like plaintext commands in a packet capture.

```rust
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, NewAead};

fn encrypt(data: &[u8], key: &[u8; 32]) -> Vec<u8> {
    let key = Key::from_slice(key);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(b"unique nonce"); // don't do this in prod
    cipher.encrypt(nonce, data).expect("encryption failure")
}
```

The nonce handling in the real implementation is less embarrassing than the example above.

## What I'd do differently

The command parsing on the client side is too naive — it splits on whitespace and calls it done. That breaks on any argument with a space in it, which is most paths on Windows. It's on the list.

The project is on [GitHub](https://github.com/17tayyy/shellox) if you want to look at the actual code.
