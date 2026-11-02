// ===========================================
// Ops HQ Research desk: the brief's shape and the learnings math
// ===========================================
// Pure and client-safe: no DB, no Google. The Research desk (lib/ops/hq/research.ts)
// writes one campaign brief per client; parseBrief checks it before save_brief
// stores it. The monthly learnings job (lib/ops/hq/learnings.ts) sums each trade's
// accounts with aggregateLearnings.

/** The brief's sections, in order. Each is required; an empty one says "none found". */
export const BRIEF_SECTIONS = [
  'Client facts',
  'Siblings in this trade',
  'Target keywords',
  'Negatives',
  'Geo',
  'Schedule',
  'Budget check',
  'Risks and unknowns',
  'Questions for Jacob',
] as const

/** Jacob's normal monthly ad budget for a new local client. */
export const BUDGET_NORM = { low: 300, high: 500 } as const
export const DAYS_PER_MONTH = 30.4

/** A brief younger than this is offered for reuse instead of a new research run. */
export const BRIEF_REUSE_DAYS = 14

/** Standing campaign negatives for every local service account (the playbook's trade junk). */
export const PLAYBOOK_NEGATIVES = ['jobs', 'job', 'hiring', 'careers', 'salary', 'diy', 'how to', 'for sale', 'rental', 'rent', 'free', 'course', 'training', 'school', 'youtube', 'reddit', 'used']

export const MATCH_TYPES = ['EXACT', 'PHRASE', 'BROAD'] as const
export type MatchType = (typeof MATCH_TYPES)[number]

export type BriefTerm = { term: string; matchType: MatchType; monthlyVolume: number | null; bidLow: number | null; bidHigh: number | null; source: string }
export type BriefNegative = { term: string; source: string }
export type BriefSibling = { customerId: string; name: string; convertingTerms: string[]; cpc: number | null; costPerConv: number | null }
export type BriefData = {
  terms: BriefTerm[]
  negatives: BriefNegative[]
  geo: { cities: string[]; radiusMiles: number | null; presence: boolean }
  schedule: { summary: string; source: string }
  budget: { dailyRecommended: number; monthly: number; basis: string }
  siblings: BriefSibling[]
}

const EM_DASH = /\u2014/

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const optNum = (v: unknown) => v === null || v === undefined || isNum(v)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** The body split on its "## " headings: heading → text under it. */
export function briefSections(body: string): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = []
  let cur: { heading: string; lines: string[] } | null = null
  for (const line of body.split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m) {
      if (cur) out.push({ heading: cur.heading, text: cur.lines.join('\n').trim() })
      cur = { heading: m[1], lines: [] }
    } else if (cur) cur.lines.push(line)
  }
  if (cur) out.push({ heading: cur.heading, text: cur.lines.join('\n').trim() })
  return out
}

/**
 * Check a brief before it is saved. Returns every problem (the model gets one
 * turn to fix them), or the cleaned data. Body: the nine sections in order,
 * none empty, Target keywords as a markdown table, no em dashes. Data: the
 * shape above, every term and negative with its source, monthly = daily x 30.4.
 */
