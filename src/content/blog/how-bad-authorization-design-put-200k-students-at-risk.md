---
title: "How Bad Authorization Design Put 200,000+ Students at Risk"
date: 2026-05-16
description: "How I discovered a chain of IDORs in a public education platform used by every FP student in Catalonia, chained them into a full account takeover, and reported it responsibly."
tags: ["security", "idor", "web-security", "responsible-disclosure"]
draft: false
pinned: true
---

## Context

sBID is a web platform used across all of Catalonia to manage internships for FP students (Formació Professional — Spain's vocational training program). Every student going through FP intermediate or advanced uses it. Their school uses it. Their tutor uses it. The companies hosting them use it.

That means the platform holds a complete record of every student's personal data: full name, date of birth, home address, phone number, email, national ID number (DNI), social security number (INSS), and in many cases family contact details including relatives' phone numbers. It also stores data on teachers, schools, and companies across the entire region.

We're talking about 200,000+ active students. Many of them minors.

In January 2026, I found that every single one of those records was accessible to any authenticated user and that any account in the system could be fully taken over in a matter of minutes.

This is how it worked.

---

## The first IDOR

I was browsing sBID as a normal student when I noticed something. Every time I clicked on my own profile details, the browser made a request like this:

```
GET /sBid/jsp/detall/alumne.jsp?aid=2281234&aversio=0&modal=dtH019209026
Host: www.empresaiformacio.org
Cookie: JSESSIONID={my_session}
```

The `aid` parameter caught my eye. It looked like a plain numeric ID. No hash, no token, nothing opaque about it. Just a number.

So I changed it.

```
GET /sBid/jsp/detall/alumne.jsp?aid=2281235&aversio=0&modal=dtH019209026
```

The server returned a 200 with a full HTML page containing someone else's personal data. Full name, date of birth, home address, phone number, email, and social security number. No error. No access denied. Just data.

The system was checking that I was logged in. It was not checking whether I was allowed to see that specific record.

That's an IDOR. And this was just the first one.

---

## It gets worse

I kept looking. The same pattern appeared everywhere.

Every entity in the system: students, teachers, companies, schools, workplaces, had its own detail endpoint, and every single one of them was vulnerable to the same attack. Change the ID, get the data.

```
GET /sBid/jsp/detall/professor.jsp?pid={id}        → teacher name, email, status
GET /sBid/jsp/detall/empresa.jsp?eid={id}          → company CIF/NIF, address, contacts
GET /sBid/jsp/detall/centre.jsp?cid={id}           → school details, institutional email
GET /sBid/jsp/detall/centreTreball.jsp?ctid={id}   → workplace contacts, location
```

But it wasn't just GET endpoints. The POST endpoints under `/sBid/modules/ACL` were equally broken:

```
moduleaction=historicUsuari          → historical usernames
moduleaction=dadesUsuari             → login username (this one matters later)
moduleaction=showDadesQuadernAlumne  → enrolled FP programs
```

Nine vulnerable endpoints in total. Every one of them accepting any authenticated session and returning whatever ID you asked for.

No authorization checks. No role validation. No ownership verification. Authentication and authorization are not the same thing — and whoever built sBID either didn't know that, or didn't care.

---

## The chain

At this point I had read access to basically everything in the system. But I kept digging.

One thing I noticed early on: all the IDs were sequential. Student IDs around 2,280,000. Teacher IDs around 5,500. Message IDs around 32,410,000. No UUIDs, no randomization, nothing to prevent someone from iterating over every single record in the database.

Then I found the messages endpoint.

```
POST /sBid/modules/Missatges
moduleaction=viewMailEntradaAjax&a={user_id}&m={message_id}
```

Two vulnerable parameters: the user ID and the message ID. Both integers. Both sequential. Any authenticated user could read any message from any other user just by changing those two numbers.

That's when I realized what this meant. The platform sends password reset links via its internal messaging system. If I could read anyone's messages, I could intercept their reset link. And if I could intercept their reset link, I could take over their account.

The pieces were all there. I just had to chain them together.

---

## The trick

There was one practical problem: message IDs were in the 32,410,000 range. Iterating blindly from zero wasn't going to work.

So I did something simple: I requested a password reset for my own account first.

The platform sent me a reset link via its internal messaging system. I read my own message, noted the message ID, and now I had an anchor point, a rough estimate of where the most recent messages were sitting in the sequence.

From there, I only needed to iterate over a small range around that ID to find a recently delivered reset link for any target user. In practice, it took 5 to 6 requests.

It sounds obvious in hindsight. But this kind of calibration is the difference between a working exploit and one that burns through thousands of requests and still finds nothing. When IDs are predictable, you don't need to brute force the entire space, you just need one reference point.

---

## Full ATO

With all the pieces in place, the full account takeover looked like this.

**Step 1: Get the target's email and username**

Using the student IDOR to get their email, then the `dadesUsuari` endpoint to get their login:

```
GET /sBid/jsp/detall/alumne.jsp?aid={target_id}
→ full name, email, phone, DNI, INSS

POST /sBid/modules/ACL
moduleaction=dadesUsuari&user_entity_id={target_id}&edit=true
→ username
```

**Step 2: Request a password reset — without authentication**

This endpoint required no session cookie. Anyone could trigger a reset for any account:

```
POST /sBid/modules/Login
moduleaction=renewPass&user={username}&email={email}
```

The platform sent a reset link to the target's internal inbox.

**Step 3: Calibrate the message ID range**

Request a reset for your own account, read your own message, note the ID. Now you know approximately where to look.

**Step 4: Read the target's inbox**

Iterate over message IDs near your reference point:

```
POST /sBid/modules/Missatges
moduleaction=viewMailEntradaAjax&a={target_user_id}&m={message_id}
```

After 5-6 requests, the reset message appears in the response — a JavaScript snippet rendering a modal with the full reset link embedded.

**Step 5: Extract the token and change the password**

The reset link contained a token in the `id` parameter. No expiry. No single-use restriction. Reusable indefinitely:

```
POST /sBid/modules/Login
moduleaction=confirmPass&id={token}&pass={new_password}&rePass={new_password}
```

The server responded with a redirect to `/sBID/`. Account compromised.

**Step 6: Log in as the victim**

The attacker now has full access to the account. Academic records, private messages, internship documents. And the victim has no idea until they try to log in and find their password no longer works.

The entire chain, from zero to full account takeover, required a single valid student account and about a minute of work.

---

## The script

To demonstrate the real-world impact of these vulnerabilities, I built a Python script that automated the full exploitation chain.

The script has three main components: a `SBIDClient` that handles authentication and session management, an `HTMLParser` that extracts structured data from the JSP responses, and a `SBIDScraper` that implements the actual exploits.

In practice it could enumerate students, teachers, companies and schools by iterating over sequential ID ranges, extract complete personal records for any entity in the system, and execute the full ATO chain automatically given a target user ID.

```bash
# Extract data for a specific student
uv run src/main.py --type user-info --id 12345

# Full account takeover on a target
uv run src/main.py --type ato-link --id 12345 --msg-id 1000 -v

# Scan all students in a range
uv run src/main.py --type user-info --start XXXXXXX --count 3
```

The full script is available on GitHub as a proof of concept. The vulnerabilities are fixed, but the code documents exactly how they worked.

→ [github.com/17tayyy/sbid-poc](https://github.com/17tayyy/sbid-poc)

---

## Responsible disclosure

When I realized the scope of what I had found, I didn't publish anything. Since my school uses sBID directly, I figured my tutor might have a direct contact with the platform or at least know the right channel to report it through. So I explained everything to him, handed over the full report, and he forwarded it to the sBID team on our behalf.

Around two weeks later, the vulnerabilities were fixed.
I also received a thank you email directly from the platform. No bug bounty program, no CVE, just a thank you, but that was enough. 

The point was never the recognition. The point was that 200,000+ students' data was no longer sitting there waiting to be scraped.

If you ever find something similar: don't publish immediately, and think about who in your circle might have a direct line to the affected team. It's the fastest and cleanest way to get it fixed.

---

## Lessons for devs

Everything I found comes down to one fundamental mistake: the system confused authentication with authorization.

Authentication answers "who are you?". Authorization answers "are you allowed to do this?". sBID implemented the first and completely skipped the second.

The fix is conceptually simple:

```python
# What sBID was doing
if user.is_authenticated():
    return get_student_data(student_id)

# What it should have been doing
if user.is_authenticated():
    if (user.is_tutor_of(student_id) or
        user.is_same_student(student_id) or
        user.is_admin()):
        return get_student_data(student_id)
    else:
        raise UnauthorizedException("Access denied")
```

Beyond that, a few things would have stopped or significantly slowed down the full ATO chain:

**Use non-sequential IDs.** UUIDs make enumeration practically impossible. Sequential integers are an open invitation to scrape your entire database.

**Expire your reset tokens.** A reset token that never expires and can be reused indefinitely is not a token, it's a permanent backdoor. 15 minutes, single use, invalidated on consumption.

**Require authentication for password reset requests.** Or at minimum, implement rate limiting. The `renewPass` endpoint accepted unauthenticated requests with no throttling whatsoever.

**Store reset tokens out of band.** Sending reset links through the platform's own internal messaging system — which was itself vulnerable to IDOR — created a direct path from "read someone's messages" to "own their account".

None of these are exotic security measures. They're basics. But skipping all of them at once, in a system handling the personal data of hundreds of thousands of students, turned a bad day into a critical incident.
