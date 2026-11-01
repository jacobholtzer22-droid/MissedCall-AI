// ===========================================
// Ops HQ autoflow (OPS_AUTOFLOW, off by default): one next step per event
// ===========================================
// After a job's specialist runs finish (the chief's report turn) and after an
// applied web_push, this decides the ONE next step for each event from a fixed
// table and runs it in code. The model picks nothing: the report turn gets no
// extra tools and only reads one line saying what autoflow did.
//
// The table only ever does two kinds of thing:
//   review          read the finished build's PR and preview, website step to
//                   send_preview. Nothing public, nothing spent, nothing sent.
//   go_live,        create the Push approval card through start_web_task's own
//   set_email_records, code (go_live through the existing go-live gate, with no
//   install_tracking  "skip" ever passed). The card waits for Jacob; autoflow stops.
//
// Hard limits, each enforced here in code and tested (lib/ops/autoflow.test.ts):
//   1. One next step per event, never a second hop without a new event: an
//      event (a finished run, an applied approval) is handled once (a marker
//      activity), and a hop never starts a run or applies anything itself.
//   2. Never past an approval point: the only web kinds autoflow may start
//      are AUTOFLOW_KINDS; three of them only create a card. brief (set_brief),
//      merge, connect_domain, buy_domain, provision, site_build, site_update,
//      ads apply and billing are not in the table and are refused if asked.
//   3. No spend or enable: no ads runs at all (an ads work run lets the ads
//      model make AUTO writes, which the table could not hold to), no apply
//      mode, no budget, and go_live only through goLiveGate with said = ''.
//   4. Loop guard: the same kind on the same deliverable at the same step as
//      the last autoflow hop stops, with a note on the client and on the
//      deliverable's waiting note, instead of starting it again.
//   5. Never messages anyone: none of the kinds sends; there is no send here.
//   6. Every hop and every stop is an OpsActivity (system, "[autoflow] ...")
//      and an "[autoflow]" console line, with the rule and the reason.

import { trackingBlockFrom } from '@/lib/ops/tracking'

export function autoflowEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.OPS_AUTOFLOW === 'true'
}

/** The only start_web_task kinds autoflow may run. Everything else is refused in executeHop. */
export const AUTOFLOW_KINDS = ['review', 'go_live', 'set_email_records', 'install_tracking'] as const
export type AutoflowKind = (typeof AUTOFLOW_KINDS)[number]

/** The approval points: autoflow stops before each and never does any of them. */
export const APPROVAL_POINTS = ['brief OK', 'preview sent and client OK', 'merge Push', 'go-live Push', 'domain Push', 'ads enable Push', 'billing'] as const

export type AutoflowEvent =
  | { type: 'run'; id: string; agent: string; kind: string; status: string; engagementId: string; trackingRun: boolean }
  | { type: 'approval'; id: string; action: string; engagementId: string }

export type DeliverableState = { type: string; step: string | null; stepUpdatedAt: string | null; evidence: Record<string, unknown> }

export type Decision =
  | { act: true; rule: string; kind: AutoflowKind; deliverable: string; reason: string; stopsAt: string }
  | { act: false; rule: string | null; reason: string }

const ev = (ds: DeliverableState[], type: string) => ds.find((d) => d.type === type) ?? null

/**
 * The fixed next-step table. Pure: one event and the client's deliverables in,
 * at most one step out. Order matters only in that the first matching rule wins.
 */
export const AUTOFLOW_TABLE: {
  rule: string
  /** What the row reads as, for the docs and the report. */
  when: string
  then: AutoflowKind
  deliverable: string
  stopsAt: string
  match: (e: AutoflowEvent, ds: DeliverableState[]) => string | null
}[] = [
  {
    rule: 'build_done_review',
    when: 'a site_build or site_update run succeeded, the website step is review, it was not a tracking update, and the site is not live yet',
    then: 'review',
    deliverable: 'website',
    stopsAt: 'preview sent and client OK (Jacob sends the preview; merge is his Push)',
    match: (e, ds) => {
      if (e.type !== 'run' || e.agent !== 'web' || e.status !== 'succeeded') return null
      if (e.kind !== 'site_build' && e.kind !== 'site_update') return null
      if (e.trackingRun) return null
      const w = ev(ds, 'website')
      if (!w || w.step !== 'review') return null
      if (w.evidence.siteIndexableFlag === true) return null
      return 'the build finished green and waits for review'
    },
  },
  {
    rule: 'merged_go_live_card',
    when: 'a merge Push was applied',
    then: 'go_live',
    deliverable: 'website',
    stopsAt: 'go-live Push (the card waits for Jacob; the gate may refuse with its list)',
    match: (e) => (e.type === 'approval' && e.action === 'merge' ? 'the site PR was merged' : null),
  },
  {
    rule: 'domain_bought_email_card',
    when: 'a buy_domain Push was applied and the email deliverable is at dns_records',
    then: 'set_email_records',
    deliverable: 'email',
    stopsAt: 'domain Push (the email records card waits for Jacob)',
    match: (e, ds) => (e.type === 'approval' && e.action === 'buy_domain' && ev(ds, 'email')?.step === 'dns_records' ? 'the domain is on Vercel DNS now' : null),
  },
  {
    rule: 'labels_read_tracking_card',
    when: 'an ads run finished, the ads deliverable has the AW- id and labels, the site has a repo and no tag yet',
    then: 'install_tracking',
    deliverable: 'website',
    stopsAt: 'tracking Push (the card waits for Jacob)',
    match: (e, ds) => {
      if (e.type !== 'run' || e.agent !== 'ads' || e.status !== 'succeeded') return null
      const ads = ev(ds, 'ads')
      const w = ev(ds, 'website')
      if (!ads || !w || typeof w.evidence.repoUrl !== 'string' || w.evidence.trackingInstalled === true) return null
      return trackingBlockFrom(ads.evidence).block ? 'the conversion labels are on file and the site has no Google tag' : null
    },
  },
]