export function parseBrief(body: unknown, data: unknown): { ok: true; body: string; data: BriefData } | { ok: false; problems: string[] } {
  const problems: string[] = []
  const text = str(body)
  if (!text) problems.push('body is empty')
  if (EM_DASH.test(text)) problems.push('body has em dashes; use commas or periods')

  const found = briefSections(text)
  const headings = found.map((s) => s.heading.toLowerCase())
  let at = -1
  for (const name of BRIEF_SECTIONS) {
    const i = headings.indexOf(name.toLowerCase())
    if (i === -1) {
      problems.push(`section "## ${name}" is missing`)
      continue
    }
    if (i < at) problems.push(`section "## ${name}" is out of order`)
    at = Math.max(at, i)
    if (!found[i].text) problems.push(`section "## ${name}" is empty; write "none found" if there is nothing`)
  }
  const kw = found.find((s) => s.heading.toLowerCase() === 'target keywords')
  if (kw && kw.text && !/none found/i.test(kw.text) && !/^\s*\|.*\|\s*$/m.test(kw.text)) problems.push('Target keywords must be a markdown table (term, match type, monthly volume, bid range, source)')

  const d = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>
  const arr = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]) : (problems.push(`data.${k} must be an array`), []))

  const terms: BriefTerm[] = []
  arr('terms').forEach((raw, n) => {
    const t = (raw ?? {}) as Record<string, unknown>
    const where = `data.terms[${n}]`
    const matchType = str(t.matchType).toUpperCase()
    if (!str(t.term)) problems.push(`${where}.term is empty`)
    if (!(MATCH_TYPES as readonly string[]).includes(matchType)) problems.push(`${where}.matchType must be EXACT, PHRASE or BROAD`)
    if (!optNum(t.monthlyVolume) || !optNum(t.bidLow) || !optNum(t.bidHigh)) problems.push(`${where}: monthlyVolume, bidLow and bidHigh are numbers or null`)
    if (!str(t.source)) problems.push(`${where}.source is empty: every term says where it came from`)
    terms.push({ term: str(t.term), matchType: matchType as MatchType, monthlyVolume: (t.monthlyVolume as number) ?? null, bidLow: (t.bidLow as number) ?? null, bidHigh: (t.bidHigh as number) ?? null, source: str(t.source) })
  })

  const negatives: BriefNegative[] = []
  arr('negatives').forEach((raw, n) => {
    const v = typeof raw === 'string' ? { term: raw } : ((raw ?? {}) as Record<string, unknown>)
    if (!str(v.term)) problems.push(`data.negatives[${n}].term is empty`)
    if (!str(v.source)) problems.push(`data.negatives[${n}].source is empty: say sibling <name> or playbook`)
    negatives.push({ term: str(v.term), source: str(v.source) })
  })

  const geo = (d.geo ?? {}) as Record<string, unknown>
  const cities = Array.isArray(geo.cities) ? geo.cities.map(str).filter(Boolean) : []
  if (!d.geo || typeof d.geo !== 'object') problems.push('data.geo is missing')
  else {
    if (!Array.isArray(geo.cities)) problems.push('data.geo.cities must be an array')
    if (!optNum(geo.radiusMiles)) problems.push('data.geo.radiusMiles is a number or null')
    if (typeof geo.presence !== 'boolean') problems.push('data.geo.presence must be true or false')
  }

  const sched = (d.schedule ?? {}) as Record<string, unknown>
  if (!str(sched.summary)) problems.push('data.schedule.summary is empty')
  if (!str(sched.source)) problems.push('data.schedule.source is empty')

  const budget = (d.budget ?? {}) as Record<string, unknown>
  if (!isNum(budget.dailyRecommended) || budget.dailyRecommended <= 0) problems.push('data.budget.dailyRecommended must be a positive number')
  if (!isNum(budget.monthly)) problems.push('data.budget.monthly must be a number')
  if (isNum(budget.dailyRecommended) && isNum(budget.monthly) && Math.abs(budget.monthly - monthlyFromDaily(budget.dailyRecommended)) > 1) {
    problems.push(`data.budget.monthly must be dailyRecommended x ${DAYS_PER_MONTH} (${monthlyFromDaily(budget.dailyRecommended)})`)
  }
  if (!str(budget.basis)) problems.push('data.budget.basis is empty: say what the number is based on')

  const siblings: BriefSibling[] = []
  arr('siblings').forEach((raw, n) => {
    const s = (raw ?? {}) as Record<string, unknown>
    if (!str(s.customerId) || !str(s.name)) problems.push(`data.siblings[${n}] needs customerId and name`)
    if (!Array.isArray(s.convertingTerms)) problems.push(`data.siblings[${n}].convertingTerms must be an array`)
    if (!optNum(s.cpc) || !optNum(s.costPerConv)) problems.push(`data.siblings[${n}]: cpc and costPerConv are numbers or null`)
    siblings.push({
      customerId: str(s.customerId).replace(/-/g, ''),
      name: str(s.name),
      convertingTerms: Array.isArray(s.convertingTerms) ? s.convertingTerms.map(str).filter(Boolean) : [],
      cpc: (s.cpc as number) ?? null,
      costPerConv: (s.costPerConv as number) ?? null,
    })
  })

  if (problems.length) return { ok: false, problems }
  return {
    ok: true,
    body: text,
    data: {
      terms,
      negatives,
      geo: { cities, radiusMiles: (geo.radiusMiles as number) ?? null, presence: geo.presence as boolean },
      schedule: { summary: str(sched.summary), source: str(sched.source) },
      budget: { dailyRecommended: budget.dailyRecommended as number, monthly: budget.monthly as number, basis: str(budget.basis) },
      siblings,
    },
  }
}

export const monthlyFromDaily = (daily: number) => Math.round(daily * DAYS_PER_MONTH * 100) / 100

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : Math.round(((v[mid - 1] + v[mid]) / 2) * 100) / 100
}

