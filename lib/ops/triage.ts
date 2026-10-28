// ===========================================
// /admin/ops: Home triage, one client list in four buckets
// ===========================================
// Pure and client-safe. Home and the chief's get_needs_you both call
// bucketClients, so the list Jacob sees and the chief's "what should I do"
// are the same thing.
//
// Every engagement that is not churned or ignored lands in exactly one
// bucket, first match wins:
//   today            a pending approval for this client; red past_due or
//                    deliverable_blocked; red no_owner_contact while something
//                    that produces leads is live (website live, missed call at
//                    test or live); a client follow-up due
//   getDone          a deliverable waiting on Jacob; no step set at all while
//                    paid_upfront / onboarding / active; no_subscription,
//                    stripe_unlinked, or no_owner_contact with nothing live
//   waitingOnClient  at least one open step, and every open step waits on the
//                    client or a vendor
//   live             everything else (nothing open, no red alert)
// A step is open when it is set and waits on someone, and is not terminal,
// except paused_by_client: terminal in the catalog, but it waits on the client
// to resume. no_owner_contact counts only when red (nobody is notified); the
// yellow half-missing case is panel information, not work.
// Each entry carries every reason that matched (its bucket's first), each
// with when it started, and one primary action. Prospect follow-ups and demo
// calls are not clients: they come back apart, as sales.

import type { OpsAlert } from './alerts'

export type BucketKey = 'today' | 'getDone' | 'waitingOnClient' | 'live'

export const BUCKET_LABELS: Record<BucketKey, string> = {
  today: 'Today',
  getDone: 'Get done',
  waitingOnClient: 'Waiting on client',
  live: 'All set and live',
}

export type TriageReason = { text: string; at: string | null; bucket: BucketKey }

export type TriageEntry = {
  engagementId: string
  name: string
  bucket: BucketKey
  reasons: TriageReason[]
  primaryAction: { kind: 'push'; approvalId: string } | { kind: 'log_contact' } | { kind: 'open' } | null
  /** Sort key within the bucket: when the oldest reason started. */
  since: string | null
}

export type TriageClient = {
  id: string
  displayName: string
  stage: string
  alerts: OpsAlert[]
  nextFollowUpAt: string | null
  lastContactedAt: string | null
  createdAt: string
  deliverables: { type: string; step: string | null; stepLabel: string | null; stepTerminal: boolean; waitingOn: string | null; waitingNote: string | null; stepUpdatedAt: string | null }[]
}

export type TriageBoard = {
  engagements: TriageClient[]
  followUpsDue: { kind: 'client' | 'prospect'; id: string; name: string; phone: string | null; dueAt: string }[]
  bookedToday: { id: string; customerName: string; scheduledAt: string; status: string; showStatus: string }[]
}

export type TriageApproval = { id: string; title: string; status: string; engagementId: string | null; createdAt: string }

export type Triage = {
  today: TriageEntry[]
  getDone: TriageEntry[]
  waitingOnClient: TriageEntry[]
  live: TriageEntry[]
  churnedCount: number
  sales: { prospectFollowUps: TriageBoard['followUpsDue']; demoCallsToday: TriageBoard['bookedToday'] }
}

const NAMES: Record<string, string> = {
  website: 'Website',
  domain: 'Domain',
  email: 'Email',
  missedcall: 'Missed call',
  ads: 'Ads',
  gbp: 'Google Business Profile',
}
const WHO: Record<string, string> = { jacob: 'you', client: 'client', vendor: 'vendor' }
const STARTED_STAGES = ['paid_upfront', 'onboarding', 'active']

const DAY = 86_400_000
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Detroit' })
const shortTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Detroit' })

function since(iso: string, now: Date): string {
  const d = new Date(iso)
  const sameDay = shortDate(iso) === shortDate(now.toISOString())
  return sameDay ? `since ${shortTime(iso)}` : `since ${shortDate(d.toISOString())}`
}

const isOpen = (d: TriageClient['deliverables'][number]) =>
  Boolean(d.step) && (!d.stepTerminal || d.step === 'paused_by_client') && Boolean(d.waitingOn && WHO[d.waitingOn])

/** Something live that produces leads: a website at live, or missed-call texting at test or live. */
function leadsLive(e: TriageClient): boolean {
  return e.deliverables.some((d) => (d.type === 'website' && d.step === 'live') || (d.type === 'missedcall' && (d.step === 'test' || d.step === 'live')))
}

