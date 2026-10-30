// ===========================================
// Soft delete for the client Leads page, shared by
// DELETE /api/dashboard/website-leads/[id] and DELETE /api/dashboard/conversations/[id].
// ===========================================
// Never a hard delete. A website lead gets status 'deleted' (filtered like
// 'spam' from client-facing reads); a conversation gets deletedAt (filtered
// from /api/dashboard/conversations). Both rows stay visible in /admin.
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
 * Read side of the missed-call soft delete. A deleted conversation stays hidden
 * until something newer lands on the thread (lastMessageAt later than
 * deletedAt), e.g. the caller texts again. The webhook never clears deletedAt;
 * the thread simply counts as live again from that point.
 */
export function isHiddenByDelete(c: { deletedAt: Date | null; lastMessageAt: Date }): boolean {
  return c.deletedAt !== null && c.lastMessageAt.getTime() <= c.deletedAt.getTime()
}
