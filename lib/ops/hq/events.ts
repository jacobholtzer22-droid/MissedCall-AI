// ===========================================
// Ops HQ — the live feed (AgentEvent rows) and copy hygiene
// ===========================================
// One AgentEvent per completed content block or status change. label is the
// one line the feed shows; detail is the payload, trimmed, never a secret (the
// API key and Google Ads credentials never reach a block or a tool result).

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { AgentEventKind } from '@/lib/ops/types'

const LABEL_MAX = 140
const DETAIL_MAX = 20000

/** No em dashes anywhere in agent output or UI copy. */
export function noEmDash(s: string): string {
  return s.replace(/\s*—\s*/g, ', ').replace(/–/g, '-')
}

export function oneLine(s: string, max = LABEL_MAX): string {
  const flat = noEmDash(s).replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function trimDetail(detail: unknown): Prisma.InputJsonValue | undefined {
  if (detail === undefined || detail === null) return undefined
  const text = JSON.stringify(detail)
  if (text.length <= DETAIL_MAX) return detail as Prisma.InputJsonValue
  return { truncated: true, chars: text.length, head: text.slice(0, DETAIL_MAX) }
}

export async function emit(runId: string, kind: AgentEventKind, label: string, detail?: unknown) {
  await db.agentEvent.create({ data: { runId, kind, label: oneLine(label), detail: trimDetail(detail) } })
}