export function bucketClients(board: TriageBoard, approvals: TriageApproval[], now: Date): Triage {
  const out: Triage = {
    today: [],
    getDone: [],
    waitingOnClient: [],
    live: [],
    churnedCount: 0,
    sales: {
      prospectFollowUps: board.followUpsDue.filter((f) => f.kind === 'prospect'),
      demoCallsToday: board.bookedToday.filter((b) => b.status !== 'cancelled'),
    },
  }
  const pending = approvals.filter((a) => a.status === 'pending')

  for (const e of board.engagements) {
    if (e.stage === 'ignored') continue
    if (e.stage === 'churned') {
      out.churnedCount++
      continue
    }
    const reasons: TriageReason[] = []
    const add = (bucket: BucketKey, text: string, at: string | null) => reasons.push({ bucket, text, at })
    const red = (code: string) => e.alerts.find((a) => a.code === code && a.severity === 'red')
    const alert = (code: string) => e.alerts.find((a) => a.code === code)
    const live = leadsLive(e)

    // Today
    const mine = pending.filter((a) => a.engagementId === e.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    for (const a of mine) add('today', `Waiting for your Push: ${a.title}`, a.createdAt)
    for (const code of ['past_due', 'deliverable_blocked']) {
      const r = red(code)
      if (r) add('today', r.message, null)
    }
    const noContact = alert('no_owner_contact')
    if (noContact?.severity === 'red' && live) add('today', `${noContact.message} (something is live)`, null)
    if (e.nextFollowUpAt && new Date(e.nextFollowUpAt) <= now) add('today', `Follow-up due ${since(e.nextFollowUpAt, now)}`, e.nextFollowUpAt)

    // Get done
    for (const d of e.deliverables.filter((x) => isOpen(x) && x.waitingOn === 'jacob')) {
      add('getDone', `${NAMES[d.type] ?? d.type}: ${d.stepLabel ?? d.step}, waiting on you${d.stepUpdatedAt ? ` ${since(d.stepUpdatedAt, now)}` : ''}`, d.stepUpdatedAt)
    }
    if (STARTED_STAGES.includes(e.stage) && !e.deliverables.some((d) => d.step)) add('getDone', 'Onboarding not started: no steps set', e.createdAt)
    const noSub = alert('no_subscription')
    if (noSub) add('getDone', noSub.message, null)
    const unlinked = alert('stripe_unlinked')
    if (unlinked) add('getDone', unlinked.message, null)
    if (noContact?.severity === 'red' && !live) add('getDone', noContact.message, null)

    // Waiting on client
    const open = e.deliverables.filter(isOpen)
    if (open.length && open.every((d) => d.waitingOn === 'client' || d.waitingOn === 'vendor')) {
      const lastContact = e.lastContactedAt ? ` (last contact ${Math.max(0, Math.floor((now.getTime() - new Date(e.lastContactedAt).getTime()) / DAY))} days ago)` : ''
      for (const d of open) {
        add(
          'waitingOnClient',
          `${NAMES[d.type] ?? d.type}: ${d.waitingNote || d.stepLabel || d.step}, waiting on ${WHO[d.waitingOn!]}${d.stepUpdatedAt ? ` ${since(d.stepUpdatedAt, now)}` : ''}${lastContact}`,
          d.stepUpdatedAt
        )
      }
    }

    const bucket: BucketKey = reasons.find((r) => r.bucket === 'today')
      ? 'today'
      : reasons.find((r) => r.bucket === 'getDone')
        ? 'getDone'
        : reasons.find((r) => r.bucket === 'waitingOnClient')
          ? 'waitingOnClient'
          : 'live'
    // The bucket's own reasons first, then the rest in bucket order.
    const order: BucketKey[] = ['today', 'getDone', 'waitingOnClient', 'live']
    reasons.sort((a, b) => (a.bucket === bucket ? 0 : 1) - (b.bucket === bucket ? 0 : 1) || order.indexOf(a.bucket) - order.indexOf(b.bucket))
    const own = reasons.filter((r) => r.bucket === bucket && r.at).map((r) => r.at!)
    const approval = mine[0]
    const entry: TriageEntry = {
      engagementId: e.id,
      name: e.displayName,
      bucket,
      reasons,
      primaryAction: approval
        ? { kind: 'push', approvalId: approval.id }
        : bucket === 'today' && reasons.some((r) => r.text.startsWith('Follow-up due'))
          ? { kind: 'log_contact' }
          : bucket === 'live'
            ? null
            : { kind: 'open' },
      since: own.length ? own.sort()[0] : null,
    }
    out[bucket].push(entry)
  }

  // Oldest first; entries with no date go last, then by name.
  const bySince = (a: TriageEntry, b: TriageEntry) =>
    (a.since ? 0 : 1) - (b.since ? 0 : 1) || (a.since ?? '').localeCompare(b.since ?? '') || a.name.localeCompare(b.name)
  out.today.sort(bySince)
  out.getDone.sort(bySince)
  out.waitingOnClient.sort(bySince)
  out.live.sort((a, b) => a.name.localeCompare(b.name))
  return out
}
