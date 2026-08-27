// ===========================================
// CROSS-TENANT SUBMISSION VELOCITY
// ===========================================
// The only database-touching part of the spam filter. Kept out of lib/spam-score.ts
// so the scorer stays pure and its tests need no database.
//
// Deliberately CROSS-TENANT: no businessId filter. The observed bots walk every
// client site in sequence, so counting per-tenant would miss the whole pattern.
// This is a considered exception to the multi-tenant isolation rule in CLAUDE.md
// §10 — it reads only a normalized email and an IP for counting, and never
// exposes one tenant's lead data to another.

import { db } from '@/lib/db'
import { normalizeEmailForVelocity, type SpamVelocity } from '@/lib/spam-score'

const WINDOW_MS = 24 * 60 * 60 * 1000

/** Bounded so a flood cannot turn this into an expensive scan. */
const MAX_ROWS = 500

const EMPTY: SpamVelocity = { emailPriorCount24h: 0, ipPriorCount24h: 0 }

/**
 * Count prior submissions in the last 24h that share this submission's inbox or
 * IP. Uses the existing @@index([createdAt]) on WebsiteLead. Normalization has to
 * happen in memory rather than in SQL because gmail dot-collapsing is not
 * expressible as an indexable predicate.
 *
 * Never throws: velocity is an enhancement, and a database hiccup must not cost a
 * lead. On failure it returns zeros, which simply means no velocity points.
 */
export async function getVelocityCounts(
  email: string | null | undefined,
  sourceIp: string | null | undefined
): Promise<SpamVelocity> {
  const wantEmail = email ? normalizeEmailForVelocity(email) : null
  const wantIp = sourceIp && sourceIp !== 'unknown' ? sourceIp : null
  if (!wantEmail && !wantIp) return EMPTY

  try {
    const rows = await db.websiteLead.findMany({
      where: { createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
      select: { email: true, sourceIp: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    })

    let emailPriorCount24h = 0
    let ipPriorCount24h = 0
    for (const row of rows) {
      if (wantEmail && row.email && normalizeEmailForVelocity(row.email) === wantEmail) {
        emailPriorCount24h += 1
      }
      if (wantIp && row.sourceIp === wantIp) ipPriorCount24h += 1
    }
    return { emailPriorCount24h, ipPriorCount24h }
  } catch (err) {
    console.error('[spam-velocity] lookup failed, scoring without velocity:', err)
    return EMPTY
  }
}
