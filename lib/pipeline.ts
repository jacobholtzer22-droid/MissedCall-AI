// ===========================================
// /admin/pipeline — shared pure logic
// ===========================================
// No db, no server imports: the client page imports this for stage, the
// follow-up sort and the ROI rollup, so the numbers recompute the instant a tap
// lands. The API imports the same functions, so the two can never disagree.
//
// The row is a PERSON, not a booking. A person is every non-spam WebsiteLead
// and every Appointment of the marketing business that share a phone number.
// Two separate axes describe them:
//   stage  — where they got to in the funnel. Derived, never stored:
//            lead_only / booked / showed / no_show / cancelled.
//   status — Jacob's outcome call. Stored on PipelinePerson:
//            pending / working / won / lost / not_a_fit / junk.

// -------------------------------------------
// Vocabulary
// -------------------------------------------

/** Per booking. Stored on Appointment.showStatus. */
export const SHOW_STATUSES = ['pending', 'showed', 'no_show', 'cancelled'] as const
export type ShowStatus = (typeof SHOW_STATUSES)[number]
export const SHOW_LABELS: Record<ShowStatus, string> = {
  pending: 'Not marked',
  showed: 'Showed',
  no_show: 'No-show',
  cancelled: 'Cancelled',
}

/** Per person. Stored on PipelinePerson.status. */
export const STATUSES = ['pending', 'working', 'won', 'lost', 'not_a_fit', 'junk'] as const
export type Status = (typeof STATUSES)[number]
export const STATUS_LABELS: Record<Status, string> = {
  pending: 'Pending',
  working: 'Working',
  won: 'Closed won',
  lost: 'Lost',
  not_a_fit: 'Not a fit',
  junk: 'Junk',
}
/** Still in play. Everything else is a decision and carries a closedAt. */
export const OPEN_STATUSES: readonly Status[] = ['pending', 'working']
export const isOpenStatus = (s: string) => (OPEN_STATUSES as readonly string[]).includes(s)

/** Derived from leads + bookings, never stored. */
export const STAGES = ['lead_only', 'booked', 'showed', 'no_show', 'cancelled'] as const
export type Stage = (typeof STAGES)[number]
export const STAGE_LABELS: Record<Stage, string> = {
  lead_only: 'Lead only',
  booked: 'Booked',
  showed: 'Showed',
  no_show: 'No-show',
  cancelled: 'Cancelled',
}

/** No contact for this long on an open row puts it at the top of the list. */
export const FOLLOW_UP_STALE_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

// -------------------------------------------
// Row shape
// -------------------------------------------

export type PipelineNote = { id: string; body: string; kind: string; createdAt: string }

export type PipelineBooking = {
  id: string
  scheduledAt: string
  createdAt: string
  /** Appointment.status: the calendar slot's state, not whether they showed. */
  calendarStatus: string
  /** As stored. Read it through effectiveShow(). */
  showStatus: ShowStatus
  bookingSurface: string | null
}

export type PipelinePerson = {
  /** E.164 phone, or "lead:<id>" for a lead that never gave one. */
  key: string
  name: string
  company: string
  phone: string | null
  email: string | null
  /** Earliest lead row, null when they booked without ever becoming a lead. */
  leadCreatedAt: string | null
  /** Earliest OTP pass across their lead rows. */
  verifiedAt: string | null
  arm: string | null
  utmTerm: string | null
  agencyFlagTerm: string | null
  leadJunk: boolean
  isTest: boolean
  /** Newest call first. */
  bookings: PipelineBooking[]

  status: Status
  lostReason: string | null
  closedAt: string | null
  mrr: number | null
  setupFee: number | null
  lastContactedAt: string | null
  nextFollowUpAt: string | null
  notes: PipelineNote[]
}

// -------------------------------------------
// Stage
// -------------------------------------------

/**
 * A booking the calendar cancelled reads as cancelled until Jacob says
 * otherwise, so the count is right without a backfill. An explicit mark wins.
 */
