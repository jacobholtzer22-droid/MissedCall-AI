// ===========================================
// GOOGLE OAUTH - CALLBACK
// ===========================================
// Exchanges code for tokens, stores in DB, redirects to settings

import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens } from '@/lib/google-calendar'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state') // businessId
    const error = searchParams.get('error')

    if (error) {
      console.error('Google OAuth error:', error)
      return NextResponse.redirect(new URL('/dashboard/settings?google_error=denied', request.url))
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL('/dashboard/settings?google_error=missing_params', request.url))
    }

    await exchangeCodeForTokens(code, state)

    return NextResponse.redirect(new URL('/dashboard/settings?google_connected=1', request.url))
  } catch (err) {
    console.error('Google OAuth callback error:', err)
    return NextResponse.redirect(new URL('/dashboard/settings?google_error=exchange_failed', request.url))
  }
}
