import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/onboarding(.*)',
  '/settings(.*)',
])

// Explicitly mark public routes (no auth / redirects)
const isPublicRoute = createRouteMatcher([
  '/book/(.*)',
])

const isPublicApiRoute = createRouteMatcher([
  '/api/webhooks/(.*)',
])

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return
  if (isPublicApiRoute(request)) return
  if (isProtectedRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}