export function effectiveShow(b: Pick<PipelineBooking, 'showStatus' | 'calendarStatus'>): ShowStatus {
  if (b.showStatus !== 'pending') return b.showStatus
  return b.calendarStatus === 'cancelled' ? 'cancelled' : 'pending'
}

/**
 * The booking the row's one-tap Showed control acts on: the latest one that
 * was not cancelled (a rebook after a cancel is the live one), else the latest.
 */
export function primaryBooking<B extends Pick<PipelineBooking, 'showStatus' | 'calendarStatus' | 'scheduledAt'>>(
  bookings: B[]
): B | null {
  if (bookings.length === 0) return null
  const byNewest = [...bookings].sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt))
  return byNewest.find((b) => effectiveShow(b) !== 'cancelled') ?? byNewest[0]
}

/**
 * Showed on any booking wins: once someone has sat through a call, a later
 * no-show does not undo that. Otherwise the primary booking decides.
 */
export function stageOf(p: Pick<PipelinePerson, 'bookings'>): Stage {
  if (p.bookings.length === 0) return 'lead_only'
  if (p.bookings.some((b) => effectiveShow(b) === 'showed')) return 'showed'
  const show = effectiveShow(primaryBooking(p.bookings)!)
  return show === 'pending' ? 'booked' : show
}

/**
 * The live booking's calendar, as a filter / group key: its surface, else
 * UNKNOWN_SURFACE for an old booking that never recorded one, else NO_SURFACE
 * for someone who never booked. Never conflates the last two.
 */
export function surfaceKey(p: Pick<PipelinePerson, 'bookings'>): string {
  const b = primaryBooking(p.bookings)
  if (!b) return NO_SURFACE
  return b.bookingSurface || UNKNOWN_SURFACE
}

export function surfaceOf(p: Pick<PipelinePerson, 'bookings'>): string | null {
  return primaryBooking(p.bookings)?.bookingSurface ?? null
}

// -------------------------------------------
// utm_term and company resolution (server side, but pure)
// -------------------------------------------

/** Placeholder formatBookingAttribution writes when a field was empty. */
const NOTE_PLACEHOLDERS = new Set(['direct', 'none', 'unknown', ''])

function termFromTouch(t: unknown): string | null {
  if (!t || typeof t !== 'object') return null
  const term = (t as { term?: unknown }).term
  return typeof term === 'string' && term.trim() ? term.trim() : null
}

/** "  utm_term: aa_founder_v1" in the booking-time notes block. */
export function termFromNotes(notes: string | null | undefined): string | null {
  const m = notes?.match(/^\s*utm_term:\s*(.+)$/m)
  const v = m?.[1]?.trim() ?? ''
  return NOTE_PLACEHOLDERS.has(v.toLowerCase()) ? null : v
}

/**
 * First touches before last touches, the same rule /admin/leads uses for "Ad":
 * the ad that found the person gets credit, not the text link that brought
 * them back. Each list is tried in order; the notes block is the last resort
 * (the only place pre-JSON bookings kept it).
 */
export function resolveUtmTerm(input: {
  firstTouches: unknown[]
  lastTouches: unknown[]
  notes: (string | null | undefined)[]
}): string | null {
  for (const t of input.firstTouches) {
    const v = termFromTouch(t)
    if (v) return v
  }
  for (const t of input.lastTouches) {
    const v = termFromTouch(t)
    if (v) return v
  }
  for (const n of input.notes) {
    const v = termFromNotes(n)
    if (v) return v
  }
  return null
}

/** Company from a lead column, a booking notes block, or a lead message block. */
export function resolveCompany(input: {
  leadBusinessNames: (string | null | undefined)[]
  notes: (string | null | undefined)[]
}): string {
  for (const n of input.leadBusinessNames) if (n?.trim()) return n.trim()
  for (const n of input.notes) {
    const m = n?.match(/^(?:Company|Business): (.+)$/m)?.[1]?.trim()
    if (m) return m
  }
  return ''
}