/** The budget check numbers: monthly, whether it sits in Jacob's norm, clicks a day at the median CPC. */
export function budgetCheck(daily: number, medianCpc: number | null) {
  const monthly = monthlyFromDaily(daily)
  return {
    daily,
    monthly,
    inNorm: monthly >= BUDGET_NORM.low && monthly <= BUDGET_NORM.high,
    clicksPerDay: medianCpc && medianCpc > 0 ? Math.round((daily / medianCpc) * 10) / 10 : null,
  }
}

// ── Monthly learnings ───────────────────────────────────────────────────────

export type LearningAccountInput = {
  customerId: string
  name: string
  campaigns: { cost: number; conversions: number; clicks: number }[]
  terms: { term: string; cost: number; conversions: number; clicks: number }[]
  negatives: string[]
}

export type LearningTerm = { term: string; conversions: number; cost: number; clicks: number; accounts: number }

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * One trade's month: per account cost, conversions, cost per conversion and
 * CPC; search terms summed across accounts (converting: at least 1 conversion;
 * wasted: cost at or above minWaste with none); negatives in use with how many
 * accounts carry each. Terms compare lowercase and trimmed.
 */
export function aggregateLearnings(inputs: LearningAccountInput[], opts: { minWaste?: number; maxTerms?: number } = {}) {
  const minWaste = opts.minWaste ?? 10
  const maxTerms = opts.maxTerms ?? 50
  const accounts = inputs.map((a) => {
    const cost = r2(a.campaigns.reduce((n, c) => n + c.cost, 0))
    const conversions = r2(a.campaigns.reduce((n, c) => n + c.conversions, 0))
    const clicks = a.campaigns.reduce((n, c) => n + c.clicks, 0)
    return { customerId: a.customerId, name: a.name, cost, conversions, costPerConv: conversions > 0 ? r2(cost / conversions) : null, cpc: clicks > 0 ? r2(cost / clicks) : null }
  })

  const terms = new Map<string, LearningTerm & { seen: Set<string> }>()
  for (const a of inputs) {
    for (const t of a.terms) {
      const key = t.term.trim().toLowerCase()
      if (!key) continue
      const cur = terms.get(key) ?? { term: key, conversions: 0, cost: 0, clicks: 0, accounts: 0, seen: new Set<string>() }
      cur.conversions += t.conversions
      cur.cost += t.cost
      cur.clicks += t.clicks
      cur.seen.add(a.customerId)
      terms.set(key, cur)
    }
  }
  const all = Array.from(terms.values()).map(({ seen, ...t }) => ({ ...t, conversions: r2(t.conversions), cost: r2(t.cost), accounts: seen.size }))
  const convertingTerms = all.filter((t) => t.conversions >= 1).sort((a, b) => b.conversions - a.conversions || a.cost - b.cost).slice(0, maxTerms)
  const wastedTerms = all.filter((t) => t.conversions === 0 && t.cost >= minWaste).sort((a, b) => b.cost - a.cost).slice(0, maxTerms)

  const negs = new Map<string, Set<string>>()
  for (const a of inputs) for (const n of a.negatives) {
    const key = n.trim().toLowerCase()
    if (!key) continue
    negs.set(key, (negs.get(key) ?? new Set()).add(a.customerId))
  }
  const negativesInUse = Array.from(negs, ([term, ids]) => ({ term, accounts: ids.size })).sort((a, b) => b.accounts - a.accounts || a.term.localeCompare(b.term)).slice(0, 100)

  const cost = r2(accounts.reduce((n, a) => n + a.cost, 0))
  const conversions = r2(accounts.reduce((n, a) => n + a.conversions, 0))
  const clicks = inputs.reduce((n, a) => n + a.campaigns.reduce((m, c) => m + c.clicks, 0), 0)
  return {
    accounts,
    convertingTerms,
    wastedTerms,
    negativesInUse,
    totals: { cost, conversions, clicks, costPerConv: conversions > 0 ? r2(cost / conversions) : null, cpc: clicks > 0 ? r2(cost / clicks) : null },
  }
}

/**
 * The learnings window: the 30 days ending yesterday (UTC). periodStart is that
 * first day at midnight, so a rerun on the same day replaces its rows.
 */
export function learningWindow(now: Date, days = 30): { start: Date; end: Date; startDay: string; endDay: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - (days - 1)))
  const day = (d: Date) => d.toISOString().slice(0, 10)
  return { start, end, startDay: day(start), endDay: day(end) }
}
