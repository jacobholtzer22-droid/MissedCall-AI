# Correction: the Meta Pixel was never missing from production

**Date:** 2026-08-21
**Supersedes:** the claim in commit `b68eb53` ("fix: restore Meta Pixel tracking and stop dropping events")
that the pixel was absent from production and that no `PageView` or `Schedule` event reached Meta.

## What was claimed

An audit on 2026-08-21 concluded that the Meta Pixel was not present in production, that
`NEXT_PUBLIC_FACEBOOK_PIXEL_ID` was unset in the deployed build, and that therefore no pixel
events had ever been delivered while Meta ads were spending into `/book`.

**That conclusion was wrong.**

## What is actually true

The pixel has been configured and firing in production since 2026-05-30.

Evidence:

1. `vercel env ls production` shows `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` was created 83 days before
   2026-08-21, which is 2026-05-30 — the same day commit `c785f87` added `app/components/MetaPixel.tsx`.
2. Production deployment `missed-call-cn7kmm1i1`, 8 days old and predating any work in that session,
   serves a layout chunk containing the pixel ID `2843737625975503`.

Historical Meta conversion data from before 2026-08-21 is therefore valid and should not be discounted.

## Why the audit got it wrong

Two invalid tests were treated as proof:

**1. Grepping the served HTML for `fbq`.** This can never detect this pixel, working or not.
`MetaPixel` renders a `next/script` with `strategy="afterInteractive"` from inside a client
component, so the snippet is emitted into the layout JS chunk, not into the HTML document.
A clean HTML grep is the expected result for a perfectly healthy pixel.

**2. Reading `.env.local`.** That file is local-only, is gitignored, and is never deployed.
Its contents say nothing about what is set in the Vercel project.

## How to actually verify the pixel in production

Grep the layout chunk, not the HTML:

```bash
curl -s https://www.alignandacquire.com/book > /tmp/book.html
CHUNK=$(grep -oE '/_next/static/chunks/app/layout-[a-z0-9]+\.js' /tmp/book.html | head -1)
curl -s "https://www.alignandacquire.com$CHUNK" | grep -c 2843737625975503
```

A non-zero count means the pixel ID is in the deployed bundle. To confirm delivery rather than
presence, use Meta Events Manager > Test Events, or the Meta Pixel Helper browser extension.

To check the environment variable itself:

```bash
vercel env ls production
```

## What from that session was still real

- The `if (window.fbq)` guards were a genuine defect, but a narrow one: they dropped events only
  in the window between hydration and `fbevents.js` finishing its load, not permanently.
- `/booking` was returning 404 to paid traffic and now 308s to `/book`.
- `/book/[businessSlug]` fires no `Schedule` event. Still true.
- The marketing funnel ignored Google Calendar free/busy. Fixed in the same session.

## Rule going forward

Never conclude a client-side tag is missing from a Next.js App Router deploy by grepping the
served HTML. Check the JS chunk, the Vercel environment, and an older deployment before
declaring an outage.