// -------------------------------------------
// Follow-up
// -------------------------------------------

export type FollowUp =
  | { due: false; scheduled: number | null }
  | { due: true; reason: 'overdue' | 'stale'; since: number }

type FollowUpInput = Pick<
  PipelinePerson,
  'status' | 'lastContactedAt' | 'nextFollowUpAt' | 'bookings' | 'verifiedAt' | 'leadCreatedAt'
>

/**
 * When the "no contact" clock starts, or null for no clock:
 *   upcoming call → no clock. The call is the next touch; only an explicit
 *                   next follow-up flags them before it.
 *   past call     → the later of the call and the last contact.
 *   lead only, or only cancelled bookings → the last contact, else when they
 *                   verified (or booked). An unverified
 *                   lead has no clock: they never proved the number, so they
 *                   are only flagged by a follow-up date Jacob sets.
 */
function contactClock(p: FollowUpInput, now: number): number | null {
  const contacted = p.lastContactedAt ? Date.parse(p.lastContactedAt) : null
  const b = primaryBooking(p.bookings)
  if (b && effectiveShow(b) !== 'cancelled') {
    const at = Date.parse(b.scheduledAt)
    if (at > now) return null
    return Math.max(at, contacted ?? 0)
  }
  // Only cancelled bookings left: chased like a lead. A booking proves the
  // number as well as OTP does, so it starts the clock when there is no OTP.
  if (contacted !== null) return contacted
  if (p.verifiedAt) return Date.parse(p.verifiedAt)
  return b ? Date.parse(b.createdAt) : null
}

/**
 * Due when nextFollowUpAt has passed (any status), or when the person is still
 * open (pending / working) with no contact in FOLLOW_UP_STALE_DAYS. A future
 * nextFollowUpAt suppresses the stale rule: a follow-up deliberately
 * scheduled is handled, and nagging about it is noise.
 */
export function followUpState(p: FollowUpInput, now: number): FollowUp {
  if (p.nextFollowUpAt) {
    const next = Date.parse(p.nextFollowUpAt)
    return next <= now ? { due: true, reason: 'overdue', since: next } : { due: false, scheduled: next }
  }
  if (!isOpenStatus(p.status)) return { due: false, scheduled: null }
  const clock = contactClock(p, now)
  if (clock !== null && now - clock >= FOLLOW_UP_STALE_DAYS * DAY_MS) {
    return { due: true, reason: 'stale', since: clock }
  }
  return { due: false, scheduled: null }
}

/**
 * When this person last did something: their latest booking's call time if
 * they booked (an upcoming call counts, so it sorts to the top), otherwise when
 * the lead came in.
 */
export function activityAt(p: Pick<PipelinePerson, 'bookings' | 'leadCreatedAt'>): number {
  if (p.bookings.length > 0) return Math.max(...p.bookings.map((b) => Date.parse(b.scheduledAt)))
  return p.leadCreatedAt ? Date.parse(p.leadCreatedAt) : 0
}

export const SORTS = ['newest', 'follow_up'] as const
export type SortKey = (typeof SORTS)[number]
export const SORT_LABELS: Record<SortKey, string> = { newest: 'Newest first', follow_up: 'Needs follow-up' }

/** Newest activity at the top. The backfill order. */
export function sortNewest<T extends Pick<PipelinePerson, 'bookings' | 'leadCreatedAt'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => activityAt(b) - activityAt(a))
}

/**
 * Follow-up order, soonest first:
 *   1. due now, longest waiting first
 *   2. follow-up scheduled for later, soonest first
 *   3. everyone else, most recent activity first
 */
