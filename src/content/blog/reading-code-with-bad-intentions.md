---
title: "On reading other people's code with bad intentions"
date: 2025-02-03
description: "Security research is just code review for systems that didn't ask for it. Some notes on the mindset shift from building to breaking."
tags: ["security", "pentesting", "mindset"]
draft: false
---

There's a specific moment when your mental model of software permanently changes, and it's not when you write your first production API or deploy your first service. It's when you first look at a piece of software and your immediate question is not "how does this work?" but "where does this break?"

Once that question becomes your default, you can't really go back.

## Building vs. breaking aren't opposites

The framing of "offensive vs. defensive" security is, in my experience, a little misleading. Understanding how to break things is the prerequisite for understanding how to build things that are hard to break. They're the same skill from different vantage points.

When you read a codebase looking for vulnerabilities, you're doing the most thorough code review possible. You're asking questions the original developer never thought to ask because they were focused on making the happy path work.

The happy path is not where vulnerabilities live.

## What you look for

Authentication is almost always where you start. Not because it's always wrong, but because when it's wrong, everything behind it is wrong. Bypassable auth checks, JWT tokens with weak or missing signature verification, session tokens that don't expire — these are the kind of mistakes that happen when someone understands the concept but hasn't thought through the implementation.

The second place is anywhere user input enters a system. Every form field, every query parameter, every uploaded file, every API request body is an opportunity for someone to put something in that the developer didn't account for. SQL queries constructed with string concatenation. Path traversal in file download endpoints. Deserialization of untrusted data.

Third: anything that relies on client-side enforcement. If the only thing standing between a user and restricted data is a condition checked in JavaScript before making the API call, the condition doesn't count. You can just... not run that code.

## The responsible disclosure part

I found a real vulnerability in a production system while doing security research. Not on Hack The Box — in something live, with real users. The fix was not complicated. The window between "this is a problem" and "this is reported" was short.

Responsible disclosure is: you find something, you tell the people who can fix it, you give them a reasonable amount of time, you publish after it's patched. It's not a complicated process. The goal is for the vulnerability to stop existing, not for you to get credit for finding it — though the proof of concept is worth publishing afterward, because others can learn from it.

The system got patched. The PoC is public. That's the whole story.

## Hack The Box, practically

HTB machines are a good training ground because the vulnerabilities are real — not contrived CTF puzzles, but actual service misconfigurations, actual CVEs, actual exploitation techniques. Getting root on a machine that was designed by someone who knows what they're doing is different from running a script at a web form.

25+ machines later, the biggest lesson isn't any specific technique. It's learning to be systematic rather than hopeful. You enumerate everything before you exploit anything. You document as you go. You understand why something worked before moving on.

If you skip the enumeration because you think you see the answer, you're wrong about half the time, and you'll spend three hours proving it.
