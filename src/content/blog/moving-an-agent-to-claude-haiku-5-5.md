---
title: "Thinking Off, Handoffs Missed: What I Measured Moving an Agent to Claude Haiku 5.5"
date: 2026-10-09
description: "Claude Haiku 5.5 thinks by default, and the obvious migration move is to turn that off. I ran 960 support conversations to see what it costs. With thinking off, the agent skipped a quarter of the handoffs it should have made. With thinking on at the lowest effort, none."
tags: ["ai", "llm", "claude", "benchmarks"]
draft: false
---

> **Customer:** I'd like to talk to a real person, please.
>
> **Agent:** I can connect you with someone on the support team. Could you
> briefly tell me what it's about, so I can pass that along?

That's Claude Haiku 5.5 with thinking turned off, inside a small test support
agent. It reads fine. It's polite, and it even sounds like it's already on it. What
it didn't do was call the tool that actually hands the conversation to a
person. Out of 10 runs of that exact message, it called it twice.

With thinking on, at the lowest effort, it called it 10 times out of 10.

Turning thinking off is the first thing most people will do when they move an
agent from Haiku 4.5 to 5.5. I would have done it too. So I measured what it
costs.

---

## Why you'd turn it off

Haiku 5.5 is a tenth of the price of Haiku 4.5 ($0.10 / $0.50 per million
input / output tokens, against $1 / $5), and it's better at following
instructions. It also thinks by default, which 4.5 didn't, with an `effort`
parameter that defaults to `medium`.

If your agent worked on 4.5, thinking looks like a change you didn't ask for:
more output tokens, more latency, new blocks in every response. Haiku 5.5
accepts `thinking: {"type": "disabled"}` at effort `high` or below, and then
it behaves like the model you already tested. That's the migration plan I'd
have written.

Anthropic's migration notes do warn that without thinking the model can skip a
tool call it needs, but they tie it to requests that also ask for JSON output.
A support agent usually doesn't, so it's easy to read that warning as being
about someone else. I wanted to know whether it was.

---

## The test

