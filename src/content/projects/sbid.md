---
title: "SBid POC"
---

PoC for a chain of IDOR vulnerabilities found in sBID, a Java-based educational platform, that could be exploited to achieve full Account Takeover (ATO). Reported, responsibly disclosed, and patched.

## Vulnerability chain

Four weaknesses chained together to take over any account without interacting with the victim's session:

| # | Type | Endpoint | Impact |
|---|------|----------|--------|
| 1 | IDOR | `/jsp/detall/alumne.jsp?aid=` | Full PII of any user |
| 2 | IDOR | `/modules/ACL` | Username enumeration |
| 3 | IDOR | `/modules/Missatges` | Read any user's messages |
| 4 | Insecure password reset | `/modules/Login` | ATO via chained IDORs |

### Why it works

The reset flow issues a token but never validates that the requester owns the account. Combined with the ability to read any user's messages via a sequential numeric ID, an attacker can request a reset for any account, intercept the token from the victim's inbox, and set a new password — all without interacting with the victim's session.

## Usage

```bash
uv sync
cp .env.example .env
# Fill in your credentials

# Enumerate user info
uv run src/main.py --type user-info --id 12345

# Get reset link only — no password change
uv run src/main.py --type ato-link --id 12345 --msg-id 1000 -v
```

---

For educational purposes only. The vulnerabilities documented here have been reported and patched. Do not use against systems you don't own or have explicit permission to test.
