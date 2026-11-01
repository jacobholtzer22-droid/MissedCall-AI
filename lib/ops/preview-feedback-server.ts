// ===========================================
// /review/<token>: server side of the preview feedback page (PREVIEW_FEEDBACK)
// ===========================================
// guard() is the whole gate for every /api/review route, in order: flag (404),
// per-IP rate limit (429), a signed, unexpired, current token (else 404, the
// same for every reason). Everything after works only on the engagement inside
// the token.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { readIntake } from '@/lib/ops/intake'
import { updateIntake } from '@/lib/ops/intake-server'
import { CLIENT_LINK_TTL_MS, LINK_DOMAINS, clientIntakeKey, newNonce, signClientLink, verifyClientLink, type ClientLinkState } from '@/lib/ops/client-intake'
import { REVIEW_LIMITS, previewFeedbackEnabled, previewLinkUrl, previewNonceIsCurrent, type IntakeWithPreview, type ReviewRoute } from '@/lib/ops/preview-feedback'

export type ReviewClient = {
  id: string
  displayName: string
  contactName: string | null
  intake: IntakeWithPreview
  previewUrl: string | null
  websiteId: string | null
  websiteStep: string | null
}

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function resolvePreviewLink(token: string | null | undefined, now = Date.now()): Promise<ReviewClient | null> {
  const claim = verifyClientLink(token, clientIntakeKey(), now, LINK_DOMAINS.preview)
  if (!claim.ok) return null
  const e = await db.engagement.findUnique({
    where: { id: claim.engagementId },
    select: { id: true, displayName: true, contactName: true, intake: true, stage: true, deliverables: { where: { type: 'website' }, select: { id: true, step: true, evidence: true } } },
  })
  if (!e || e.stage === 'ignored' || e.stage === 'churned') return null
  const intake = readIntake(e.intake) as IntakeWithPreview
  if (!previewNonceIsCurrent(claim, { id: e.id, intake })) return null
  const site = e.deliverables[0] ?? null
  const ev = (site?.evidence ?? {}) as Record<string, unknown>
  return {
    id: e.id,
    displayName: e.displayName,
    contactName: e.contactName,
    intake,
    previewUrl: typeof ev.previewUrl === 'string' ? ev.previewUrl : null,
    websiteId: site?.id ?? null,
    websiteStep: site?.step ?? null,
  }
}

export async function reviewGuard(request: Request, token: string, route: ReviewRoute): Promise<{ client: ReviewClient } | { response: NextResponse }> {
  if (!previewFeedbackEnabled()) return { response: notFound() }
  const limit = rateLimit(`preview-feedback:${route}:${getClientIp(request)}`, REVIEW_LIMITS[route], 60_000)
  if (!limit.allowed) {
    return { response: NextResponse.json({ error: 'Too many requests. Wait a minute and try again.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }) }
  }
  const client = await resolvePreviewLink(token)
  if (!client) return { response: notFound() }
  return { client }
}

/** The review link for Jacob (the chief's preview_feedback_link tool). Same modes as the intake link. Sends nothing. */
export async function previewLinkFor(engagementId: string, mode: 'get' | 'new' | 'revoke', now = new Date()): Promise<{ url: string | null; expiresAt: string | null; issued: boolean }> {
  if (!previewFeedbackEnabled()) throw new Error('The preview feedback page is off (PREVIEW_FEEDBACK).')
  const key = clientIntakeKey()
  if (!key && mode !== 'revoke') throw new Error('No signing key: set CLIENT_INTAKE_SECRET (or OTP_SECRET) in the environment.')
  let state: ClientLinkState | undefined
  let issued = false
  await updateIntake(engagementId, (cur) => {
    const i = cur as IntakeWithPreview
    if (mode === 'revoke') {
      const { previewLink: _gone, ...rest } = i
      state = undefined
      return rest
    }
    if (mode === 'get' && i.previewLink && Date.parse(i.previewLink.expiresAt) > now.getTime() + 24 * 60 * 60 * 1000) {
      state = i.previewLink
      return i
    }
    state = { nonce: newNonce(), issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + CLIENT_LINK_TTL_MS).toISOString() }
    issued = true
    return { ...i, previewLink: state }
  })
  if (issued || mode === 'revoke') {
    await db.opsActivity.create({
      data: { engagementId, kind: 'system', body: mode === 'revoke' ? 'Preview review link revoked.' : `Preview review link issued (expires ${state!.expiresAt.slice(0, 10)}); any earlier one stopped working. Nothing was sent.` },
    })
  }
  if (!state) return { url: null, expiresAt: null, issued: false }
  return { url: previewLinkUrl(signClientLink(engagementId, state.nonce, Date.parse(state.expiresAt), key!, LINK_DOMAINS.preview)), expiresAt: state.expiresAt, issued }
}

/** The current review link for a client, without issuing one (the preview text draft). */
export function currentPreviewLink(engagementId: string, intake: IntakeWithPreview, now = Date.now()): string | null {
  const key = clientIntakeKey()
  const link = intake.previewLink
  if (!previewFeedbackEnabled() || !key || !link || Date.parse(link.expiresAt) <= now) return null
  return previewLinkUrl(signClientLink(engagementId, link.nonce, Date.parse(link.expiresAt), key, LINK_DOMAINS.preview))
}
