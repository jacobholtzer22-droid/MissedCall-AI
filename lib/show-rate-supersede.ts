// ===========================================
// /book SHOW-RATE: A REBOOK SUPERSEDES THE OLD BOOKING (RESCHEDULE_LINK)
// ===========================================
// The reschedule link books a NEW slot. With RESCHEDULE_LINK on, once that new
// booking is written, /api/demo-book calls this to retire the earlier one:
// every other confirmed, still-upcoming marketing booking from the same phone
// that was created before the new one.
//
// Order is the safety property:
//   1. The new booking already exists (the caller runs this after the write,
//      after the response). Nothing here can touch it.
//   2. The old ROW is cancelled first: status 'cancelled' plus the notes line
//      "Superseded by rebook: <newId> <ISO>". Conditional on the exact notes
//      value read and on status still 'confirmed', retried on contention, so a
//      concurrent write is never clobbered. Once cancelled, the reminder cron
//      (status 'confirmed' only) never texts it again.
//   3. Only then the old Google event is DELETED. If that fails it is logged
//      and the row stays cancelled: one stale calendar entry is a better
//      failure than two live bookings.
//
// Why delete and not move: lib/google-calendar.ts has no update or patch
// helper, and the new booking already has its own event, Meet link and invite
// by the time this runs (created before the appointment row, as today). Moving
// the old event instead would mean deciding to supersede BEFORE the booking is
// written, skipping the insert, and re-rendering the old invite's title and
// description (which carry the old time). Deleting leaves the booking path
// exactly as it is and needs no change to a protected file.
//
// All side effects come in through SupersedeDeps; lib/show-rate-supersede.test.ts
// runs this against fakes.

import { appendMarker } from '@/lib/show-rate'

export const SUPERSEDED_MARKER = 'Superseded by rebook:'

export type SupersedeRow = {
  id: string
  notes: string | null
  status: string
  googleCalendarEventId: string | null
}

export type SupersedeDeps = {
  /** Other confirmed, upcoming bookings for this phone created before the new one. */
  findEarlierLive(): Promise<SupersedeRow[]>
  reread(id: string): Promise<SupersedeRow | null>
  /** Set status 'cancelled' and notes `next` only where status is 'confirmed' and notes equals `expected`. */
  cancel(id: string, expected: string | null, next: string): Promise<number>
  /** Delete the Google event. 'gone' means Google already had no such event. Throws on failure. */
  deleteEvent(eventId: string): Promise<'deleted' | 'gone'>
  log?: (line: string) => void
}

export type SupersedeOutcome = {
  id: string
  row: 'cancelled' | 'not_live' | 'contended'
  event: 'deleted' | 'gone' | 'none' | 'failed' | 'skipped'
  error?: string
}

/** The notes line, with the new booking's id ahead of the time. */
export function supersededNotes(notes: string | null, newId: string, at: Date): string {
  return appendMarker(notes, `${SUPERSEDED_MARKER} ${newId}`, at)
}

export async function supersedeEarlierBookings(
  deps: SupersedeDeps,
  newAppointmentId: string,
  now: Date
): Promise<SupersedeOutcome[]> {
  const log = deps.log ?? ((line: string) => console.log(line))
  const out: SupersedeOutcome[] = []

  for (const first of await deps.findEarlierLive()) {
    if (first.id === newAppointmentId) continue
    let row: SupersedeRow | null = first
    let state: SupersedeOutcome['row'] = 'contended'
    for (let attempt = 0; attempt < 3 && row; attempt++) {
      if (row.status !== 'confirmed') {
        state = 'not_live'
        break
      }
      if ((await deps.cancel(row.id, row.notes, supersededNotes(row.notes, newAppointmentId, now))) > 0) {
        state = 'cancelled'
        break
      }
      row = await deps.reread(first.id)
      if (!row) state = 'not_live'
    }

    if (state !== 'cancelled') {
      log(`[show-rate] supersede SKIP oldId=${first.id} newId=${newAppointmentId} reason=${state}`)
      out.push({ id: first.id, row: state, event: 'skipped' })
      continue
    }

    const eventId = first.googleCalendarEventId
    if (!eventId) {
      log(`[show-rate] supersede CANCELLED oldId=${first.id} newId=${newAppointmentId} event=none`)
      out.push({ id: first.id, row: 'cancelled', event: 'none' })
      continue
    }
    try {
      const event = await deps.deleteEvent(eventId)
      log(`[show-rate] supersede CANCELLED oldId=${first.id} newId=${newAppointmentId} event=${event} eventId=${eventId}`)
      out.push({ id: first.id, row: 'cancelled', event })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      // The row stays cancelled on purpose: never two live bookings.
      console.error(
        `[show-rate] supersede EVENT DELETE FAILED oldId=${first.id} newId=${newAppointmentId} eventId=${eventId} ` +
          `error=${error} (old booking is cancelled in the DB; remove the event by hand)`
      )
      out.push({ id: first.id, row: 'cancelled', event: 'failed', error })
    }
  }
  return out
}
