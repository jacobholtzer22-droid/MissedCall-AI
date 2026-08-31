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
  funnelVariantFromQuery,
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
function assignFunnelCookies(request: NextRequest): NextResponse {
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

  // ── Funnel video A/B ──────────────────────────────────────────────────────
  // Independent of the gate/nogate arm above. Fair coin flip on first visit,
  // sticky for 30 days, and ?variant=B forces an arm for QA.
  const forcedFunnel = funnelVariantFromQuery(request.nextUrl.searchParams.get('variant'))
  const existingFunnel = request.cookies.get(FUNNEL_VARIANT_COOKIE)?.value
  const funnelVariant =
    forcedFunnel ?? (isFunnelVariant(existingFunnel) ? existingFunnel : assignFunnelVariant())
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

export default clerkMiddleware(async (auth, request) => {
  if (request.nextUrl.pathname === '/book') return assignFunnelCookies(request)
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
    '/((?!_next|book/|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
