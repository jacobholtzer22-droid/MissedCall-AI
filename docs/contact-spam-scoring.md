# Branch notes — `contact-spam-scoring`

Aug 2026. Additive spam scoring for `/api/contact`, plus closing two silent
lead-loss paths. Full reference lives in **CLAUDE.md §17**; this file is the
deploy-facing summary.

---

## ⚠️ Read this before touching Turnstile

> **Do not set `TURNSTILE_ENFORCE=true`.** No form on the platform or on any client
> site emits a Turnstile token, and no Turnstile widget script is deployed anywhere.
> `TURNSTILE_SECRET_KEY` and `TURNSTILE_ENFORCE` are both absent from Vercel
> production. Setting `TURNSTILE_ENFORCE=true` today would mark **every real lead
> from every client** as spam and suppress **all** owner notifications
> platform-wide. It may only be enabled after a Turnstile widget is confirmed live
> on every form that POSTs to `/api/contact` — including the client-site repos,
> which deploy independently of this one.

The `enforce && !turnstileToken` auto-condemn branch has been **removed** for that
reason. A missing token is now worth nothing; only an explicit siteverify
`success:false` adds score (25), which can never condemn on its own.

---

## Why this branch exists

Bots were reaching client inboxes despite the existing honeypot + Turnstile
hardening. Root cause: **neither check was operative.** No form emitted a honeypot
field or a Turnstile token, and neither Turnstile env var existed in production, so
`detectSpam()` returned `{isSpam:false}` for 100% of requests.

## The invariant

**No submission is ever dropped.** Every request writes a `WebsiteLead` row. A high
score sets `status='spam'` and suppresses the owner notification — it never
discards the record. Both historical silent-drop paths are closed:

| Path | Before | Now |
|---|---|---|
| Marketing-page spam | logged, returned 200, **no DB write** | row written against `MARKETING_BUSINESS_ID` |
| `businessSlug` resolves to nothing | logged, returned 404, **lead lost** | 404 kept, plus a throttled alert email carrying the full payload |

---

## Shadow-mode rollout

This endpoint is the sole lead funnel for every client. Scoring goes live in shadow
mode first: **score and store everything, condemn nothing.**

### Step 1 — deploy at `SPAM_SCORE_THRESHOLD=100000`

Every submission is scored; `spamScore`, `spamReasons`, `sourceIp` and `userAgent`
are written to every row. `isSpam` is `score >= threshold`, so at 100000 it is
`false` for everything — **including a filled honeypot**, which is worth 1000.
Nothing is condemned, no Contact creation is skipped, and **every owner SMS and
email fires exactly as it does today.**

The guarantee, in `app/api/contact/route.ts`:

```ts
const verdict = scoreSubmission({ ... }, velocity)   // always runs

const leadFields = {
  name, phone, email, message,
  spamScore: verdict.score,        // always written
  spamReasons: verdict.reasons,    // always written
  sourceIp, userAgent,             // always written
}

if (verdict.isSpam) {              // <- the ONLY thing that changes behaviour
  await db.websiteLead.create({ data: { ...leadFields, status: 'spam' } })
  return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
}

// false at threshold 100000 -> falls through to exactly the pre-feature code:
await findOrCreateContact({ ... })
await db.websiteLead.create({ data: { ...leadFields, status: 'new' } })
await notifyOwnerOnWebsiteLead(business, { ... })
```

`/api/admin/spam-leads` matches `status='spam' OR spamScore != null`, so cleared
rows still show up in the view — that is the whole point of shadow mode.

### Step 2 — watch `/admin/spam` for one week

Admin → Tools → "Spam / scored leads". Default filter is score ≥ 70, which surfaces
near misses in both directions; "All scored" shows the full distribution. Use it to
tune `GMAIL_DOTS_3` (currently 0) and to confirm no real client lead scores near 100.

### Step 3 — lower `SPAM_SCORE_THRESHOLD` to `100`

Condemnation begins at that moment. Nothing else changes.

### Threshold mechanics

`getSpamThreshold()` reads `process.env.SPAM_SCORE_THRESHOLD` **on every call**, not
at module load — regression-tested — so retuning needs no code change.

**But Vercel binds environment variables to a deployment.** Editing the variable in
the dashboard does not reach functions already running. After changing it, trigger a
redeploy; re-deploying the same commit from the Vercel dashboard is enough. The
per-request read is what makes the value swappable; the redeploy is a platform
requirement, not a code one.

A malformed or non-positive value falls back to the default of 100 rather than
condemning everything. Also regression-tested.

---

## Deploy checklist

1. `npm run db:push` — **already applied to the production Neon database.** All four
   columns are nullable with no default, so pre-merge code is unaffected.
2. Set `SPAM_SCORE_THRESHOLD=100000` in Vercel (Production + Preview).
3. Merge and deploy.
4. Confirm a real lead still notifies its owner, and that the row appears at
   `/admin/spam` under "All scored" with a score and reasons.
5. After one week, set `SPAM_SCORE_THRESHOLD=100` and **redeploy**.

## Not done here, deliberately

- **Client-site repos still send no honeypot.** `app/components/ContactForm.tsx` is
  the only form in this repo emitting `hp_7d3a_ref`. Every tenant site deploys
  separately. The scoring does not lean on the honeypot — all four observed samples
  are condemned by content signals alone — so this is a follow-up, not a blocker.
- **Assigned NANP area-code list.** The samples used 271, 221 and 525: structurally
  legal but unassigned. Pull the real list from NANPA's "Geographic Area Code Number
  Report" CSV (`https://nationalnanpa.com/enas/geoAreaCodeNumberReport.do`). Do not
  approximate it from memory — a wrong list rejects real customers. Adding it later
  is a pure gain needing no retuning.
- **Rate limiting on `/api/contact`.** `lib/rate-limit.ts` is per-lambda-instance, so
  on Vercel the limit barely binds. Not worth it until backed by shared state.
- **No "not spam" rescue button.** The admin view is read only by design. Rescue a
  wrongly-condemned lead by editing `status` directly in the database.

## Known residual

A real customer with a **4-dot gmail** whose local part shares no 3-character prefix
with their typed name scores 60 + 20 = **80** — inside 30% of the threshold. It
takes something like `a.b.c.d@gmail.com` from "Robert Chen"; people use dots to
spell their name, which is exactly what closes the mismatch gate. Judged implausible
rather than uncommon, and left in place. If a real one shows up during shadow mode,
the fix is one constant: `EMAIL_NAME_MISMATCH`.

If that customer *also* supplies a second, different phone number in the message,
the stack reaches 120 and would condemn. Narrower still, but worth watching for in
the shadow-mode data.
