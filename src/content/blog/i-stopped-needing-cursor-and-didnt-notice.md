---
title: "I Stopped Needing Cursor and Didn't Notice"
date: 2026-07-19
description: "I replaced VS Code without ever deciding to. What kept me there was never the editor, it was the agent living inside it, and ACP is what took that away."
tags: ["zed", "acp", "developer-tools"]
slug: "i-stopped-needing-cursor-and-didnt-notice"
draft: false
---

Three months. That's how long VS Code had been closed on my machine before I noticed.

I found out by accident. GitHub changed Copilot's pricing a while back, I was curious about how the new model actually felt, and I went to open VS Code to try it. Then I remembered I don't use VS Code anymore. There was no decision anywhere in that story; it just stopped happening.

That's the short version. The long one is about why, and the why isn't the editor.

---

## **The setup that broke**

My setup before this was boring and it worked. VS Code for everything, Copilot always on, Cursor occasionally when I wanted a second opinion on something. Copilot was good, which I think is worth saying, because posts like this usually open by explaining how bad the old tool was and mine really wasn't.

What broke it was the pricing change. Not the tool, the price. That was enough to make me look around for the first time in years, and the first thing I did wasn't switch editors, it was switch agents: Claude, plus Cursor's `agent` in a terminal.

That order matters more than it looks. Before I ever took Zed seriously, the agent had already left the editor. Keep that in mind for the next section, because it's the whole argument.

---

## **The agent was never the editor's**

Here's the thing none of the tooling ever made obvious: Copilot was a VS Code feature. Cursor went further and shipped an entire fork of an editor just so it could put an agent inside it. Both were selling you the same deal, which is that the agent lives here, so you live here too.

You were never picking an editor and then picking an agent. You were picking a bundle, and the editor half came along for the ride.

I actually had Zed installed for a long time before I really used it. It sat there while I stayed in VS Code, because comfort is a real cost and none of the reasons to move were good enough yet. Then I gave it a proper try and there was nothing left to give up, because the agent was already outside. Switching editors had stopped being a decision about my agent.

These days I use both. Claude Code most of the time, and Claude and Cursor over ACP inside Zed when I want to hand over context quickly or watch the edits land as they happen. I don't miss anything. The old Copilot usage limits, maybe, those were genuinely great, but that was always going to end.

So what is ACP actually doing here?

---

## **What ACP actually does**

The Agent Client Protocol is an open standard Zed put out so any agent can talk to any editor. It runs over JSON-RPC 2.0 on stdin and stdout, which is about as unglamorous as a protocol gets, and that's the point. The agent is a separate process, the editor is a client, and neither one needs to know anything about the other beyond the protocol.

Setting it up wasn't worth describing. I clicked add agent, logged in with Claude and with Cursor, done.

What surprised me is what happens afterwards. The agent doesn't touch my files, it asks. Zed prompts me before edits and before commands run, because file and terminal access goes through the editor rather than belonging to the agent. I'd been running agents for months without that boundary ever being visible anywhere, and it turns out I prefer seeing it.

**The detail I like most:** Claude Code doesn't speak ACP at all. Anthropic never implemented it. Zed wrote an adapter that wraps the Claude Code SDK and translates it, so Claude Code runs as its own process while Zed supplies the UI, the diffs, and the editor around it. A protocol that only works when both sides cooperate is a standard on paper; this one works even when one side never showed up.

That's also why I still use both surfaces. Claude Code in a terminal for most things, and the same agent over ACP when I want to give it files I already have open and then reject the diff hunk by hunk. Same agent, different surface, and now the surface is my choice.

If that shape feels familiar, it should. We've done this before.

---

## **We have seen this before**

There was a time when language support was something editors competed on. Every editor needed its own TypeScript integration, its own Python linter, its own Go tooling, and whoever had the best integrations won. If your language was well supported in one editor and badly supported in another, that decided your editor for you. It wasn't a preference, it was a constraint.

Then LSP happened. The language server became a separate process speaking a standard protocol, editors became clients, and language support stopped being a differentiator and became the baseline.

I know that mostly as history rather than something I lived through, and honestly that's the interesting part. I opened a file in Zed, it offered me an extension, I installed it, and I had a working language server without ever needing to know what LSP was. That's what winning looks like for a protocol, you stop noticing it exists.

ACP is the same move applied to agents. The agent is a separate process speaking a standard protocol, the editor is a client, and the thing that was keeping you inside one specific application stops being a reason to stay.

**So here's the prediction.** The editor that ships its own agent, bundled and exclusive, is going to age exactly like the editor that shipped its own TypeScript support. Not because the agent is bad, but because being locked to one client isn't something people accept once they've seen the alternative. The agents will be fine. The lock-in won't.

Which leaves one question: if the agent is portable, why am I still in Zed?

---

## **What's left when the agent leaves**

The editor has to justify itself on its own now, and this is where Zed stops being an argument and turns into a preference.

For me it's the performance, and it isn't close, it's genuinely insane. Huge projects open in about a second. I keep four or five windows open across different repos and nothing degrades. The git integration is good, not good for an editor, just good. Take extensions out of the equation and compare the bare editors, and it isn't a fair fight.

**One honest gap.** It's not finished. I had a rough time working with Jinja and FastAPI, and Vue and Nuxt are apparently still thin. VS Code has years of ecosystem that Zed doesn't have yet, and pretending otherwise would be dishonest. Those gaps are a matter of time, but the time hasn't passed yet.

So would I go back if VS Code or Cursor shipped better ACP support than Zed? Not a chance, and the reason is the entire point of this post. Better agent integration doesn't move me anymore, because the agent isn't the editor's to integrate. Rewrite VS Code in Rust, give Cursor the performance Zed has, and then we can talk; that would be an actual reason.

Three months ago that sentence would have made no sense to me. I picked editors based on which agent came with them. Now I pick them based on whether they're good editors, which is what I should have been doing all along, and what I couldn't do until the agent was free to leave.
