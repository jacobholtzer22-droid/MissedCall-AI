// ===========================================
// AUTHENTICATION MIDDLEWARE
// ===========================================
// This runs on EVERY request to protect routes
// Clerk handles all the authentication logic

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Define which routes are PUBLIC (don't require login)
const isPublicRoute = createRouteMatcher([
  '/',                    // Landing page
  '/sign-in(.*)',        // Sign in pages
  '/sign-up(.*)',        // Sign up pages
  '/api/webhooks/(.*)',  // Webhook endpoints (Twilio, Stripe)
])

export default clerkMiddleware(async (auth, request) => {
  // If it's not a public route, require authentication
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