export function sortPipeline<T extends FollowUpInput>(rows: T[], now: number): T[] {
  const rank = (f: FollowUp) => (f.due ? 0 : f.scheduled !== null ? 1 : 2)
  const keyed = rows.map((r) => ({ r, f: followUpState(r, now) }))
  keyed.sort((a, b) => {
    const ra = rank(a.f)
    const rb = rank(b.f)
    if (ra !== rb) return ra - rb
    if (a.f.due && b.f.due) return a.f.since - b.f.since
    if (!a.f.due && !b.f.due && a.f.scheduled !== null && b.f.scheduled !== null) return a.f.scheduled - b.f.scheduled
    return activityAt(b.r) - activityAt(a.r)
  })
  return keyed.map((k) => k.r)
}

// -------------------------------------------
// ROI rollup
// -------------------------------------------

export type RoiRow = {
  key: string
  /** People in the group, booked or not. */
  leads: number
  /** People who passed OTP or booked (a booking is proof of the number too). */
  verified: number
  /** Every booking, cancelled included: each one was paid for. */
  bookings: number
  showed: number
  noShow: number
  cancelled: number
  /** Bookings with no show / no-show / cancel mark yet: upcoming or not backfilled. */
  notMarked: number
  /** showed ÷ (showed + no-show). Cancelled and unmarked stay out. Null when 0/0. */
  showRate: number | null
  /** People, not bookings. */
  won: number
  /** won ÷ people who showed. Null when nobody has showed. */
  closeRate: number | null
  mrr: number
  setup: number
}

export const NO_TERM = '(no utm_term)'
export const NO_SURFACE = '(no booking)'
/** Booked, but from before the funnel recorded which calendar. */
export const UNKNOWN_SURFACE = '(surface not recorded)'

type RoiInput = Pick<
  PipelinePerson,
  'isTest' | 'bookings' | 'status' | 'mrr' | 'setupFee' | 'utmTerm' | 'verifiedAt'
>

/** Test numbers are the only exclusion. Junk and cancelled still cost money. */
export const countsForRoi = (p: Pick<RoiInput, 'isTest'>) => !p.isTest

function tally(key: string, people: RoiInput[]): RoiRow {
  const r: RoiRow = {
    key, leads: people.length, verified: 0, bookings: 0, showed: 0, noShow: 0, cancelled: 0,
    notMarked: 0, showRate: null, won: 0, closeRate: null, mrr: 0, setup: 0,
  }
  let showedPeople = 0
  for (const p of people) {
    if (p.verifiedAt || p.bookings.length > 0) r.verified++
    for (const b of p.bookings) {
      r.bookings++
      const s = effectiveShow(b)
      if (s === 'showed') r.showed++
      else if (s === 'no_show') r.noShow++
      else if (s === 'cancelled') r.cancelled++
      else r.notMarked++
    }
    if (stageOf(p) === 'showed') showedPeople++
    if (p.status === 'won') {
      r.won++
      r.mrr += p.mrr ?? 0
      r.setup += p.setupFee ?? 0
    }
  }
  const decided = r.showed + r.noShow
  r.showRate = decided > 0 ? r.showed / decided : null
  r.closeRate = showedPeople > 0 ? r.won / showedPeople : null
  return r
}

/**
 * Grouped by utm_term, or by surfaceKey (people who never booked land in
 * NO_SURFACE, old bookings with no recorded surface in UNKNOWN_SURFACE). Sorted by leads desc, plus a
 * total row.
 */
export function rollupRoi(people: RoiInput[], by: 'utmTerm' | 'surface'): { groups: RoiRow[]; total: RoiRow } {
  const counted = people.filter(countsForRoi)
  const keyOf = (p: RoiInput) =>
    by === 'utmTerm' ? p.utmTerm || NO_TERM : surfaceKey(p)
  const buckets = new Map<string, RoiInput[]>()
  for (const p of counted) {
    const k = keyOf(p)
    const list = buckets.get(k)
    if (list) list.push(p)
    else buckets.set(k, [p])
  }
  const groups = Array.from(buckets, ([k, list]) => tally(k, list)).sort(
    (a, b) => b.leads - a.leads || a.key.localeCompare(b.key)
  )
  return { groups, total: tally('Total', counted) }
}
