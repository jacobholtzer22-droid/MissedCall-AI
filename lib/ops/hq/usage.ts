// ===========================================
// Ops HQ — recording what each run spent on the model
// ===========================================
// One AgentEvent (kind usage) per model turn: label "Turn 3 $0.042: ...",
// detail { model, turn, inputTokens, outputTokens, cacheReadTokens,
// cacheWriteTokens, costUsd }. An event, not a field on the run, on purpose:
// it is append-only, so nothing that rewrites AgentRun.output mid-run (photo
// progress, the weekly review) can lose it, and a failed or cancelled run's
// spend is still on record.
//
// When a run ends, runs.ts stamps the totals onto AgentRun.output as costUsd
// and usage (what build-credit.ts averages). Per-desk spend on HQ sums the
// events (spendByAgent), so it also counts runs that never finished.
//
// Recording never throws: a failed write is logged and the run goes on.

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { sumUsage, turnCost, usageLabel, type TurnUsage } from './pricing'

export async function recordUsage(runId: string, model: string | null, usage: Record<string, unknown> | null | undefined, turn: number | null) {
  try {
    const u = turnCost(model, usage)
    await db.agentEvent.create({
      data: { runId, kind: 'usage', label: usageLabel(turn, u), detail: { model, turn, ...u } as Prisma.InputJsonObject },
    })
  } catch (err) {
    console.error('[hq/usage] record failed:', err instanceof Error ? err.message : err)
  }
}

function readTurn(detail: unknown): TurnUsage | null {
  const d = (detail ?? null) as Record<string, unknown> | null
  if (!d) return null
  const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0)
  return {
    inputTokens: n('inputTokens'),
    outputTokens: n('outputTokens'),
    cacheReadTokens: n('cacheReadTokens'),
    cacheWriteTokens: n('cacheWriteTokens'),
    costUsd: typeof d.costUsd === 'number' ? d.costUsd : null,
  }
}

/** A run's totals so far, or null when it recorded no turn. */
export async function runUsage(runId: string): Promise<(TurnUsage & { turns: number }) | null> {
  const rows = await db.agentEvent.findMany({ where: { runId, kind: 'usage' }, select: { detail: true } })
  const turns = rows.map((r) => readTurn(r.detail)).filter((t): t is TurnUsage => t !== null)
  if (!turns.length) return null
  return { ...sumUsage(turns), turns: turns.length }
}

/** The keys runs.ts merges into AgentRun.output. costUsd is rounded to a tenth of a cent. */
export function costFields(u: (TurnUsage & { turns: number }) | null): Record<string, unknown> {
  if (!u) return {}
  const { costUsd, ...tokens } = u
  return { ...(costUsd === null ? {} : { costUsd: Math.round(costUsd * 1000) / 1000 }), usage: tokens }
}

export type AgentSpend = { agent: string; todayUsd: number; monthUsd: number; runsMonth: number }

/**
 * Model spend per HQ agent, today and this calendar month in Detroit time, summed
 * from the usage events. One query; the 32-day bound uses the createdAt index.
 */
export async function spendByAgent(): Promise<AgentSpend[]> {
  const rows = await db.$queryRaw<{ agent: string; today: number | null; month: number | null; runs: bigint }[]>(Prisma.sql`
    SELECT r.agent AS agent,
      SUM(CASE WHEN ((e."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Detroit')::date = (now() AT TIME ZONE 'America/Detroit')::date
        THEN COALESCE((e.detail->>'costUsd')::float8, 0) ELSE 0 END) AS today,
      SUM(COALESCE((e.detail->>'costUsd')::float8, 0)) AS month,
      COUNT(DISTINCT e."runId") AS runs
    FROM "AgentEvent" e
    JOIN "AgentRun" r ON r.id = e."runId"
    WHERE e.kind = 'usage'
      AND e."createdAt" >= now() - interval '32 days'
      AND ((e."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Detroit') >= date_trunc('month', now() AT TIME ZONE 'America/Detroit')
      AND r.agent IS NOT NULL
    GROUP BY r.agent
  `)
  return rows.map((r) => ({ agent: r.agent, todayUsd: Number(r.today ?? 0), monthUsd: Number(r.month ?? 0), runsMonth: Number(r.runs) }))
}
