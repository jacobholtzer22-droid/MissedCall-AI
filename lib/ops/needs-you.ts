// ===========================================
// /admin/ops: Needs you, one ranked list
// ===========================================
// Pure and client-safe. The Home column and the chief's get_needs_you tool
// both call rankNeedsYou, so what the screen shows and what the chief answers
// to "what should I do" can never disagree.
//
// Rank order, then the order inside each group:
//   1 approval      pending approvals, oldest first
//   2 red_alert     one row per client with red alerts, most alerts first
//   3 waiting_on_you deliverable steps with waitingOn = jacob, oldest step first
//   4 follow_up     client and prospect follow-ups due, most overdue first
//   5 booking       demo calls today, by time (counted only while unmarked)
//   6 yellow_alert  one row per client with yellow alerts (follow_up_due left
//                   out: it is already a follow_up row), most alerts first
// Deliverables waiting on a client or vendor are returned apart, as
// waitingOnOthers: they are not Jacob's to do, but the list stays visible.

import type { OpsAlert } from './alerts'

export type NeedsYouKind = 'approval' | 'red_alert' | 'waiting_on_you' | 'follow_up' | 'booking' | 'yellow_alert'

export const NEEDS_YOU_RANK: Record<NeedsYouKind, number> = {
  approval: 1,
  red_alert: 2,
  waiting_on_you: 3,
  follow_up: 4,
  booking: 5,
  yellow_alert: 6,
}

export type NeedsYouItem = {
  key: string
  kind: NeedsYouKind
  rank: number
  engagementId: string | null
  /** Client or prospect name; null for an approval with no client. */
  client: string | null
  /** One line: what needs doing. */
  what: string
  /** When it started: approval created, step set, follow-up due, booking time. */
  at: string | null
  approvalId?: string
  bookingId?: string
  showStatus?: string
  followUpKind?: 'client' | 'prospect'
  phone?: string | null
  /** Counted in the Home badge. A booking already marked showed or no-show is not. */
  counts: boolean
}

export type NeedsYouWaiting = {
  engagementId: string
  client: string
  type: string
  waitingOn: string
  what: string
  at: string | null
}

/** The slice of the board the ranking reads (OpsBoard satisfies it). */
export type NeedsYouBoard = {
  engagements: {
    id: string
    displayName: string
    alerts: OpsAlert[]
    deliverables: { type: string; step: string | null; stepLabel: string | null; waitingOn: string | null; waitingNote: string | null; stepUpdatedAt: string | null }[]
  }[]
  followUpsDue: { kind: 'client' | 'prospect'; id: string; name: string; phone: string | null; dueAt: string }[]
  bookedToday: { id: string; customerName: string; scheduledAt: string; status: string; showStatus: string }[]
}

export type NeedsYouApproval = {
  id: string
  title: string
  agent: string
  status: string
  client: string | null
  engagementId: string | null
  createdAt: string
}

export const DELIVERABLE_NAMES: Record<string, string> = {
  website: 'Website',
  domain: 'Domain',
  email: 'Email',
  missedcall: 'Missed call',
  ads: 'Ads',
  gbp: 'Google Business Profile',
}

const oldestFirst = (a: { at: string | null }, b: { at: string | null }) => (a.at ?? '').localeCompare(b.at ?? '')