/** One event, at most one next step. */
export function nextStep(deliverables: DeliverableState[], event: AutoflowEvent): Decision {
  for (const row of AUTOFLOW_TABLE) {
    const reason = row.match(event, deliverables)
    if (reason) return { act: true, rule: row.rule, kind: row.then, deliverable: row.deliverable, reason, stopsAt: row.stopsAt }
  }
  return { act: false, rule: null, reason: 'no table row for this event' }
}

/** The marker line every handled event leaves, so the same event never hops twice. */
export const eventMarker = (e: AutoflowEvent) => `[autoflow] event ${e.type}:${e.id}`

/** A hop's activity body. The loop guard reads kind and step back out of it. */
export function hopBody(e: AutoflowEvent, d: Extract<Decision, { act: true }>, at: StepAt, outcome: string): string {
  return `${eventMarker(e)} | rule ${d.rule} | started ${d.kind} on ${d.deliverable} at step ${at.step ?? 'none'} since ${at.stepUpdatedAt ?? 'never'} | ${d.reason} | ${outcome} | stops at: ${d.stopsAt}`
}

export type StepAt = { step: string | null; stepUpdatedAt: string | null }

/**
 * True when the last hop on this client was the same kind on the same
 * deliverable at the same step, with no step write since (same stepUpdatedAt).
 * A step that moved away and came back (review, send_preview, review after a
 * revision) is a change, not a loop.
 */
export function isLoop(lastHopBody: string | null, d: Extract<Decision, { act: true }>, at: StepAt): boolean {
  if (!lastHopBody) return false
  const m = lastHopBody.match(/\| started (\S+) on (\S+) at step (\S+) since (\S+) \|/)
  return Boolean(m && m[1] === d.kind && m[2] === d.deliverable && m[3] === (at.step ?? 'none') && m[4] === (at.stepUpdatedAt ?? 'never'))
}

// -------------------------------------------
// Running one event (side effects injected; lib/ops/autoflow-server.ts wires them)
// -------------------------------------------

export type AutoflowDeps = {
  deliverables(engagementId: string): Promise<DeliverableState[]>
  /** True when an activity with this exact marker already exists on the client. */
  handled(engagementId: string, marker: string): Promise<boolean>
  /** The newest "| started " autoflow activity body on this client, or null. */
  lastHop(engagementId: string): Promise<string | null>
  /** start_web_task for one kind, with said = '' (no gate skips), under the given run and job. */
  startWeb(engagementId: string, kind: AutoflowKind): Promise<{ done: string }>
  activity(engagementId: string, body: string, kind: 'system' | 'note'): Promise<void>
  waitingNote(engagementId: string, deliverableType: string, note: string): Promise<void>
  log?: (line: string) => void
}

export type HopResult = { event: string; acted: boolean; line: string }

/** Handle one event: at most one hop, logged, never twice for the same event. */
export async function runAutoflowEvent(event: AutoflowEvent, deps: AutoflowDeps): Promise<HopResult> {
  const log = deps.log ?? ((l: string) => console.log(l))
  const marker = eventMarker(event)
  if (await deps.handled(event.engagementId, marker)) return { event: marker, acted: false, line: 'already handled' }

  const ds = await deps.deliverables(event.engagementId)
  const d = nextStep(ds, event)
  if (!d.act) {
    // Recorded too, so the event is handled once even when there was nothing to do.
    await deps.activity(event.engagementId, `${marker} | no step | ${d.reason}`, 'system')
    log(`[autoflow] ${marker} no step: ${d.reason}`)
    return { event: marker, acted: false, line: d.reason }
  }
  if (!(AUTOFLOW_KINDS as readonly string[]).includes(d.kind)) {
    // Unreachable through the table; kept so a bad table row can never act.
    throw new Error(`autoflow refused kind ${d.kind}`)
  }
  const target = ds.find((x) => x.type === d.deliverable)
  const at: StepAt = { step: target?.step ?? null, stepUpdatedAt: target?.stepUpdatedAt ?? null }
  if (isLoop(await deps.lastHop(event.engagementId), d, at)) {
    const note = `Autoflow stopped: ${d.kind} on ${d.deliverable} would run again at step ${at.step ?? 'none'} with nothing changed. Check it and do the next step by hand.`
    await deps.activity(event.engagementId, `${marker} | loop guard | ${note}`, 'note')
    await deps.waitingNote(event.engagementId, d.deliverable, note)
    log(`[autoflow] ${marker} LOOP GUARD ${d.rule}: ${note}`)
    return { event: marker, acted: false, line: note }
  }
  let outcome: string
  try {
    outcome = (await deps.startWeb(event.engagementId, d.kind)).done
  } catch (err) {
    // A refusal (the go-live gate's unmet list, a missing repo) is the stop: say it, do nothing else.
    outcome = `refused: ${err instanceof Error ? err.message : String(err)}`
  }
  const body = hopBody(event, d, at, outcome)
  await deps.activity(event.engagementId, body, 'system')
  log(`[autoflow] ${body}`)
  return { event: marker, acted: true, line: `${d.kind} for ${d.deliverable}: ${outcome}` }
}
