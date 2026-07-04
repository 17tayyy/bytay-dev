---
title: "Code Is Cheap, Judgment Is Not: What AI Can't Automate in Software Development"
date: 2026-07-04
description: "Any AI can generate code that works. Deciding if it makes sense in your system is a different skill, and it's the one that actually matters now."
tags: ["ai", "software-engineering", "programming"]
draft: false
---

Generating code has never been this cheap. Type a prompt, get a function. Type a longer prompt, get a whole module. The friction that used to slow this down, syntax, boilerplate, remembering the right method name, is mostly gone.

But the cost of building software was never really in typing the code. It was in deciding what to build, why, and whether the result actually fits the system it lives in. That cost didn't disappear when generation got cheap. It just stopped being hidden behind the effort of writing the code by hand.

Now that anyone can produce something that runs, the gap between code that works and code that makes sense is more exposed than ever.

## The problem with "it works"

Ask an AI to add a task queue to your Python project (example) and it will probably suggest Celery. It compiles. It runs. Tests pass. By every surface-level metric, it works.

But "it works" and "it makes sense" are not the same claim. Celery is powerful, but it also comes with a broker, a result backend, and a fair amount of operational weight. If your workload is a handful of background jobs on a small service, ARQ or other lightweight task queues might be a better fit, or you might not need a queue at all. None of that shows up in a quick "does the code run" check. It only shows up when you understand what the system actually needs.

The AI doesn't default to Celery because it evaluated your context and decided it was the best option. It defaults to Celery because Celery is what shows up most often in the data it learned from. The suggestion is a popularity signal, not a judgment call. And popularity is not the same thing as fit.

This is the part that's easy to miss when the code just runs: passing tests tells you the code does what you asked. It says nothing about whether what you asked was the right thing to build.

## Choosing what isn't the obvious answer

Ask an AI to design the retrieval layer for a RAG pipeline, and it will likely point you toward the most common stack: a vector database like Pinecone or Weaviate, paired with whatever embedding model shows up most often in tutorials. That's not a bad answer. It's just the average answer, the one that comes from what's been written about the most, not from what your system actually needs.

If you already know your architecture, your cloud provider, your latency requirements, and your data residency constraints, a less "obvious" choice like AWS Bedrock might actually be the better fit. If your stack already runs on AWS, that's not because it's trendy or novel, but because it integrates with infrastructure you already run, and it removes a set of operational problems the popular stack would have introduced. An AI recommending the default option has no way of knowing any of that. It doesn't know your architecture. It only knows what gets recommended most often for "RAG pipeline."

Picking the non-obvious option here isn't a matter of taste. It's a judgment call that depends on understanding the system you're actually building on, something no amount of generation can substitute for.

## Why this happens

None of this is a flaw in the model. It's a direct consequence of how it was trained. Language models learn from what's been written, and what's been written skews heavily toward whatever pattern shows up most often. Celery gets recommended more than ARQ because more tutorials, more Stack Overflow answers, and more blog posts use Celery. The most common vector database gets recommended over Bedrock for the same reason: frequency, not fit.

The model has no access to your architecture, your constraints, or the reasoning behind decisions your team already made. It can't ask "why" the way a person can, and even if it could, the answer isn't in the training data. It's in your system.

This is why the "obvious" suggestion isn't neutral. It's a reflection of what's popular, and popularity accumulates for reasons that have nothing to do with whether something is the right call for your specific case.

## The skill worth training

Generation got cheap. Judgment didn't. Anyone can produce code that compiles, passes tests, and does roughly what was asked. That was never the hard part, even before AI made it faster.

The hard part is still deciding if what got generated actually fits the system you're building. That decision doesn't come from a better prompt. It comes from understanding the fundamentals well enough to know when the obvious answer is wrong.
That's the skill worth training now. Not typing code faster. Building the judgment to know if the code that got generated actually belongs.

The next step is putting this to the test: giving an AI a real problem with zero guidance, and reviewing exactly where the judgment gap shows up.
