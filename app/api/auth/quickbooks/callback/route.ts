// ===========================================
// QUICKBOOKS OAUTH - CALLBACK
// ===========================================
// Verifies the signed state, exchanges the code for tokens, stores them, and
// redirects back to settings.
//
// TWO THINGS THIS DOES THAT THE GOOGLE CALLBACK DOES NOT:
//
//   1. It verifies `state` before touching anything. The Google callback treats
//      state as a plain businessId and trusts it, so a crafted callback can bind
//      an attacker's account to any tenant. Here an unverifiable state is
//      rejected before the code is ever exchanged.
//   2. It persists realmId. Intuit sends the company id ONLY as a query
//      parameter on this request — it is absent from the token response and
//      there is no API that recovers it later. Dropping it here means the
//      connection is useless and the tenant has to re-consent. Google has no
//      analogue, so there is no prior art in this repo to copy.

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { exchangeQbCodeForTokens, verifyQbState, isQbNotConfiguredError } from '@/lib/quickbooks'

function settingsRedirect(request: NextRequest, query: string): NextResponse {
  return NextResponse.redirect(new URL(`/dashboard/settings?${query}`, request.url))
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const realmId = searchParams.get('realmId')
    const error = searchParams.get('error')

    if (error) {
      console.error('[QUICKBOOKS] OAuth error from Intuit:', error)
      return settingsRedirect(request, 'qb_error=denied')
    }

    // Verify state FIRST — before the code is exchanged, before any DB write.
    // An unsigned or tampered state means this callback did not originate from
    // a consent we started.
    const businessId = state ? verifyQbState(state) : null
    if (!businessId) {
      console.error('[QUICKBOOKS] OAuth callback rejected: state failed verification')
      return settingsRedirect(request, 'qb_error=invalid_state')
    }

    if (!code || !realmId) {
      console.error('[QUICKBOOKS] OAuth callback missing params', {
        code: code ? 'present' : 'MISSING',
        realmId: realmId ? 'present' : 'MISSING',
      })
      return settingsRedirect(request, 'qb_error=missing_params')
    }

    await exchangeQbCodeForTokens(code, realmId, businessId)

    return settingsRedirect(request, 'qb_connected=1')
  } catch (err) {
    // A missing QUICKBOOKS_ env var means the integration was never set up. That
    // is a configuration message, not a 500.
    if (isQbNotConfiguredError(err)) {
      console.error('[QUICKBOOKS] OAuth callback blocked — integration not configured:', err)
      return settingsRedirect(request, 'qb_error=not_configured')
    }
    console.error('[QUICKBOOKS] OAuth callback error:', err)
    return settingsRedirect(request, 'qb_error=exchange_failed')
  }
}
