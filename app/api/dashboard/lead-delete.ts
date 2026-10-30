// ===========================================
// Soft delete for the client Leads page, shared by
// DELETE /api/dashboard/website-leads/[id] and DELETE /api/dashboard/conversations/[id].
// ===========================================
// Never a hard delete, and only the Leads page changes. A website lead gets
// status 'deleted' (filtered like 'spam' from client-facing reads). A
// conversation gets deletedAt, which only /api/dashboard/conversations?view=leads
// reads; the Conversations tab, /admin and the SMS system ignore it.
//
// The store is passed in so the rules are testable without a database.

export type DeleteOutcome = { status: 200; alreadyDeleted: boolean } | { status: 403 | 404; error: string }

export type SoftDeleteStore = {
  /** The row's owner and whether it is already deleted, or null if no row has that id. */
  find: (id: string) => Promise<{ businessId: string; deleted: boolean } | null>
  markDeleted: (id: string) => Promise<void>
}

/**
 * allowedBusinessIds: the caller's business, or its whole owner group where the
 * surface is group-scoped (website leads). A second delete of the same row
 * answers 200 again and writes nothing.
 */
export async function softDelete(store: SoftDeleteStore, id: string, allowedBusinessIds: string[]): Promise<DeleteOutcome> {
  const row = await store.find(id)
  if (!row) return { status: 404, error: 'Lead not found' }
  if (!allowedBusinessIds.includes(row.businessId)) return { status: 403, error: 'Not your lead' }
  if (row.deleted) return { status: 200, alreadyDeleted: true }
  await store.markDeleted(id)
  return { status: 200, alreadyDeleted: false }
}

/**
 * Leads page only. A conversation deleted from the Leads page stays off it
 * until the caller texts in again: an inbound message newer than deletedAt.
 * Outbound sends (manual replies, campaigns, the AI) never bring it back.
 * The Conversations tab ignores deletedAt entirely.
 */
export function isHiddenByDelete(c: { deletedAt: Date | null; messages: { direction: string; createdAt: Date }[] }): boolean {
  if (c.deletedAt === null) return false
  const deletedAt = c.deletedAt.getTime()
  return !c.messages.some((m) => m.direction === 'inbound' && m.createdAt.getTime() > deletedAt)
}
