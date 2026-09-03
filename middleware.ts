import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'
import {
  VARIANT_COOKIE,
  VISITOR_COOKIE,
  VARIANT_COOKIE_MAX_AGE,
  assignVariant,
  isVariant,
  isLiveVariant,
  variantFromQuery,
  newVisitorId,
} from '@/lib/variant'
import {
  FUNNEL_VARIANT_COOKIE,
  FUNNEL_VARIANT_MAX_AGE,
  assignFunnelVariant,
  isFunnelVariant,
} from '@/lib/funnel-variant'

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/onboarding(.*)',
  '/settings(.*)',
])

const isPublicRoute = createRouteMatcher([
  '/book',
  '/book/(.*)',
])

const isPublicApiRoute = createRouteMatcher([
  '/api/webhooks/(.*)',
  '/api/contact',
])

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: VARIANT_COOKIE_MAX_AGE,
}

/**
 * A/B assignment for the /book funnel.
 *
 * This has to live in middleware: Next.js forbids cookies().set() during a
 * server component render, and assigning client-side would mean the first
 * pageview fires unassigned. Middleware can both persist the cookie on the
 * response AND make it visible to the page on the same request, which is what
 * the request.cookies.set + NextResponse.next({ request }) pair does.
 */
function assignFunnelCookies(request: NextRequest, forceArm?: 'A' | 'B'): NextResponse {
  const forced = variantFromQuery(request.nextUrl.searchParams.get('v'))
  const existingVariant = request.cookies.get(VARIANT_COOKIE)?.value
  const existingVisitor = request.cookies.get(VISITOR_COOKIE)?.value

  // A sticky cookie only survives while its arm is still live. Setting an arm's
  // weight to 0 therefore migrates its existing visitors on their next visit
  // instead of stranding them in a retired experience. `?v=` still forces any
  // arm for preview, live or not.
  const keepExisting = isVariant(existingVariant) && isLiveVariant(existingVariant)
  const variant = forced ?? (keepExisting ? existingVariant : assignVariant())
  const visitorId = existingVisitor || newVisitorId()

  const needsVariantWrite = variant !== existingVariant
  const needsVisitorWrite = !existingVisitor

  // ── Funnel arm ────────────────────────────────────────────────────────────
  // Sticky for 30 days. No ?variant= override any more: /book/a and /book/b are
  // the override, and an arm you can link to beats a query parameter that
  // silently rewrote a cookie.
  const existingFunnel = request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value
  const funnelVariant = forceArm ?? (isFunnelVariant(existingFunnel) ? existingFunnel : assignFunnelVariant())
  const needsFunnelWrite = funnelVariant !== existingFunnel

  // Make both readable by the page on THIS request, not just the next one.
  if (needsVariantWrite) request.cookies.set(VARIANT_COOKIE, variant)
  if (needsVisitorWrite) request.cookies.set(VISITOR_COOKIE, visitorId)
  if (needsFunnelWrite) request.cookies.set(FUNNEL_VARIANT_COOKIE, funnelVariant)

  const res = NextResponse.next({ request })
  if (needsVariantWrite) res.cookies.set(VARIANT_COOKIE, variant, COOKIE_OPTS)
  if (needsVisitorWrite) res.cookies.set(VISITOR_COOKIE, visitorId, COOKIE_OPTS)
  if (needsFunnelWrite) {
    res.cookies.set(FUNNEL_VARIANT_COOKIE, funnelVariant, { ...COOKIE_OPTS, maxAge: FUNNEL_VARIANT_MAX_AGE })
  }
  return res
}

/**
 * 302 /book to the visitor's arm, carrying the whole query string.
 *
 * The query string is copied wholesale rather than allow-listing utm_*: every
 * click id the ad platforms invent (fbclid, gclid, ttclid, and the next one)
 * has to survive, and an allow-list silently drops the ones nobody remembered.
 *
 * 302, not 301: the assignment is per visitor, and a permanent redirect would
 * be cached by the browser and pin an arm no cookie could ever change.
 */
function splitToArm(request: NextRequest): NextResponse {
  const existing = request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value
  const arm = isFunnelVariant(existing) ? existing : assignFunnelVariant()

  const url = request.nextUrl.clone()
  url.pathname = `/book/${arm.toLowerCase()}`

  const res = NextResponse.redirect(url, 302)
  if (arm !== existing) {
    res.cookies.set(FUNNEL_VARIANT_COOKIE, arm, { ...COOKIE_OPTS, maxAge: FUNNEL_VARIANT_MAX_AGE })
  }
  // The visitor id ties a coupon-era claim and the lead to one browser; it is
  // still issued here so it exists before the arm page renders.
  if (!request.cookies.get(VISITOR_COOKIE)?.value) {
    res.cookies.set(VISITOR_COOKIE, newVisitorId(), COOKIE_OPTS)
  }
  return res
}

export default clerkMiddleware(async (auth, request) => {
  // /book is the address the ads point at. It assigns (or reuses) the arm and
  // sends the visitor to that arm's own URL, so every page below is a real
  // address rather than a cookie-dependent render of the same one.
  if (request.nextUrl.pathname === '/book') return splitToArm(request)
  // Landing directly on an arm pins it, so a later visit to /book is consistent.
  if (request.nextUrl.pathname === '/book/a') return assignFunnelCookies(request, 'A')
  if (request.nextUrl.pathname === '/book/b') return assignFunnelCookies(request, 'B')
  if (isPublicRoute(request)) return
  if (isPublicApiRoute(request)) return
  if (isProtectedRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // `book/` (with the slash) stays excluded so tenant booking pages are
    // untouched. Bare `/book` is NOT excluded, because the funnel needs its
    // A/B and visitor cookies assigned there.
    '/((?!_next|book/(?!a$|b$)|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