export function rankNeedsYou(
  board: NeedsYouBoard,
  approvals: NeedsYouApproval[]
): { items: NeedsYouItem[]; count: number; waitingOnOthers: NeedsYouWaiting[] } {
  const items: NeedsYouItem[] = []

  // 1. Approvals waiting for Push.
  approvals
    .filter((a) => a.status === 'pending')
    .map((a) => ({ a, at: a.createdAt }))
    .sort(oldestFirst)
    .forEach(({ a }) =>
      items.push({
        key: `approval:${a.id}`,
        kind: 'approval',
        rank: NEEDS_YOU_RANK.approval,
        engagementId: a.engagementId,
        client: a.client,
        what: a.title,
        at: a.createdAt,
        approvalId: a.id,
        counts: true,
      })
    )

  // 2. Red alerts, one row per client.
  board.engagements
    .map((e) => ({ e, red: e.alerts.filter((x) => x.severity === 'red') }))
    .filter((r) => r.red.length > 0)
    .sort((a, b) => b.red.length - a.red.length || a.e.displayName.localeCompare(b.e.displayName))
    .forEach(({ e, red }) =>
      items.push({
        key: `red:${e.id}`,
        kind: 'red_alert',
        rank: NEEDS_YOU_RANK.red_alert,
        engagementId: e.id,
        client: e.displayName,
        what: red.map((x) => x.message).join('; '),
        at: null,
        counts: true,
      })
    )

  // 3 and the side list: deliverable steps by who they wait on.
  const steps = board.engagements.flatMap((e) =>
    e.deliverables
      .filter((d) => d.waitingOn && d.waitingOn !== 'none')
      .map((d) => ({
        engagementId: e.id,
        client: e.displayName,
        type: d.type,
        waitingOn: d.waitingOn as string,
        what: `${DELIVERABLE_NAMES[d.type] ?? d.type}: ${d.stepLabel ?? d.step ?? 'next step'}${d.waitingNote ? ` (${d.waitingNote})` : ''}`,
        at: d.stepUpdatedAt,
      }))
  )
  steps
    .filter((s) => s.waitingOn === 'jacob')
    .sort(oldestFirst)
    .forEach((s) =>
      items.push({
        key: `step:${s.engagementId}:${s.type}`,
        kind: 'waiting_on_you',
        rank: NEEDS_YOU_RANK.waiting_on_you,
        engagementId: s.engagementId,
        client: s.client,
        what: s.what,
        at: s.at,
        counts: true,
      })
    )

  // 4. Follow-ups due (the board already sorts them oldest due first).
  board.followUpsDue.forEach((f) =>
    items.push({
      key: `follow:${f.kind}:${f.id}`,
      kind: 'follow_up',
      rank: NEEDS_YOU_RANK.follow_up,
      engagementId: f.kind === 'client' ? f.id : null,
      client: f.name,
      what: f.kind === 'client' ? 'Follow-up due' : 'Prospect follow-up due',
      at: f.dueAt,
      followUpKind: f.kind,
      phone: f.phone,
      counts: true,
    })
  )

  // 5. Demo calls today.
  board.bookedToday
    .filter((b) => b.status !== 'cancelled')
    .forEach((b) =>
      items.push({
        key: `booking:${b.id}`,
        kind: 'booking',
        rank: NEEDS_YOU_RANK.booking,
        engagementId: null,
        client: b.customerName,
        what: 'Demo call today',
        at: b.scheduledAt,
        bookingId: b.id,
        showStatus: b.showStatus,
        counts: b.showStatus === 'pending',
      })
    )

  // 6. Yellow alerts, one row per client.
  board.engagements
    .map((e) => ({ e, yellow: e.alerts.filter((x) => x.severity === 'yellow' && x.code !== 'follow_up_due') }))
    .filter((r) => r.yellow.length > 0)
    .sort((a, b) => b.yellow.length - a.yellow.length || a.e.displayName.localeCompare(b.e.displayName))
    .forEach(({ e, yellow }) =>
      items.push({
        key: `yellow:${e.id}`,
        kind: 'yellow_alert',
        rank: NEEDS_YOU_RANK.yellow_alert,
        engagementId: e.id,
        client: e.displayName,
        what: yellow.map((x) => x.message).join('; '),
        at: null,
        counts: true,
      })
    )

  return {
    items,
    count: items.filter((i) => i.counts).length,
    waitingOnOthers: steps.filter((s) => s.waitingOn !== 'jacob').sort(oldestFirst),
  }
}
