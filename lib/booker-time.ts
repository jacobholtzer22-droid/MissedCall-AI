// ===========================================
// BOOKER-LOCAL TIME (/book demo funnel)
// ===========================================
// Every message a booker receives (confirmation text, both reminders, the
// confirmation email, the calendar invite, the "Locked in" screen) renders the
// call time through this module, in THEIR zone with a real abbreviation:
// "1:00 PM PDT", "3:00 PM CDT", "1:00 PM MST".
//
// Jacob's own alerts stay in ET and do not come through here.
//
// Where the booker's zone comes from, best first:
//   widget   the zone the calendar widget showed them times in (DateCalendar
//            lets them change it, so this is what they actually picked from)
//   browser  Intl.DateTimeFormat().resolvedOptions().timeZone on their device
//   ip       Vercel's x-vercel-ip-timezone header. A GUESS: VPNs, carriers and
//            travel all move it. When this is all we have, the time is shown in
//            the guessed zone AND in ET, never the guess alone.
//   none     nothing usable (bookings made before this existed). ET only.
//
// Client-safe on purpose: no db, no server imports. The browser calendars use
// detectBrowserTimeZone and slotTimeWithZone from here.

/**
 * The owner's zone. Must equal TIMEZONE in lib/marketing-slots.ts, which cannot
 * be imported here because it pulls in the database client. A test asserts the
 * two match.
 */
export const OWNER_TIMEZONE = 'America/New_York'

export type TimeZoneSource = 'widget' | 'browser' | 'ip'

export type BookerZone = {
  timeZone: string
  source: TimeZoneSource
}

/**
 * A canonical IANA zone name, or null. Anything the runtime's Intl does not
 * recognise is rejected, so a garbage value from a request body can never reach
 * a formatter and throw at send time.
 */
export function normalizeTimeZone(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v || v.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(v)) return null
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: v }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

/** First usable zone in priority order, tagged with where it came from. */
export function resolveBookerZone(candidates: {
  widget?: unknown
  browser?: unknown
  ip?: unknown
}): BookerZone | null {
  const order: TimeZoneSource[] = ['widget', 'browser', 'ip']
  for (const source of order) {
    const tz = normalizeTimeZone(candidates[source])
    if (tz) return { timeZone: tz, source }
  }
  return null
}

/** The device's zone, or null. For the booking calendars to send with a booking. */
export function detectBrowserTimeZone(): string | null {
  try {
    return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return null
  }
}

/**
 * Some ICU builds put U+202F (narrow no-break space) before AM/PM. It is not in
 * the GSM-7 alphabet, so one of them turns a whole text into UCS-2 and roughly
 * doubles its segment count. Every string here ends up in an SMS.
 */
function plainSpaces(s: string): string {
  return s.replace(/[\u202f\u00a0\u2009]/g, ' ')
}

function formatIn(date: Date, timeZone: string) {
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => time.find((p) => p.type === type)?.value ?? ''
  const abbr = pick('timeZoneName')
  const clock = plainSpaces(
    time
      .filter((p) => p.type !== 'timeZoneName')
      .map((p) => p.value)
      .join('')
  ).trim()
  return {
    day: date.toLocaleDateString('en-US', { weekday: 'long', timeZone }),
    dayShort: date.toLocaleDateString('en-US', { weekday: 'short', timeZone }),
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone }),
    time: clock,
    abbr,
    timeWithAbbr: abbr ? `${clock} ${abbr}` : clock,
  }
}

export type BookerWhen = {
  /** "Tuesday", in the zone the booker is shown. */
  day: string
  /** "Sep 22", same zone. */
  date: string
  /** "Tue, Sep 22". The {date} token in the booker copy. */
  dateShort: string
  /** "Tuesday, Sep 22". The {longDate} token in the booker copy. */
  dateLong: string
  /**
   * The bare time. "1:00 PM PDT" when the zone is theirs, "1:00 PM PDT
   * (4:00 PM EDT)" when it is only an IP guess, "4:00 PM EDT" when nothing is
   * known. The hour-before text and the booking screen use this.
   */
  time: string
  /**
   * The {time} token everywhere else. Same as `time`, plus " (your time)" when
   * the zone is theirs, so a booker reading "PDT" knows it was converted for
   * them rather than copied from Jacob's calendar. A guess already carries ET
   * beside it and gets no marker.
   */
  timeMarked: string
  /** True when the time is shown in a zone we are confident is theirs. */
  confident: boolean
}

/**
 * The call time as a booker should read it.
 *
 * A guessed zone is never shown alone: "1:00 PM PDT (4:00 PM EDT)". When the
 * guess renders identically to ET (Detroit, for one), the pair collapses to a
 * single time rather than printing the same clock twice.
 */
export function bookerWhen(
  scheduledAt: Date,
  zone: { timeZone: string | null | undefined; source?: string | null } | null | undefined
): BookerWhen {
  const tz = normalizeTimeZone(zone?.timeZone)
  const et = formatIn(scheduledAt, OWNER_TIMEZONE)
  const shown = tz ? formatIn(scheduledAt, tz) : et
  const dates = {
    day: shown.day,
    date: shown.date,
    dateShort: `${shown.dayShort}, ${shown.date}`,
    dateLong: `${shown.day}, ${shown.date}`,
  }
  if (!tz) return { ...dates, time: et.timeWithAbbr, timeMarked: et.timeWithAbbr, confident: false }

  if (zone?.source !== 'ip') {
    const time = shown.timeWithAbbr
    return { ...dates, time, timeMarked: `${time} (your time)`, confident: true }
  }
  const same = shown.timeWithAbbr === et.timeWithAbbr && shown.date === et.date
  const time = same ? shown.timeWithAbbr : `${shown.timeWithAbbr} (${et.timeWithAbbr})`
  return { ...dates, time, timeMarked: time, confident: false }
}

/**
 * One slot's clock time in a zone, with its abbreviation: "1:00 PM PDT".
 * For the browser calendars, which already know the zone they are rendering in.
 */
export function slotTimeWithZone(iso: string, timeZone: string | null): string {
  const tz = normalizeTimeZone(timeZone) ?? OWNER_TIMEZONE
  return formatIn(new Date(iso), tz).timeWithAbbr
}

/** Same, without the abbreviation: "1:00 PM". For lists whose header names the zone. */
export function slotClock(iso: string, timeZone: string | null): string {
  const tz = normalizeTimeZone(timeZone) ?? OWNER_TIMEZONE
  return formatIn(new Date(iso), tz).time
}

/**
 * Owner-alert line saying where the booker is. ET stays the headline in Jacob's
 * alerts; this is the extra line so he knows what time the prospect thinks it
 * is. Always present, so a missing zone is visible rather than silent.
 */
export function bookerZoneNote(
  scheduledAt: Date,
  zone: { timeZone: string | null | undefined; source?: string | null } | null | undefined
): string {
  const tz = normalizeTimeZone(zone?.timeZone)
  if (!tz) return 'Their time zone: not captured (sent to them in ET)'
  const theirs = formatIn(scheduledAt, tz)
  const guess = zone?.source === 'ip' ? ', guessed from IP' : ''
  return `Their time: ${theirs.timeWithAbbr} (${tz}${guess})`
}
