---
title: "My Laptop Didn't Know What My Desktop Knew"
date: 2026-11-05
description: "Claude Code remembers things, but its memory is scattered across folders, stuck on one machine and slowly going out of date. So I built wong: one brain for all my projects, synced to every machine, checked against how the projects really are, and encrypted in the cloud so not even I can read it."
tags: ["AI", "Tooling"]
draft: false
---

I've never liked how Claude Code manages its memory.

Not because it doesn't work. It does. As you work, it saves what it learns in
markdown files: a decision, a preference, how something gets deployed. Next
session, it remembers. That part is great, and it's why I kept using it
without thinking much about it.

What I didn't like was everything around it. The files ended up in folders
under my home that I never opened, one per path, and I didn't really know
where everything was. Each folder had an index the agent read at the start of
every session, and only the first 200 lines of it get loaded, so every now
and then it grew past that and had to be rewritten to fit. It worked. It just
never felt like my memory.

## The laptop

What actually pushed me was my laptop.

I do most of my work on my desktop, and that's where everything lived: what
the agent had learned about my projects, my preferences, how I like things
done. On the laptop, Claude Code started from zero. Same agent, same repos,
but developing there didn't feel the same. I was explaining things I'd already
explained and correcting things I'd already corrected.

So the first idea was simple: sync it.

## Then I looked inside

To sync my memory I had to gather it first, and that was the first time I saw
all of it in one place.

There were 18 folders. The product I work on is several repos, and its memory
was split across six of them, so what the agent learned in the backend never
reached the frontend. One preference, no attribution trailers in my commits,
was saved 11 times, once by every repo that had learned it on its own.

And a lot of it wasn't true anymore. Agents write notes like status updates:
"not deployed yet", "in progress", "on hold". I found around 60 of those. One
said an issue was on hold, and it was done. When I checked the 286 notes
against the code and the issues they talked about, 20 of them were wrong.

Nobody had noticed, and nothing could have. A note doesn't say what it
depends on, so nothing can tell when it stops being true.

That changed the idea. Syncing would just give me the same wrong notes on two
machines.

## What I built

wong does three things.

**It manages the memory better.** Everything goes into one brain, a folder of
markdown notes: `me/` for what applies everywhere, and one folder per project,
shared by all of its repos. Claude Code keeps reading and writing it the way
it always did; wong just points it there. And when the agent opens a file,
wong shows it the notes about that file, so the index isn't the only way in
anymore.

**It syncs.** The brain lives on a server, your own, with a copy on every
machine. A session pulls when it starts and pushes when it ends, so every
machine connected to it starts knowing what the others know.

**It checks the memory against reality.** Every note says what it relies on:
a file, a commit, an issue. wong checks them against how the project really
is (a deleted file, an issue that got closed, a deploy that already happened)
and tells the agent which notes went stale. GitHub and Linear connect in one
click, so a deleted file or a closed issue turns into a task on the notes that
cite it, and every pull request gets a check that says how many notes cite the
files it deletes. The agent fixes the stale notes in its own session. wong never calls a model itself. It only finds what's wrong, and the
agent working on the project, which already has the context, decides what the
note should say now.

That last part is why the notes stay up to date without me having to think
about it.

## What changed

The memory feels like mine now. I can open it, edit it and see what's in it.

The server comes with a dashboard where I can see what changed, which machine
or agent changed it, and undo it. There's a graph where I can split everything
by project and see what's related to what. And since it's all markdown, the
brain also opens as an Obsidian vault.

Claude seems to find things better too. I can't put a number on that one, but
it makes sense: it has one place to look instead of six, and the notes it gets
are the ones that matter for what it's doing.

And it isn't only for Claude Code anymore. Codex, Cursor and OpenCode get the
same thing: the memory when a session starts, the notes on the file they're
about to touch, the check when they save a note. Anything else that speaks MCP
can use the same brain, and claude.ai can connect to it like any other
connector, so what your agents learned while coding is there when you're just
chatting.

## How I built it

With Claude Code and agents. The first version took three days, and 1.0 came
out nine days after the first commit. I don't mind saying it. I have opinions about agentic development, but that's another post.

What I will say is that wong was built by agents that were already using it.
From the first day, the sessions working on wong kept their memory in wong,
and a lot of what's in it now came from watching them. After a day of use, one
agent complained that some notes had turned into logs: a dated paragraph
appended every session, until the current state was impossible to piece
together. wong points those out now. In my brain there were 37 of them, and
the worst one was the note that tracks wong's own progress.

## Trying it

If you use Claude Code and any of this sounds familiar, or you've never
looked at what your agent actually remembers, give it a try.

You can host it yourself today: one Docker container for the server, and one
line on each machine.

```console
$ curl -fsSL https://wong.bytay.dev/install.sh | sh -s -- http://wong.lan:8787
```

Leave the URL out and it runs on a single machine, without a server. Either
way it imports the memory Claude Code already has, so the first thing you'll
see is your own memory, all in one place, the way I first saw mine.

The code is on GitHub at [17tayyy/wong](https://github.com/17tayyy/wong),
under AGPL-3.0.

## wong cloud

I know self-hosting isn't for everyone. If you're a frontend developer, you
probably don't feel like setting up a server, and you shouldn't have to rent a
VPS just so your agent remembers things.

So I built wong cloud: the same wong, hosted by me. You sign in with GitHub,
connect your machines, and forget about keeping a server running, updating it
or backing it up.

While I was building it, I tried to look at wong from the outside, as someone
deciding whether to pay for it. And there was a problem: everything your
agents write down about your work would end up on my server, and I'd be able
to read all of it. I wouldn't pay for that. I don't want anyone reading what I
tell my agents, and I'd understand anyone who didn't pay just for that reason.
I'm also very much on the side of privacy, so it had to be real encryption.

So in wong cloud every brain is encrypted end to end. Your notes are encrypted
on your machines before they leave them, and only your devices can open them.
A new machine gets the key by being approved from one that already has it, and
the dashboard decrypts everything in your browser (on a computer, for now).

What I can see is your account, the names of your machines and where they
connect from, and how many files you have, with their sizes and dates. Not
what they say, not what they're called, not your projects. That
also means that if you lose every device and your recovery code, your brain is
gone, for me too.

There's one exception, and only you can turn it on. AIs that run in someone
else's cloud, like claude.ai, can't read an encrypted brain. If you want them
to, `wong keys cloud-ai on` lets the server open your notes for those calls.
The encryption protects your notes from me, not from the AI you choose to give
them to.

If you host wong yourself, the same encryption is there as an option, with
`wong keys seal`.

When the beta ends, it'll be $6 a month, or $60 a year, with a 14-day trial
and no card. It can be that cheap because of the decision I mentioned earlier:
wong never calls a model. A brain is markdown and a few dates to compare, and
hosting that costs cents.

Nothing is locked behind it. Self-hosted wong is the whole product, you can
export your brain whenever you want, and you can move between your own server
and the cloud in either direction.

For now it's in beta, by invitation, and free while the beta lasts. The first
person I invited is already using it, and so far everything has gone well.
Leave your email at [wong.bytay.dev](https://wong.bytay.dev) and I'll send you
an invite.

## What's coming

wong just reached 1.0, and the next big thing is teams: shared projects with
roles, so the agents of a whole team learn from each other, while your `me/`
stays yours. The encrypted dashboard on phones is on the list too.

And whatever comes up from people actually using it, which is how most of
wong got built in the first place.
