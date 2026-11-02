// ===========================================
// Ops HQ: the Research desk's tools (all read only on Google Ads)
// ===========================================
// The desk writes one campaign brief for one client. Every Google call goes
// through the three read helpers at the bottom of ads-tools.ts (researchSearch,
// researchKeywordIdeas, researchSuggestGeo): a GAQL SELECT, keyword ideas, geo
// suggestions. Nothing here can change an account, and the no-write check in
// lib/ops/ads-research.test.ts reads this file to keep it that way.
//
// Accounts: the client's own and its trade siblings', i.e. accounts bound to a
// board client (adsClients), never a never-touch one. Each call counts against
// the run's cap (RESEARCH_MAX_CALLS, 60); a failing account returns an error
// to the model and the run goes on with the rest.
//
// The one write is save_brief: an AdsBrief row plus one OpsActivity note.

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { PLAYBOOK_NEGATIVES, parseBrief } from '@/lib/ops/ads-research'
import { getFileContent } from '@/lib/ops/github'
import { readIntake } from '@/lib/ops/intake'
import { clientTradeKey, tradeLabel } from '@/lib/ops/trades'
import { enumName, isNeverTouch, microsToUsd, researchKeywordIdeas, researchSearch, researchSuggestGeo, type AdsToolContext } from './ads-tools'
import { enums } from 'google-ads-api'
import { oneLine } from './events'
import type { ClientTool, JsonSchema } from './loop'

export type ResearchContext = {
  runId: string
  engagementId: string
  client: string
  /** The client's own Google Ads account, or '' when it has none yet. */
  customerId: string
  /** Every account the desk may read: customer id → account (board client) name. */
  accounts: Map<string, string>
  /** The Google Ads plumbing shared with the ads specialist; maxCalls is RESEARCH_MAX_CALLS. */
  ads: AdsToolContext
  briefId: string | null
  /** parseBrief failures so far: the second one ends the run. */
  saveFailures: number
  lastProblems: string[]
}

type Def = { name: string; description: string; input_schema: JsonSchema; run: (ctx: ResearchContext, input: Record<string, any>) => Promise<{ result: unknown; label: string | null }> }

const num = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100)
const usd = (v: unknown) => microsToUsd(v) ?? 0
const clean = (v: unknown) => String(v ?? '').replace(/-/g, '').trim()

/** The 30 or 90 days ending yesterday (UTC). */
function window(days: unknown): { start: string; end: string; days: 30 | 90 } {
  const d = Number(days) === 90 ? 90 : 30
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (d - 1))
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days: d }
}

/** The account a call names, checked against the desk's allowlist. */
function account(ctx: ResearchContext, customerId: unknown): { id: string; name: string } {
  const id = clean(customerId)
  const name = ctx.accounts.get(id)
  if (!name) throw new Error(`${id || 'that id'} is not an ads account on the board; use the client's own id or one from trade_siblings`)
  if (isNeverTouch(name)) throw new Error(`${name} is on the never-touch list`)
  return { id, name }
}

const search = (ctx: ResearchContext, a: { id: string; name: string }, gaql: string) => researchSearch(ctx.ads, a.id, a.name, gaql)

const customerIdProp = { type: 'string', description: "A Google Ads customer id, digits only: the client's own, or a sibling's from trade_siblings." }
const daysProp = { type: 'number', description: '30 or 90 (default 30), ending yesterday.' }
const engagementProp = { type: 'string', description: "This run's client id." }

function sameClient(ctx: ResearchContext, id: unknown) {
  if (String(id ?? '') !== ctx.engagementId) throw new Error(`this run researches ${ctx.client} only (client ${ctx.engagementId})`)
}

/** The client's trade key, the same rule trade_siblings and the learnings job use. */
export async function engagementTradeKey(engagementId: string) {
  const e = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { displayName: true, trade: true, intake: true, business: { select: { businessType: true, servicesOffered: true } } },
  })
  if (!e) return { key: null, from: null }
  const intake = readIntake(e.intake)
  const offered = Array.isArray(e.business?.servicesOffered) ? (e.business!.servicesOffered as unknown[]).map(String) : []
  return clientTradeKey({ intakeTrade: intake.business?.trade, name: e.displayName, trade: e.trade, businessType: e.business?.businessType, services: [...(intake.services ?? []).map((s) => s.name), ...offered] })
}