It's small on purpose, so anyone can rerun it:
[haiku-thinking-bench](https://github.com/17tayyy/haiku-thinking-bench).

- A support agent for a made-up company, with a short system prompt and four
  tools: search the help center, look up an order, look up the customer's
  plan, and hand off to a person.
- The prompt is explicit about handoffs. Refunds, disputed charges, account
  access problems, legal or data-deletion requests, and anyone who asks for a
  person go to `hand_off_to_human`, and *"writing that someone will follow up
  does nothing unless you call the tool."*
- 24 invented conversations: 8 that must end in a handoff, 12 that need a
  lookup, 2 the help center doesn't cover, and 2 of small talk.
- Four configurations: Haiku 4.5, and Haiku 5.5 with thinking off, adaptive
  `low` and adaptive `medium`.
- Every case 10 times under every configuration: 960 conversations,
  interleaved and shuffled so no configuration gets a quieter moment of the
  API.

Nothing is graded by a model. A run passes if it called the tools the case
needs and none of the ones it shouldn't: a question about an order has to call
`get_order` and must not end in a handoff. I tried an LLM judge on an earlier
version of this and spent more time debugging the judge than the agent. Here
the question is which tools got called, and that you can just count.

---

## What came out

| | Haiku 4.5 | 5.5, thinking off | 5.5, `low` | 5.5, `medium` |
|---|---:|---:|---:|---:|
| Handoffs missed | 14 / 80 | **20 / 80** | **0 / 80** | 0 / 80 |
| Handoffs nobody needed | 0 / 160 | 0 / 160 | 0 / 160 | 0 / 160 |
| Lookups done right | 120 / 120 | 120 / 120 | 120 / 120 | 120 / 120 |
| p90 latency | 2.51 s | 2.56 s | 3.04 s | 3.30 s |
| Cost per conversation | $0.0027 | $0.00027 | $0.00030 | $0.00032 |

Three things in that table surprised me.

**The problem is only the handoff.** Every configuration looked up every order,
every plan and every help article it was supposed to. A lookup is the easy
kind of tool call: the model can't write the answer without its result. A
handoff isn't. There is always something plausible the model can write
instead, and with thinking off it did, a quarter of the time.

**Thinking didn't make it hand off more than it should.** I expected the price
of reliable handoffs to be some unneeded ones. There were none, in any
configuration, across 160 runs per configuration that shouldn't hand off.

**Thinking off is no better than Haiku 4.5 here.** 20 misses against 14. Migrate
with thinking off and you get the new model's price with roughly the old
model's handoffs.

An earlier full run, before a small fix to the fake data that these cases
don't use, gave 17 / 80 missed with thinking off and 1 / 80 with `low`. Same
picture.

---

## What a missed handoff looks like

None of the misses were refusals. Almost all of them came from three cases:

| Case | Thinking off | `low` |
|---|---:|---:|
| "I'd like to talk to a real person" | 2 / 10 | 10 / 10 |
| Charged, but the account still says Free | 3 / 10 | 10 / 10 |
| Refund for a course bought three weeks ago | 6 / 10 | 10 / 10 |

Reading the 20 replies, they fall into three patterns.

**Asking before acting** (9 of 20). "I can connect you with someone... what's
it about?" or "I can pass this to our support team. Shall I do that?" A
reasonable thing for a person to say. Not what the prompt asked for.

**Saying it, not doing it** (4 of 20). This is the one I'd worry about most:

> I'm sorry the course didn't meet your expectations. Refunds are handled by
> our support team, so I'll pass this to them with the details. Could you
> share your order number? That will help them find your purchase quickly.

"I'll pass this to them", and no tool call. The customer has just been told
it's handled.

**Believing the tool over the customer** (7 of 20). The customer says they
paid and the account still shows Free. The model looks up the plan, sees Pro,
and answers that the account isn't showing as Free on our end. A disputed
charge stays with the bot because the data disagrees with the person who's
looking at the screen.

So is it just a delay? I checked that too. I replayed those three cases one
turn later, with the customer answering whatever the model had asked. With
thinking off it handed off 28 times out of 30.

On paper that's fine. In a chat it isn't. People leave: someone who's been
told "I'll pass this to the team" has no reason to keep the tab open, and if
they don't answer, the handoff never happens and nobody on the team knows the
conversation exists. And in the second pattern, the agent has already told
them it's done, which is the kind of failure that stops a customer from
asking again.

---

## What I'd set

```python
# loops where the model can call tools
TOOL_LOOP = {"thinking": {"type": "adaptive"}, "output_config": {"effort": "low"}}

# one-shot calls: classify, rewrite, summarise, describe an image
ONE_SHOT = {"thinking": {"type": "disabled"}}
```

`low` fixed every miss for about 11% more per conversation and half a second
more at p90. `medium` didn't fix anything `low` hadn't, and it cost more.

Thinking stays off for one-shot calls because it counts against `max_tokens`.
A classifier with a 50-token cap can spend all of it thinking and return no
answer at all.

Turning it on in a tool loop has one condition, though, and it's easy to miss
until it's in production.

---

## Thinking blocks remember what came before them

When the model thinks and then calls a tool, you send its thinking block back
with the tool result. That part isn't new. What's new with Haiku 5.5 is that
the API checks that **everything before the block is exactly as it was** when
the block was produced: the system prompt, the tool list, every earlier
message. On accounts created on or after August 31, 2026, sending a block back
after any of those changed is a 400:

```
400 invalid_request_error: messages.1.content.0: Invalid `signature` in
`thinking` block. The block is bound to a different conversation.
```

There's a script in the repo, `preserved_check.py`, that tells you in one
request whether your account enforces this: it sends the same turn back twice,
once untouched and once with a sentence added to the system prompt.

Three habits from loops written before thinking existed need changing:

- **Copying only text and tool calls into the next request.** That was all
  there was to copy before. Send the thinking blocks back too, including the
  ones whose `thinking` field is an empty string: by default Haiku 5.5 only
  returns the signature, and the signature is what the next request needs.
- **Rebuilding the system prompt on every iteration.** If it contains the
  date, it can change halfway through a turn. Build it once per turn.
- **Removing tools on the last iteration** so the model has to answer. Keep
  them and send `tool_choice: {"type": "none"}` instead.

The rule is that inside a turn, the loop only appends. Prompt caching rewards
the same thing, so it's worth doing even on an account that isn't enforced.

---

## The rest of the migration

None of these surprised me the way the handoffs did, but each one is a 400 or
a silent truncation:

- `temperature`, `top_p` and `top_k` have to stay at their defaults, and an
  assistant prefill is rejected. Structured outputs replace both tricks.
- `budget_tokens` is gone. `effort` is the control now.
- The tokenizer counts about 30% more tokens for the same text. Raise the
  `max_tokens` caps that were already tight, and warn whoever reads the cost
  dashboard.
- Prompt caching starts at 512 tokens instead of 4,096, so short prompts that
  never cached now do.
- Haiku 5.5 can decline a request with `stop_reason: "refusal"`, possibly
  after half a sentence, and unlike the bigger models it has no server-side
  fallback. Treat it as a turn with no answer: drop what you streamed, send a
  fallback message, hand the conversation to a person. Retrying the same
  request just gets it declined again.

---

## Conclusion

- **Don't turn thinking off by reflex in a tool loop.** Here it was the
  difference between missing a quarter of the handoffs and missing none, for
  11% more per conversation.
- **Test the tool calls that end something, not only the lookups.** Lookups
  were perfect in every configuration. Every failure was in the one tool the
  model could talk its way around.
- **Read the misses, don't just count them.** "Asked a question first" and
  "said it had passed it on" are both misses, and they're not the same problem.
- **Thinking didn't cause unneeded handoffs.** Check it on your own cases, but
  don't assume that trade-off exists.
- **Make the loop append-only before you turn thinking on.**

The bench is small and the prompt is mine, so 25% isn't your number. It's a
reason to run the same test on your own agent before shipping thinking off. It
takes a few minutes and costs less than a dollar.
