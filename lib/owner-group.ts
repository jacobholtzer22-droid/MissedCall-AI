// ===========================================
// OWNER GROUP - Resolve businesses sharing an ownerGroupId
// ===========================================
// One client can own multiple Business rows (e.g. lawn + detail + paint).
// Businesses sharing a non-null ownerGroupId form a group whose Website Leads
// and Google Ads dashboards aggregate across the group. When ownerGroupId is
// null the group is just the business itself and every caller behaves
// exactly as before.

import type { Business } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * Return every business in the calling business's owner group.
 * - ownerGroupId null → [business] (no query, no behavior change)
 * - otherwise → all businesses with the same ownerGroupId, always
 *   including the calling business
 */
export async function getOwnerGroupBusinesses(business: Business): Promise<Business[]> {
  if (!business.ownerGroupId) {
    return [business]
  }

  const group = await db.business.findMany({
    where: { ownerGroupId: business.ownerGroupId },
  })

  // Guarantee the calling business is present even if its row changed mid-request
  if (!group.some((b) => b.id === business.id)) {
    group.unshift(business)
  }

  return group
}