const TOOLS: Def[] = [
  {
    name: 'get_client',
    description:
      "This client in full (the chief's view: contact, intake answers and summary, deliverables with evidence, decisions, recent activity), plus the ads deliverable's evidence, the platform's servicesOffered, the intake's services and Google profile (category, review count, rating, hours, address), the trade key, and the live site.config.ts from the website repo when there is one.",
    input_schema: { type: 'object', properties: { engagementId: engagementProp }, required: ['engagementId'] },
    run: async (ctx, i) => {
      sameClient(ctx, i.engagementId)
      const { clientDetail } = await import('./chief')
      const detail = await clientDetail(ctx.engagementId)
      const row = await db.engagement.findUnique({ where: { id: ctx.engagementId }, select: { intake: true, business: { select: { servicesOffered: true, businessType: true } } } })
      const intake = readIntake(row?.intake)
      const ads = detail.deliverables.find((d) => d.type === 'ads')
      const repo = detail.deliverables.find((d) => d.type === 'website')?.evidence?.repoUrl
      let siteConfig: { path: string; text: string } | { error: string } | null = null
      if (typeof repo === 'string' && repo) {
        try {
          const text = await getFileContent(repo, 'site.config.ts')
          siteConfig = text ? { path: 'site.config.ts', text: text.slice(0, 20000) } : { error: 'no site.config.ts on the default branch' }
        } catch (err) {
          siteConfig = { error: err instanceof Error ? err.message : String(err) }
        }
      }
      const g = intake.gbp
      const trade = await engagementTradeKey(ctx.engagementId)
      return {
        result: {
          ...detail,
          trade: { key: trade.key, label: trade.key ? tradeLabel(trade.key) : null, from: trade.from },
          adsEvidence: ads?.evidence ?? null,
          servicesOffered: row?.business?.servicesOffered ?? null,
          intakeServices: intake.services ?? [],
          gbp: g
            ? { name: g.name ?? null, category: g.primaryType ?? null, reviewCount: g.userRatingCount ?? g.reviewCount ?? null, rating: g.rating ?? null, hours: g.hours ?? null, address: g.address ?? null, lookedUpAt: g.lookedUpAt ?? null }
            : null,
          answeringHours: intake.business?.hours ?? null,
          serviceArea: intake.business?.serviceArea ?? [],
          priorityArea: intake.business?.priorityArea ?? null,
          maxDistance: intake.business?.maxDistance ?? null,
          budgetMonthly: intake.ads?.budgetMonthly ?? null,
          exclusions: intake.ads?.exclusions ?? [],
          siteConfig,
        },
        label: `Read ${ctx.client}${trade.key ? ` (${tradeLabel(trade.key)})` : ''}${siteConfig && 'text' in siteConfig ? ', with site.config.ts' : ''}`,
      }
    },
  },
  {
    name: 'trade_siblings',
    description:
      "Other board clients in this client's trade that run Google Ads (ads in services, a customer id, not never-touch): name, customerId, metro, monthsLive (months since the first day with spend in the platform's synced data), the ads step. Reads the board only, no Google call.",
    input_schema: { type: 'object', properties: { engagementId: engagementProp }, required: ['engagementId'] },
    run: async (ctx, i) => {
      sameClient(ctx, i.engagementId)
      const mine = await engagementTradeKey(ctx.engagementId)
      if (!mine.key) return { result: { tradeKey: null, siblings: [], note: 'The client names no trade on the board, so no siblings can be matched.' }, label: `${ctx.client} names no trade; no siblings` }
      const rows = await db.engagement.findMany({
        where: { id: { not: ctx.engagementId }, stage: { notIn: ['ignored'] } },
        select: {
          id: true,
          displayName: true,
          trade: true,
          location: true,
          services: true,
          intake: true,
          business: { select: { id: true, businessType: true, servicesOffered: true, googleAdsCustomerId: true } },
          deliverables: { where: { type: 'ads' }, select: { step: true, evidence: true } },
        },
      })
      const siblings: { name: string; customerId: string; metro: string | null; monthsLive: number | null; step: string | null; businessId: string | null }[] = []
      for (const r of rows) {
        const ev = r.deliverables[0]?.evidence as Record<string, unknown> | null
        const id = clean(r.business?.googleAdsCustomerId ?? (typeof ev?.adsCustomerId === 'string' ? ev.adsCustomerId : ''))
        if (!id || !Array.isArray(r.services) || !(r.services as string[]).includes('ads') || isNeverTouch(r.displayName)) continue
        const intake = readIntake(r.intake)
        const offered = Array.isArray(r.business?.servicesOffered) ? (r.business!.servicesOffered as unknown[]).map(String) : []
        const key = clientTradeKey({ intakeTrade: intake.business?.trade, name: r.displayName, trade: r.trade, businessType: r.business?.businessType, services: [...(intake.services ?? []).map((s) => s.name), ...offered] }).key
        if (key !== mine.key) continue
        siblings.push({
          name: r.displayName.trim(),
          customerId: id,
          metro: r.location ?? intake.business?.priorityArea ?? intake.business?.serviceArea?.[0] ?? intake.gbp?.address ?? null,
          monthsLive: null,
          step: r.deliverables[0]?.step ?? null,
          businessId: r.business?.id ?? null,
        })
      }
      const ids = siblings.map((s) => s.businessId).filter((x): x is string => Boolean(x))
      const first = ids.length
        ? await db.googleAdsSnapshot.groupBy({ by: ['businessId'], where: { businessId: { in: ids }, cost: { gt: 0 } }, _min: { date: true } })
        : []
      const since = new Map(first.map((f) => [f.businessId, f._min.date]))
      for (const s of siblings) {
        const d = s.businessId ? since.get(s.businessId) : null
        if (d) s.monthsLive = Math.max(0, Math.round(((Date.now() - d.getTime()) / (30.4 * 86_400_000)) * 10) / 10)
      }
      return {
        result: { tradeKey: mine.key, trade: tradeLabel(mine.key), matchedOn: mine.from, siblings: siblings.map(({ businessId: _b, ...s }) => s) },
        label: `${siblings.length} sibling${siblings.length === 1 ? '' : 's'} in ${tradeLabel(mine.key)}`,
      }
    },
  },
  {
    name: 'account_summary',
    description:
      'One account, campaign level, last 30 or 90 days: cost, clicks, conversions, cost per conversion, average CPC, search impression share, bidding strategy, daily budget, location option; plus its location, radius and ad schedule criteria. 2 Google calls.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, days: daysProp }, required: ['customerId'] },
    run: async (ctx, i) => {
      const a = account(ctx, i.customerId)
      const w = window(i.days)
      const rows = await search(
        ctx,
        a,
        `SELECT campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type, campaign.geo_target_type_setting.positive_geo_target_type,
                campaign_budget.amount_micros, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.average_cpc,
                metrics.cost_per_conversion, metrics.search_impression_share
         FROM campaign WHERE segments.date BETWEEN '${w.start}' AND '${w.end}' AND campaign.status != 'REMOVED'`
      )
      const criteria = await search(
        ctx,
        a,
        `SELECT campaign.id, campaign_criterion.type, campaign_criterion.negative, campaign_criterion.location.geo_target_constant,
                campaign_criterion.proximity.radius, campaign_criterion.proximity.radius_units, campaign_criterion.proximity.address.city_name,
                campaign_criterion.ad_schedule.day_of_week, campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.end_hour,
                campaign_criterion.bid_modifier
         FROM campaign_criterion WHERE campaign_criterion.type IN ('LOCATION', 'PROXIMITY', 'AD_SCHEDULE') AND campaign.status != 'REMOVED'`
      )
      const campaigns = rows.map((x) => {
        const id = String(x.campaign.id)
        const crit = criteria.filter((c) => String(c.campaign.id) === id)
        const type = (c: any) => enumName(enums.CriterionType, c.campaign_criterion.type)
        return {
          id,
          name: x.campaign.name,
          status: enumName(enums.CampaignStatus, x.campaign.status),
          bidding: enumName(enums.BiddingStrategyType, x.campaign.bidding_strategy_type),
          locationOption: enumName(enums.PositiveGeoTargetType, x.campaign.geo_target_type_setting?.positive_geo_target_type),
          dailyBudget: microsToUsd(x.campaign_budget?.amount_micros),
          cost: usd(x.metrics.cost_micros),
          clicks: Number(x.metrics.clicks ?? 0),
          impressions: Number(x.metrics.impressions ?? 0),
          conversions: num(x.metrics.conversions) ?? 0,
          avgCpc: microsToUsd(x.metrics.average_cpc),
          costPerConversion: microsToUsd(x.metrics.cost_per_conversion),
          searchImpressionShare: num(x.metrics.search_impression_share),
          locations: crit.filter((c) => type(c) === 'LOCATION').map((c) => ({ geoTarget: c.campaign_criterion.location?.geo_target_constant ?? null, excluded: Boolean(c.campaign_criterion.negative) })),
          radius: crit
            .filter((c) => type(c) === 'PROXIMITY')
            .map((c) => ({ radius: num(c.campaign_criterion.proximity?.radius), units: enumName(enums.ProximityRadiusUnits, c.campaign_criterion.proximity?.radius_units), city: c.campaign_criterion.proximity?.address?.city_name ?? null })),
          schedule: crit
            .filter((c) => type(c) === 'AD_SCHEDULE')
            .map((c) => ({ day: enumName(enums.DayOfWeek, c.campaign_criterion.ad_schedule?.day_of_week), startHour: c.campaign_criterion.ad_schedule?.start_hour ?? null, endHour: c.campaign_criterion.ad_schedule?.end_hour ?? null, bidModifier: num(c.campaign_criterion.bid_modifier) })),
        }
      })
      const cost = campaigns.reduce((n, c) => n + c.cost, 0)
      return { result: { account: a.name, customerId: a.id, from: w.start, to: w.end, campaigns }, label: `${a.name}, ${w.days} days: $${cost.toFixed(2)} across ${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}` }
    },
  },
  {
    name: 'account_search_terms',
    description:
      'Search terms on one account over 30 or 90 days, summed per term: converting (1 or more conversions, up to 100) and wasted (cost at or above minCost with no conversion, up to 100). 2 Google calls.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, days: daysProp, minCost: { type: 'number', description: 'Dollars a term must cost to count as wasted. Default 10.' } }, required: ['customerId'] },
    run: async (ctx, i) => {
      const a = account(ctx, i.customerId)
      const w = window(i.days)
      const min = Math.max(Number(i.minCost ?? 10) || 0, 0)
      const base = `SELECT search_term_view.search_term, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date BETWEEN '${w.start}' AND '${w.end}'`
      const [conv, waste] = [
        await search(ctx, a, `${base} AND metrics.conversions > 0 ORDER BY metrics.conversions DESC LIMIT 200`),
        await search(ctx, a, `${base} AND metrics.conversions = 0 AND metrics.cost_micros > ${Math.max(Math.round(min * 1_000_000) - 1, -1)} ORDER BY metrics.cost_micros DESC LIMIT 200`),
      ]
      const sum = (rows: any[]) => {
        const m = new Map<string, { term: string; clicks: number; cost: number; conversions: number }>()
        for (const x of rows) {
          const term = String(x.search_term_view.search_term ?? '').toLowerCase()
          const cur = m.get(term) ?? { term, clicks: 0, cost: 0, conversions: 0 }
          cur.clicks += Number(x.metrics.clicks ?? 0)
          cur.cost = Math.round((cur.cost + usd(x.metrics.cost_micros)) * 100) / 100
          cur.conversions = Math.round((cur.conversions + Number(x.metrics.conversions ?? 0)) * 100) / 100
          m.set(term, cur)
        }
        return Array.from(m.values())
      }
      const converting = sum(conv).sort((x, y) => y.conversions - x.conversions).slice(0, 100)
      const wasted = sum(waste).filter((t) => t.cost >= min).sort((x, y) => y.cost - x.cost).slice(0, 100)
      return { result: { account: a.name, customerId: a.id, from: w.start, to: w.end, minCost: min, converting, wasted }, label: `${a.name}: ${converting.length} converting, ${wasted.length} wasted terms over ${w.days} days` }
    },
  },
  {
    name: 'account_keywords',
    description: 'Keywords on one account over 30 or 90 days (up to 200, highest cost first): text, match type, Quality Score where present, cost, clicks, conversions, average CPC. 1 Google call.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, days: daysProp }, required: ['customerId'] },
    run: async (ctx, i) => {
      const a = account(ctx, i.customerId)
      const w = window(i.days)
      const rows = await search(
        ctx,
        a,
        `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.quality_info.quality_score,
                metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.average_cpc
         FROM keyword_view WHERE segments.date BETWEEN '${w.start}' AND '${w.end}' AND ad_group_criterion.status != 'REMOVED'
         ORDER BY metrics.cost_micros DESC LIMIT 200`
      )
      const keywords = rows.map((x) => ({
        text: x.ad_group_criterion.keyword?.text ?? '',
        matchType: enumName(enums.KeywordMatchType, x.ad_group_criterion.keyword?.match_type),
        qualityScore: x.ad_group_criterion.quality_info?.quality_score ?? null,
        cost: usd(x.metrics.cost_micros),
        clicks: Number(x.metrics.clicks ?? 0),
        conversions: num(x.metrics.conversions) ?? 0,
        avgCpc: microsToUsd(x.metrics.average_cpc),
      }))
      return { result: { account: a.name, customerId: a.id, from: w.start, to: w.end, keywords }, label: `${a.name}: ${keywords.length} keywords over ${w.days} days` }
    },
  },
  {
    name: 'account_negatives',
    description: 'Negative keywords on one account: campaign level and ad group level, with match type. 2 Google calls.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp }, required: ['customerId'] },
    run: async (ctx, i) => {
      const a = account(ctx, i.customerId)
      const camp = await search(
        ctx,
        a,
        `SELECT campaign.name, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion
         WHERE campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD' AND campaign.status != 'REMOVED' LIMIT 1000`
      )
      const group = await search(
        ctx,
        a,
        `SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion
         WHERE ad_group_criterion.negative = TRUE AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED' LIMIT 1000`
      )
      const campaign = camp.map((x) => ({ campaign: x.campaign.name, term: x.campaign_criterion.keyword?.text ?? '', matchType: enumName(enums.KeywordMatchType, x.campaign_criterion.keyword?.match_type) }))
      const adGroup = group.map((x) => ({ campaign: x.campaign.name, adGroup: x.ad_group.name, term: x.ad_group_criterion.keyword?.text ?? '', matchType: enumName(enums.KeywordMatchType, x.ad_group_criterion.keyword?.match_type) }))
      return { result: { account: a.name, customerId: a.id, campaign, adGroup }, label: `${a.name}: ${campaign.length + adGroup.length} negatives` }
    },
  },
  {
    name: 'keyword_ideas',
    description:
      "Keyword Planner ideas with historical metrics for the client's area: average monthly searches, competition, low and high top-of-page bid. Location names (towns, counties, a state) are resolved to geo targets first. Runs under the client's own account, or the manager when it has none. 2 Google calls. When Google refuses (developer token access), it returns plannerUnavailable with the reason instead of failing: say volumes were unavailable in the brief.",
    input_schema: {
      type: 'object',
      properties: {
        seeds: { type: 'array', items: { type: 'string' }, description: 'Up to 20 seed terms, e.g. the money-maker services as customers search them.' },
        locations: { type: 'array', items: { type: 'string' }, description: 'Up to 10 place names, e.g. ["Katy, TX", "Fulshear, TX"].' },
        language: { type: 'string', description: 'Language constant id, default "1000" (English).' },
      },
      required: ['seeds', 'locations'],
    },
    run: async (ctx, i) => {
      const seeds = (i.seeds as unknown[]).map((s) => String(s).trim()).filter(Boolean).slice(0, 20)
      const names = (i.locations as unknown[]).map((s) => String(s).trim()).filter(Boolean).slice(0, 10)
      if (!seeds.length) throw new Error('give at least one seed')
      if (!names.length) throw new Error('give at least one location name')
      const under = ctx.customerId || process.env.GOOGLE_ADS_MCC_ID!.replace(/-/g, '')
      try {
        const geo = await researchSuggestGeo(ctx.ads, names)
        // Best match per name: the first suggestion Google gives for it.
        const picked = new Map<string, (typeof geo)[number]>()
        for (const g of geo) if (g.resourceName && !picked.has(g.query)) picked.set(g.query, g)
        const targets = Array.from(picked.values())
        if (!targets.length) return { result: { plannerUnavailable: false, geoTargets: [], ideas: [], note: 'Google found no geo target for those names; try "Town, ST" forms.' }, label: 'Keyword ideas: no geo target matched' }
        const ideas = await researchKeywordIdeas(ctx.ads, under, { seeds, geoTargets: targets.map((t) => t.resourceName), languageId: String(i.language ?? '1000') })
        return {
          result: { ranUnder: ctx.customerId ? 'client account' : 'manager account', geoTargets: targets.map((t) => ({ query: t.query, resourceName: t.resourceName, name: t.canonicalName || t.name, type: t.type })), ideas: ideas.sort((x, y) => (y.monthlyVolume ?? 0) - (x.monthlyVolume ?? 0)) },
          label: `Keyword ideas for ${ctx.client}: ${ideas.length} ideas in ${targets.length} place${targets.length === 1 ? '' : 's'}`,
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        // Not reachable at this token's access level, or refused for this account: the brief goes on without volumes.
        return { result: { plannerUnavailable: true, reason }, label: `Keyword Planner unavailable: ${oneLine(reason, 90)}` }
      }
    },
  },
  {
    name: 'read_learnings',
    description: 'The monthly per-trade learnings for one trade key (at most the last 3 months): per-account cost and conversions, converting and wasted terms summed across the trade, negatives in use, and the summary.',
    input_schema: { type: 'object', properties: { tradeKey: { type: 'string', description: 'From get_client or trade_siblings, e.g. "junk_removal".' } }, required: ['tradeKey'] },
    run: async (_ctx, i) => {
      const since = new Date()
      since.setUTCMonth(since.getUTCMonth() - 3)
      const rows = await db.adsTradeLearning.findMany({ where: { tradeKey: String(i.tradeKey), periodStart: { gte: since } }, orderBy: { periodStart: 'desc' }, take: 3 })
      return {
        result: {
          tradeKey: String(i.tradeKey),
          learnings: rows.map((r) => ({ id: r.id, periodStart: r.periodStart.toISOString().slice(0, 10), periodEnd: r.periodEnd.toISOString().slice(0, 10), accounts: r.accounts, convertingTerms: r.convertingTerms, wastedTerms: r.wastedTerms, negativesInUse: r.negativesInUse, summary: r.summary })),
        },
        label: `${rows.length} month${rows.length === 1 ? '' : 's'} of learnings for ${tradeLabel(String(i.tradeKey))}`,
      }
    },
  },
  {
    name: 'read_spec',
    description: 'Read a markdown spec Jacob wrote, from docs/ads-specs/ only (e.g. "cowboy-spray-foam-2026-10.md"). Returns its full text.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    run: async (_ctx, i) => {
      const { readSpec } = await import('./chief')
      const { rel, text } = await readSpec(String(i.path ?? '').trim())
      return { result: { path: rel, text }, label: `Read ${rel}` }
    },
  },
  {
    name: 'save_brief',
    description:
      'Save the finished brief on the client. body: the markdown Jacob reads, with the nine "## " sections in order. data: the same brief as JSON: terms[] { term, matchType EXACT|PHRASE|BROAD, monthlyVolume, bidLow, bidHigh, source }, negatives[] { term, source }, geo { cities[], radiusMiles, presence }, schedule { summary, source }, budget { dailyRecommended, monthly, basis }, siblings[] { customerId, name, convertingTerms[], cpc, costPerConv }. It is checked first; a brief that fails comes back with every problem, and a second failure ends the run.',
    input_schema: {
      type: 'object',
      properties: { engagementId: engagementProp, body: { type: 'string', description: 'The brief in markdown.' }, data: { type: 'object', description: 'The brief as JSON, shape above.' } },
      required: ['engagementId', 'body', 'data'],
    },
    run: async (ctx, i) => {
      sameClient(ctx, i.engagementId)
      if (ctx.briefId) throw new Error(`this run already saved brief ${ctx.briefId}; stop now`)
      if (ctx.saveFailures >= 2) throw new Error('the brief already failed twice; stop now and say why')
      const parsed = parseBrief(i.body, i.data)
      if (!parsed.ok) {
        ctx.saveFailures++
        ctx.lastProblems = parsed.problems
        const tail = ctx.saveFailures >= 2 ? 'This was the last try: stop now and say in one line why the brief failed.' : 'Fix every one and call save_brief once more; that is the last try.'
        throw new Error(`the brief was not saved:\n${parsed.problems.map((p) => `- ${p}`).join('\n')}\n${tail}`)
      }
      const trade = await engagementTradeKey(ctx.engagementId)
      const brief = await db.adsBrief.create({
        data: { engagementId: ctx.engagementId, runId: ctx.runId, tradeKey: trade.key, body: parsed.body, data: parsed.data as unknown as Prisma.InputJsonObject },
      })
      ctx.briefId = brief.id
      const b = parsed.data.budget
      await db.opsActivity.create({
        data: { engagementId: ctx.engagementId, kind: 'note', body: `Research brief saved: ${parsed.data.terms.length} target terms, ${parsed.data.negatives.length} negatives, $${b.dailyRecommended}/day ($${b.monthly}/month) (brief ${brief.id})` },
      })
      return { result: { ok: true, briefId: brief.id }, label: `Saved the brief for ${ctx.client}: ${parsed.data.terms.length} terms, $${b.dailyRecommended}/day` }
    },
  },
]

/** Names of every research tool, for the no-write check. */
export const RESEARCH_TOOL_NAMES = TOOLS.map((t) => t.name)

export function researchTools(ctx: ResearchContext): ClientTool[] {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema, run: (input) => t.run(ctx, input) }))
}

export { PLAYBOOK_NEGATIVES }
