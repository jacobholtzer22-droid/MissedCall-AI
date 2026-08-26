// Clears the gate cookie for the "not you?" link on the booking step.
import { NextResponse } from 'next/server'
import { GATE_COOKIE } from '@/app/book/constants'

export const dynamic = 'force-dynamic'

export async function POST() {
  const res = NextResponse.json({ success: true })
  res.cookies.set(GATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return res
}
