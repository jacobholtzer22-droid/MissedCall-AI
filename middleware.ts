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

const clerkHandler = clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return
  if (isPublicApiRoute(request)) return
  if (isProtectedRoute(request)) {
    await auth.protect()
  }
})

export default async function middleware(request: Request) {
  const response = await clerkHandler(request)
  // Remove all frame restrictions so any page can be embedded in an iframe from any domain
  response.headers.delete('X-Frame-Options')
  response.headers.set('Content-Security-Policy', 'frame-ancestors *')
  return response
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}