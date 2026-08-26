// ===========================================
// REMINDER SEND-TIME STATUS GUARD
// ===========================================
// A reminder must never go out for a booking that is no longer happening.
//
// The reminder cron's candidate query already filters on status 'confirmed',
// but that read happens at the top of the run and the send happens later in the
// loop, so a cancellation landing in between would still text the prospect.
//
// Architecture note: this is a polling cron, NOT a job queue. There is no
// per-booking scheduled job to cancel when a booking is cancelled, so this
// send-time check IS the mechanism, not a backstop for one.
//
// Scope note: this only catches cancellations that reached OUR database. A
// booking cancelled directly in Google Calendar still reads 'confirmed' here,
// so this does not protect against that path. That needs calendar sync.

export const NON_SENDABLE_STATUSES = ['cancelled', 'canceled', 'deleted', 'completed', 'no_show']

export function isSendableStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return !NON_SENDABLE_STATUSES.includes(status.trim().toLowerCase())
}
