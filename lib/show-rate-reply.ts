// ===========================================
// /book SHOW-RATE: RECORD A YES REPLY (CONFIRM_TRACKING)
// ===========================================
// Called by the marketing-line branch of the SMS webhook AFTER the reply has
// been forwarded to the owner exactly as before, and only when CONFIRM_TRACKING
// is 'true'. Never sends anything and never throws to its caller.
//
// Records "Confirmed by reply: <ISO>" on the soonest confirmed booking for this
// phone starting in the next 36h. Same notes-marker pattern as the reminder
// cron's show-rate steps: a conditional update on the exact notes value read,
// retried a couple of times if another write landed in between.

import { db } from '@/lib/db'
import { normalizeToE164 } from '@/lib/phone-utils'
import {
  CONFIRMED_BY_REPLY_MARKER,
  CONFIRM_LOOKAHEAD_MS,
  appendMarker,
  isYesReply,
  pickConfirmTarget,
} from '@/lib/show-rate'

export type ReplyRow = { id: string; scheduledAt: Date; status: string; notes: string | null }

export type ReplyDeps = {
  /** This business's appointments for the phone, scheduled in [since, until]. */
  findForPhone(phoneE164: string, since: Date, until: Date): Promise<ReplyRow[]>
  /** Set notes to `next` only where notes still equals `expected`. Returns the row count. */
  claim(id: string, expected: string | null, next: string): Promise<number>
}

export type ReplyOutcome =
  | { recorded: true; appointmentId: string }
  | { recorded: false; reason: 'not_yes' | 'no_phone' | 'no_booking' | 'contended' | 'error' }

export async function recordYesReply(
  deps: ReplyDeps,
  from: string,
  text: string | null | undefined,
  now: Date
): Promise<ReplyOutcome> {
  if (!isYesReply(text)) return { recorded: false, reason: 'not_yes' }
  const phone = normalizeToE164(from)
  if (!phone) return { recorded: false, reason: 'no_phone' }
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const rows = await deps.findForPhone(phone, now, new Date(now.getTime() + CONFIRM_LOOKAHEAD_MS))
      const target = pickConfirmTarget(rows, now)
      if (!target) return { recorded: false, reason: 'no_booking' }
      const next = appendMarker(target.notes, CONFIRMED_BY_REPLY_MARKER, now)
      if ((await deps.claim(target.id, target.notes, next)) > 0) {
        return { recorded: true, appointmentId: target.id }
      }
    }
    return { recorded: false, reason: 'contended' }
  } catch (err) {
    console.error('[show-rate] confirm-by-reply failed:', err)
    return { recorded: false, reason: 'error' }
  }
}

/** The webhook's entry point: the real database behind recordYesReply. */
export function recordYesReplyForBusiness(businessId: string, from: string, text: string | null | undefined) {
  return recordYesReply(
    {
      findForPhone: (phone, since, until) =>
        db.appointment.findMany({
          where: { businessId, customerPhone: phone, status: 'confirmed', scheduledAt: { gt: since, lte: until } },
          orderBy: { scheduledAt: 'asc' },
          take: 10,
          select: { id: true, scheduledAt: true, status: true, notes: true },
        }),
      claim: async (id, expected, next) =>
        (await db.appointment.updateMany({ where: { id, notes: expected }, data: { notes: next } })).count,
    },
    from,
    text,
    new Date()
  )
}
