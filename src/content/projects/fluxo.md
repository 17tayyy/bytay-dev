---
title: "Fluxo"
---

Decentralized crypto payment platform. The pitch: accept crypto payments through a clean API and dashboard without touching blockchain complexity directly. Think Stripe, but on-chain.

Still in development.

## The problem

Accepting crypto payments is still messy — hard to integrate, wallet management is complex, poor UX around gas fees and confirmations, and no unified API layer. Fluxo is an attempt to fix that at the infrastructure level.

## Custody models

Fluxo supports two approaches, which is the core design decision:

**Self-custody** — wallets are generated per merchant, private keys never leave the client. Maximum decentralization. Best for crypto-native companies.

**Cloud custody** — Fluxo manages wallets on behalf of merchants. Much simpler UX, but requires trust in the platform. Closer to a traditional Stripe experience.

## Core functionality

- Generate payment links and embeddable buttons
- Accept payments via REST API
- Automatic on-chain payment detection
- Webhooks on payment events: `payment.created`, `payment.confirmed`, `payment.failed`
- Merchant dashboard with real-time tracking, revenue analytics, and webhook configuration

## Tech stack

**Backend** — FastAPI, PostgreSQL, Redis, blockchain RPC providers (Infura, Alchemy)

**Frontend** — React dashboard

**Chains** — Ethereum + USDC on MVP, Polygon and Solana planned

**Future direction** — migration toward Go for performance; potential self-hosted nodes for independence from RPC providers

## Status

MVP phase covers Ethereum + USDC. Multi-chain support and the advanced webhook system are next. Private repo under the Fluxo GitHub org.
