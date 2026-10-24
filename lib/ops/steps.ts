// ===========================================
// /admin/ops — waiting-on steps
// ===========================================
// Every Deliverable sits at one step from a fixed per-type catalog. Each step
// has an owner: who the work is waiting on (jacob, client, vendor), or none
// once it is done. Terminal steps are the end states; the deliverable reads as
// live, except paused_by_client which reads as paused.
//
// Pure and client-safe: the PATCH route validates against it, the board and
// the panel label from it, and the seed scripts use the keys.

import type { DeliverableStatus, DeliverableType } from '@/lib/ops/types'

export const STEP_OWNERS = ['jacob', 'client', 'vendor', 'none'] as const
export type StepOwner = (typeof STEP_OWNERS)[number]

/** Deliverable.waitingOn: who a non-terminal step is waiting on. */
export const WAITING_ON = ['jacob', 'client', 'vendor'] as const
export type WaitingOn = (typeof WAITING_ON)[number]

export type Step = { key: string; label: string; owner: StepOwner; terminal: boolean }

const step = (key: string, owner: StepOwner, label: string, terminal = false): Step => ({ key, label, owner, terminal })
const live = (label = 'Live'): Step => step('live', 'none', label, true)

/** Ordered: the usual path from first step to done. */
export const STEP_CATALOG: Record<DeliverableType, readonly Step[]> = {
  website: [
    step('brief', 'client', 'Waiting on client: intake answers or photos'),
    step('build', 'jacob', 'Build in progress'),
    step('send_preview', 'jacob', 'Send the preview to the client'),
    step('client_review', 'client', 'Client reviewing the preview'),
    step('revisions', 'jacob', 'Revisions in progress'),
    step('approved', 'none', 'Approved, ready for go-live'),
    live(),
  ],
  domain: [
    step('owner_unknown', 'client', 'Find out who holds the domain'),
    step('transfer_requested', 'client', 'Client to unlock and send the auth code'),
    step('transfer_in_progress', 'vendor', 'Registrar transfer in progress'),
    step('dns_by_client', 'client', 'Client to point DNS, on a call'),
    step('dns_records', 'jacob', 'Add the DNS records'),
    step('propagating', 'vendor', 'DNS propagating'),
    live(),
  ],
  email: [
    step('workspace', 'jacob', 'Create the Google Workspace'),
    step('dns_records', 'jacob', 'Add MX, SPF, DKIM, DMARC'),
    step('user_added', 'jacob', 'Add the client as a user'),
    live(),
  ],
  missedcall: [
    step('number', 'jacob', 'Assign a Telnyx number'),
    step('tendlc', 'vendor', 'Waiting on Telnyx: 10DLC approval'),
    step('forwarding', 'client', 'Client to set up conditional forwarding or change phone plan'),
    step('test', 'jacob', 'Test forwarding and text-back'),
    live(),
  ],
  ads: [
    step('account', 'jacob', 'Create the ad account'),
    step('verification_docs', 'jacob', 'Upload advertiser verification documents'),
    step('verification', 'vendor', 'Waiting on Google: advertiser verification'),
    step('payment', 'client', 'Client to add a payment method'),
    step('budget', 'client', 'Client to confirm budget'),
    step('business_docs', 'client', 'Client to provide LLC or business documents'),
    step('campaign_build', 'jacob', 'Build the campaign'),
    step('site_live', 'jacob', 'Enable after the website goes live'),
    step('enable', 'jacob', 'Built and paused, turn it on'),
    step('running', 'none', 'Running', true),
    step('paused_by_client', 'client', "Paused at the client's request", true),
  ],
  gbp: [
    step('create', 'client', 'Client to create the profile'),
    step('verification', 'vendor', 'Waiting on Google: profile verification'),
    step('manager_access', 'client', 'Client to add Jacob as manager'),
    step('optimize', 'jacob', 'Optimize the profile'),
    live(),
  ],
}

/** The step, or null when the key is not in this type's catalog. */
export function stepFor(type: string, key: string | null | undefined): Step | null {
  if (!key) return null
  return STEP_CATALOG[type as DeliverableType]?.find((s) => s.key === key) ?? null
}

export function ownerOf(type: string, key: string | null | undefined): StepOwner | null {
  return stepFor(type, key)?.owner ?? null
}

export function isTerminal(type: string, key: string | null | undefined): boolean {
  return stepFor(type, key)?.terminal ?? false
}

/**
 * waitingOn a step implies: its owner, null for 'none' (done or approved).
 * paused_by_client is terminal but owned by the client, so it waits on the
 * client to resume.
 */
export function defaultWaitingOn(type: string, key: string | null | undefined): WaitingOn | null {
  const owner = ownerOf(type, key)
  return owner && owner !== 'none' ? owner : null
}

/**
 * The status the UI shows. A hand-set manualStatus wins; otherwise a terminal
 * step is live (paused_by_client is paused), any other step is in_progress,
 * and with no step the sync's computedStatus stands.
 */
export function effectiveStatusOf(d: {
  type: string
  manualStatus: string | null
  computedStatus: string
  step: string | null
}): DeliverableStatus {
  if (d.manualStatus) return d.manualStatus as DeliverableStatus
  if (d.step === 'paused_by_client') return 'paused'
  const s = stepFor(d.type, d.step)
  if (s?.terminal) return 'live'
  if (s) return 'in_progress'
  return d.computedStatus as DeliverableStatus
}
