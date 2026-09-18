// ===========================================
// 24h FOLLOW-UP: WHEN IT MAY GO OUT
// ===========================================
// The "still no booking" text (MSG 3) goes out at least 24 hours after the
// lead passed OTP, never later than 72 hours, and only between 11:00 AM and
// 7:00 PM Eastern. A lead whose 24h mark falls outside that window waits for
// the next 11:00 AM ET, which is always inside the 72h cap (the longest wait
// is 16 hours, from 7:00 PM to 11:00 AM).
//
// Eastern for everyone, deliberately: the lead's own zone is not captured at
// OTP, and adding it would mean a schema change or writing into the lead's
// message text. Eastern 11 to 7 is 8 AM to 4 PM Pacific, awake everywhere in
// the continental US.
//
// Pure, no I/O. /api/cron/lead-follow-up gates on followUpDue, and the tests
// and scripts/preview-booker-messages.ts call the same functions.

import { TZDate } from '@date-fns/tz'

export const FOLLOW_UP_TIMEZONE = 'America/New_York'
/** First hour a follow-up may go out, inclusive. */
export const FOLLOW_UP_WINDOW_START_HOUR = 11
/** Window closes at the start of this hour. 19 = nothing at or after 7:00 PM. */
export const FOLLOW_UP_WINDOW_END_HOUR = 19
/** Wait a full day, but never chase someone from last week. */
export const FOLLOW_UP_MIN_AGE_HOURS = 24
export const FOLLOW_UP_MAX_AGE_HOURS = 72

const HOUR_MS = 60 * 60 * 1000

/** True when `now` is inside 11:00 AM to 7:00 PM Eastern. */
export function isInFollowUpWindow(now: Date): boolean {
  const hour = new TZDate(now, FOLLOW_UP_TIMEZONE).getHours()
  return hour >= FOLLOW_UP_WINDOW_START_HOUR && hour < FOLLOW_UP_WINDOW_END_HOUR
}

/** May this lead's follow-up go out at `now`? Age AND window, both required. */
export function followUpDue(otpVerifiedAt: Date, now: Date): boolean {
  const age = now.getTime() - otpVerifiedAt.getTime()
  return (
    age >= FOLLOW_UP_MIN_AGE_HOURS * HOUR_MS &&
    age <= FOLLOW_UP_MAX_AGE_HOURS * HOUR_MS &&
    isInFollowUpWindow(now)
  )
}

/**
 * The earliest moment the follow-up is allowed: the 24h mark when that is
 * inside the window, otherwise the next 11:00 AM Eastern. Null if that would be
 * past the 72h cap (cannot happen with these constants; kept honest anyway).
 *
 * The cron runs on the hour, so the actual send is the first :00 run at or
 * after this that is still inside the window. A 24h mark at 6:30 PM therefore
 * goes out at 11:00 AM the next day, not at 6:30.
 */
export function earliestFollowUpAt(otpVerifiedAt: Date): Date | null {
  const mark = new Date(otpVerifiedAt.getTime() + FOLLOW_UP_MIN_AGE_HOURS * HOUR_MS)
  let at = mark
  if (!isInFollowUpWindow(mark)) {
    const local = new TZDate(mark, FOLLOW_UP_TIMEZONE)
    const dayOffset = local.getHours() < FOLLOW_UP_WINDOW_START_HOUR ? 0 : 1
    at = new Date(
      new TZDate(
        local.getFullYear(),
        local.getMonth(),
        local.getDate() + dayOffset,
        FOLLOW_UP_WINDOW_START_HOUR,
        0,
        0,
        0,
        FOLLOW_UP_TIMEZONE
      ).getTime()
    )
  }
  const cap = otpVerifiedAt.getTime() + FOLLOW_UP_MAX_AGE_HOURS * HOUR_MS
  return at.getTime() <= cap ? at : null
}
