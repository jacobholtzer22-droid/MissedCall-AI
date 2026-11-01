// ===========================================
// One client, one account (DUPLICATE_GUARD, off by default)
// ===========================================
// A client created in Ops HQ and the same client signing up on the platform
// (or created twice from chat) end up as two Businesses or two Engagements.
// With the flag on, before a second one is made it is matched against every
// existing Business and Engagement on phone (E.164), email and normalized
// name; a likely match becomes a "Link to existing <name>?" approval card
// instead. Never auto-links (Push is Jacob's), never deletes.
//
// Also: a Telnyx texting number about to be assigned that is already another
// Business's is named on the card and in an activity (the column is unique,
// so the write itself would fail; the warning says why before Push).
//
// Pure.

import { normalizeToE164 } from '@/lib/phone-utils'

export function duplicateGuardEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DUPLICATE_GUARD === 'true'
}

export const LINK_CARD_KIND = 'link_existing'

const SUFFIXES = new Set(['llc', 'inc', 'co', 'corp', 'corporation', 'company', 'ltd', 'pllc', 'lc', 'the', 'and'])

/** "Yualex Painting 2 LLC" and "yualex painting" both as "yualex painting". */
export function normName(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !SUFFIXES.has(t) && !/^\d+$/.test(t))
    .join(' ')
}

export type Candidate = { name: string; email?: string | null; phones?: (string | null | undefined)[] }
export type PoolEntry = { kind: 'engagement' | 'business'; id: string; name: string; email: string | null; phones: (string | null | undefined)[]; engagementId: string | null; businessId: string | null }
export type DuplicateMatch = { entry: PoolEntry; on: ('phone' | 'email' | 'name')[] }

const phoneSet = (ps: (string | null | undefined)[] = []) => new Set(ps.map((p) => normalizeToE164(p ?? '') || '').filter(Boolean))
const emailOf = (e: string | null | undefined) => e?.trim().toLowerCase() || null

/** Every existing row that is likely the same client, strongest first. A name match needs at least two letters' worth of name. */
export function likelyMatches(c: Candidate, pool: PoolEntry[], skip: { engagementId?: string | null; businessId?: string | null } = {}): DuplicateMatch[] {
  const phones = phoneSet(c.phones)
  const email = emailOf(c.email)
  const name = normName(c.name)
  const out: DuplicateMatch[] = []
  for (const entry of pool) {
    if ((skip.engagementId && entry.engagementId === skip.engagementId) || (skip.businessId && entry.businessId === skip.businessId)) continue
    const on: DuplicateMatch['on'] = []
    if (phones.size && Array.from(phoneSet(entry.phones)).some((p) => phones.has(p))) on.push('phone')
    if (email && emailOf(entry.email) === email) on.push('email')
    if (name.length >= 4 && normName(entry.name) === name) on.push('name')
    if (on.length) out.push({ entry, on })
  }
  return out.sort((a, b) => b.on.length - a.on.length)
}

export function linkCardTitle(existingName: string): string {
  return `Link to existing ${existingName.trim()}?`
}

export function linkCardExpected(newName: string, m: DuplicateMatch): string {
  return `${newName.trim()} looks like ${m.entry.name.trim()}, already on the board (same ${m.on.join(', ')}). Push: treat it as the same client, nothing new is created. Reject: it is a different client; tell the chief to create it anyway.`
}

export function telnyxClashWarning(number: string, otherBusiness: string): string {
  return `Warning: ${number} is already the texting number on another platform account (${otherBusiness.trim()}). One number cannot serve two accounts; this change will fail unless that account gives it up first.`
}
