// ===========================================
// /admin/ops — editable Deliverable.evidence keys
// ===========================================
// Pure and client-safe. The PATCH route accepts only EVIDENCE_KEYS; the detail
// panel shows the subset that belongs to each deliverable type. telnyxNumber
// and adsCustomerId are sync-owned and shown read only.

import type { DeliverableType } from '@/lib/ops/types'

export const EVIDENCE_KEYS = [
  'domain',
  'registrar',
  'repoUrl',
  'branch',
  'previewUrl',
  'productionUrl',
  'workspaceDomain',
  'locationId',
] as const
export type EvidenceKey = (typeof EVIDENCE_KEYS)[number]

export const EVIDENCE_FIELDS_FOR_TYPE: Record<DeliverableType, readonly EvidenceKey[]> = {
  website: ['repoUrl', 'branch', 'previewUrl', 'productionUrl'],
  domain: ['domain', 'registrar'],
  email: ['workspaceDomain'],
  missedcall: [],
  ads: [],
  gbp: ['locationId'],
}

/** Evidence keys the sync writes; displayed, never edited by hand. */
export const SYNC_EVIDENCE_FOR_TYPE: Partial<Record<DeliverableType, readonly string[]>> = {
  missedcall: ['telnyxNumber'],
  ads: ['adsCustomerId'],
}
