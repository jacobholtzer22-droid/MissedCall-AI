// ===========================================
// TEMPORARY: which Meta env vars exist in the production runtime?
// ===========================================
// Settles whether META_CAPI_ACCESS_TOKEN is present where the code runs, rather
// than in the dashboard. Prints, per variable, only: defined, length, first 6
// characters. Never the value.
//
// Guarded by a one-time key held outside the repo. Only its SHA-256 is here, so
// reading this file does not let anyone call the route. Anything without the
// key gets a plain 404, so the route does not advertise itself.
//
// Delete this file once the answer is recorded.

import { createHash, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const KEY_SHA256 = '265d4de85e6e4af05b72b0ffab3e2c7802aad6653d25ae83db3d6e4125eee363'

/** The names the code reads today. */
const KNOWN = ['META_CAPI_ACCESS_TOKEN', 'META_CAPI_TEST_EVENT_CODE', 'NEXT_PUBLIC_FACEBOOK_PIXEL_ID']

/** Anything Meta-shaped in the runtime, in case a token lives under another name. */
const LOOKS_META = /META|FB|FACEBOOK|PIXEL|CAPI|CONVERSION/i

function describe(name: string) {
  const v = process.env[name]
  return {
    name,
    defined: typeof v === 'string' && v.length > 0,
    length: typeof v === 'string' ? v.length : 0,
    first6: typeof v === 'string' ? v.slice(0, 6) : null,
  }
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key') ?? ''
  const given = Buffer.from(createHash('sha256').update(key).digest('hex'))
  const expected = Buffer.from(KEY_SHA256)
  if (!key || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const extra = Object.keys(process.env)
    .filter((n) => LOOKS_META.test(n) && !KNOWN.includes(n))
    .sort()

  return NextResponse.json(
    {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      deployment: process.env.VERCEL_URL ?? null,
      known: KNOWN.map(describe),
      otherMetaLookingNames: extra.map(describe),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
