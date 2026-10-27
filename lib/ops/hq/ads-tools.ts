// ===========================================
// Ops HQ — Google Ads tools for the ads specialist
// ===========================================
// Client tools over the platform's own Google Ads API credentials (the
// google-ads-api client in lib/google-ads.ts). Every call takes customerId,
// must match the run's account, and logs in through GOOGLE_ADS_MCC_ID.
//
//   reads         both modes
//   work writes   the playbook's AUTO list (negatives, pause, goal exclusion,
//                 lowering an ad group bid, Presence, a PAUSED new campaign)
//   apply writes  apply mode only, and only the tool the approved proposal
//                 names (ctx.allow), called with exactly the approved args
//                 (ctx.approved): budget, enable, end date, any bid change,
//                 bidding strategy, location option, removing a criterion
//
// Every write goes through mutate(): validate_only when asked (always in a dry
// run), and the exact operations plus Google's response land in the feed as an
// AgentEvent. Env, read by name only: GOOGLE_ADS_DEVELOPER_TOKEN,
// GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN,
// GOOGLE_ADS_MCC_ID.

import { enums, type MutateOperation } from 'google-ads-api'
import { getGoogleAdsClient } from '@/lib/google-ads'
import { emit, oneLine } from './events'
import { validate, type ClientTool } from './loop'

const ENV = ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_MCC_ID'] as const

/** Names of the Google Ads env vars that are missing or empty. */
export function missingAdsEnv(): string[] {
  return ENV.filter((k) => !process.env[k]?.trim())
}

/** Google API calls one run may make (Explorer access allows 2,880 a day across everything). */
const MAX_CALLS = 150

export type AdsToolContext = {
  runId: string
  customerId: string
  client: string
  mode: 'work' | 'apply'
  /** Every write is sent validate_only: Google checks it and changes nothing. */
  dry: boolean
  /** Apply mode: the apply tools the approved proposal names. */
  allow?: string[]
  /** Apply mode: the approved call. A write must carry exactly these args. */
  approved?: { action: string; args: Record<string, unknown> }
  calls: number
  /** Every write tool call that reached Google, in order. */
  writes: { tool: string; changed: boolean }[]
}

// ── Plumbing ────────────────────────────────────────────────────────────────

function customer(ctx: AdsToolContext) {
  if (++ctx.calls > MAX_CALLS) throw new Error(`this run has used its ${MAX_CALLS} Google Ads calls; finish with what you have`)
  return getGoogleAdsClient().Customer({
    customer_id: ctx.customerId,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    login_customer_id: process.env.GOOGLE_ADS_MCC_ID,
  })
}

/** Google's error list as one readable line (GoogleAdsFailure carries errors[]). */
export function adsError(err: unknown): string {
  const errors = (err as { errors?: { message?: string; error_code?: Record<string, unknown>; trigger?: { string_value?: string } }[] })?.errors
  if (Array.isArray(errors) && errors.length) {
    return errors
      .map((e) => {
        const code = e.error_code ? Object.entries(e.error_code).map(([k, v]) => `${k}=${v}`).join(',') : ''
        const trigger = e.trigger?.string_value ? ` (trigger: ${e.trigger.string_value})` : ''
        return `${e.message ?? 'error'}${code ? ` [${code}]` : ''}${trigger}`
      })
      .join('; ')
  }
  return err instanceof Error ? err.message : String(err)
}

async function query(ctx: AdsToolContext, gaql: string): Promise<any[]> {
  try {
    return await customer(ctx).query(gaql)
  } catch (err) {
    throw new Error(`Google Ads query failed: ${adsError(err)}`)
  }
}

/** The one write path. Logs the exact operations and Google's response (or error) as an AgentEvent. */
async function mutate(ctx: AdsToolContext, what: string, operations: MutateOperation<any>[], validateOnly = false) {
  const check = validateOnly || ctx.dry
  const detail = { customerId: ctx.customerId, validateOnly: check, operations: plain(operations) }
  let response: unknown
  try {
    response = plain(await customer(ctx).mutateResources(operations, { validate_only: check }))
  } catch (err) {
    const message = adsError(err)
    await emit(ctx.runId, 'error', `${check ? 'Check' : 'Change'} failed: ${what}: ${message}`, { ...detail, error: message, raw: plain(err) })
    throw new Error(`Google rejected it: ${message}`)
  }
  await emit(ctx.runId, 'tool_result', `${check ? 'Checked, no change made' : 'Changed'}: ${what}`, { ...detail, response })
  const results = ((response as { mutate_operation_responses?: Record<string, { resource_name?: string }>[] })?.mutate_operation_responses ?? [])
    .map((r) => Object.values(r).find((v) => v?.resource_name)?.resource_name)
    .filter(Boolean)
  return { validateOnly: check, changed: !check, results }
}

function plain(v: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(v))
  } catch {
    return String(v)
  }
}

/** Enum number → name ("PAUSED"); strings pass through. */
function en(e: Record<string | number, string | number>, v: unknown): string | null {
  if (v === null || v === undefined) return null
  return typeof v === 'number' ? String(e[v] ?? v) : String(v)
}

const usd = (micros: unknown) => (micros === null || micros === undefined ? null : Math.round(Number(micros) / 10_000) / 100)
const micros = (dollars: number) => Math.round(dollars * 1_000_000)
const num = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100)
const digits = (v: unknown, field: string) => {
  const s = String(v ?? '').replace(/-/g, '')
  if (!/^\d+$/.test(s)) throw new Error(`${field} must be a numeric id`)
  return s
}

function range(days: unknown, max: number): { start: string; end: string; days: number } {
  const d = Math.min(Math.max(Math.round(Number(days) || 30), 1), max)
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (d - 1))
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days: d }
}

const res = (ctx: AdsToolContext, kind: string, id: string) => `customers/${ctx.customerId}/${kind}/${id}`

// ── Tool definitions ────────────────────────────────────────────────────────

type Def = Omit<ClientTool, 'run'> & { run: (ctx: AdsToolContext, input: Record<string, any>) => Promise<{ result: unknown; label: string | null }> }

const customerIdProp = { type: 'string', description: 'The Google Ads customer id of this run’s account, digits only.' }
const campaignIdProp = { type: 'string', description: 'Campaign id, digits only.' }
const validateOnlyProp = { type: 'boolean', description: 'true: Google checks the change and makes none. Use it to test before a real change.' }

const READS: Def[] = [
  {
    name: 'list_campaigns',
    description: 'Every campaign that is not removed: id, name, status, serving status, type, bidding strategy, daily budget, start and end.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp }, required: ['customerId'] },
    run: async (ctx) => {
      const rows = await query(
        ctx,
        `SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status, campaign.primary_status, campaign.advertising_channel_type,
                campaign.bidding_strategy_type, campaign.start_date_time, campaign.end_date_time, campaign_budget.amount_micros
         FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY campaign.id`
      )
      const campaigns = rows.map((r) => ({
        id: String(r.campaign.id),
        name: r.campaign.name,
        status: en(enums.CampaignStatus, r.campaign.status),
        servingStatus: en(enums.CampaignServingStatus, r.campaign.serving_status),
        primaryStatus: en(enums.CampaignPrimaryStatus, r.campaign.primary_status),
        type: en(enums.AdvertisingChannelType, r.campaign.advertising_channel_type),
        bidding: en(enums.BiddingStrategyType, r.campaign.bidding_strategy_type),
        dailyBudget: usd(r.campaign_budget?.amount_micros),
        start: r.campaign.start_date_time || null,
        end: r.campaign.end_date_time || null,
      }))
      return { result: { campaigns }, label: `${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'} on ${ctx.client}` }
    },
  },
  {
    name: 'campaign_performance',
    description: 'Per-campaign totals for the last N days (ending yesterday): impressions, clicks, cost, conversions, CTR, CPC, cost per conversion, search impression share and what lost it.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, days: { type: 'number', description: '1 to 365, default 30.' } }, required: ['customerId'] },
    run: async (ctx, i) => {
      const r = range(i.days, 365)
      const rows = await query(
        ctx,
        `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.all_conversions,
                metrics.ctr, metrics.average_cpc, metrics.cost_per_conversion, metrics.search_impression_share,
                metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share
         FROM campaign WHERE segments.date BETWEEN '${r.start}' AND '${r.end}' AND campaign.status != 'REMOVED'`
      )
      const campaigns = rows.map((x) => ({
        id: String(x.campaign.id),
        name: x.campaign.name,
        status: en(enums.CampaignStatus, x.campaign.status),
        impressions: Number(x.metrics.impressions ?? 0),
        clicks: Number(x.metrics.clicks ?? 0),
        cost: usd(x.metrics.cost_micros) ?? 0,
        conversions: num(x.metrics.conversions) ?? 0,
        allConversions: num(x.metrics.all_conversions) ?? 0,
        ctr: num(Number(x.metrics.ctr ?? 0) * 100),
        avgCpc: usd(x.metrics.average_cpc),
        costPerConversion: usd(x.metrics.cost_per_conversion),
        searchImpressionShare: num(x.metrics.search_impression_share),
        lostToBudget: num(x.metrics.search_budget_lost_impression_share),
        lostToRank: num(x.metrics.search_rank_lost_impression_share),
      }))
      const cost = campaigns.reduce((s, c) => s + c.cost, 0)
      return { result: { from: r.start, to: r.end, campaigns }, label: `${r.days} days on ${ctx.client}: $${cost.toFixed(2)} spent across ${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}` }
    },
  },
  {
    name: 'search_terms',
    description: 'Search terms that triggered ads in the last N days, highest cost first (up to 200): term, campaign, ad group, whether already added or excluded, impressions, clicks, cost, conversions.',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        days: { type: 'number', description: '1 to 90, default 30.' },
        minCost: { type: 'number', description: 'Only terms that cost at least this many dollars. Default 0 (every term with an impression).' },
        campaignId: { type: 'string', description: 'Optional: one campaign only.' },
      },
      required: ['customerId'],
    },
    run: async (ctx, i) => {
      const r = range(i.days, 90)
      const min = Math.max(Number(i.minCost) || 0, 0)
      const camp = i.campaignId ? ` AND campaign.id = ${digits(i.campaignId, 'campaignId')}` : ''
      const rows = await query(
        ctx,
        `SELECT search_term_view.search_term, search_term_view.status, segments.search_term_match_type, campaign.id, campaign.name, ad_group.id, ad_group.name,
                metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
         FROM search_term_view
         WHERE segments.date BETWEEN '${r.start}' AND '${r.end}' AND metrics.impressions > 0${min > 0 ? ` AND metrics.cost_micros >= ${micros(min)}` : ''}${camp}
         ORDER BY metrics.cost_micros DESC LIMIT 200`
      )
      const terms = rows.map((x) => ({
        term: x.search_term_view.search_term,
        status: en(enums.SearchTermTargetingStatus, x.search_term_view.status),
        matchedAs: en(enums.SearchTermMatchType, x.segments?.search_term_match_type),
        campaignId: String(x.campaign.id),
        campaign: x.campaign.name,
        adGroupId: String(x.ad_group.id),
        adGroup: x.ad_group.name,
        impressions: Number(x.metrics.impressions ?? 0),
        clicks: Number(x.metrics.clicks ?? 0),
        cost: usd(x.metrics.cost_micros) ?? 0,
        conversions: num(x.metrics.conversions) ?? 0,
      }))
      return { result: { from: r.start, to: r.end, terms }, label: `${terms.length} search term${terms.length === 1 ? '' : 's'} over ${r.days} days on ${ctx.client}` }
    },
  },
  {
    name: 'keyword_performance',
    description: 'Keywords that are not removed, with match type, status, bid, Quality Score and the last N days of metrics (up to 300).',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, days: { type: 'number', description: '1 to 365, default 30.' } }, required: ['customerId'] },
    run: async (ctx, i) => {
      const r = range(i.days, 365)
      const rows = await query(
        ctx,
        `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
                ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.cpc_bid_micros,
                ad_group_criterion.effective_cpc_bid_micros, ad_group_criterion.quality_info.quality_score,
                metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
         FROM keyword_view
         WHERE segments.date BETWEEN '${r.start}' AND '${r.end}' AND ad_group_criterion.status != 'REMOVED'
         ORDER BY metrics.cost_micros DESC LIMIT 300`
      )
      const keywords = rows.map((x) => ({
        campaignId: String(x.campaign.id),
        campaign: x.campaign.name,
        adGroupId: String(x.ad_group.id),
        adGroup: x.ad_group.name,
        criterionId: String(x.ad_group_criterion.criterion_id),
        text: x.ad_group_criterion.keyword?.text,
        matchType: en(enums.KeywordMatchType, x.ad_group_criterion.keyword?.match_type),
        status: en(enums.AdGroupCriterionStatus, x.ad_group_criterion.status),
        bid: usd(x.ad_group_criterion.cpc_bid_micros),
        effectiveBid: usd(x.ad_group_criterion.effective_cpc_bid_micros),
        qualityScore: x.ad_group_criterion.quality_info?.quality_score ?? null,
        impressions: Number(x.metrics.impressions ?? 0),
        clicks: Number(x.metrics.clicks ?? 0),
        cost: usd(x.metrics.cost_micros) ?? 0,
        conversions: num(x.metrics.conversions) ?? 0,
      }))
      return { result: { from: r.start, to: r.end, keywords }, label: `${keywords.length} keyword${keywords.length === 1 ? '' : 's'} on ${ctx.client}` }
    },
  },
  {
    name: 'conversion_actions_and_goals',
    description:
      'Conversion actions (category, type, origin, status, primary or secondary, counted in Conversions), the account-level goals and whether each is used for bidding, and conversions per action over the last 30 days.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp }, required: ['customerId'] },
    run: async (ctx) => {
      const actions = await query(
        ctx,
        `SELECT conversion_action.id, conversion_action.name, conversion_action.category, conversion_action.type, conversion_action.origin,
                conversion_action.status, conversion_action.primary_for_goal, conversion_action.include_in_conversions_metric
         FROM conversion_action WHERE conversion_action.status != 'REMOVED'`
      )
      const goals = await query(ctx, `SELECT customer_conversion_goal.category, customer_conversion_goal.origin, customer_conversion_goal.biddable FROM customer_conversion_goal`)
      const counts = await query(
        ctx,
        `SELECT segments.conversion_action_name, metrics.conversions, metrics.all_conversions FROM customer WHERE segments.date DURING LAST_30_DAYS`
      )
      const result = {
        actions: actions.map((x) => ({
          id: String(x.conversion_action.id),
          name: x.conversion_action.name,
          category: en(enums.ConversionActionCategory, x.conversion_action.category),
          type: en(enums.ConversionActionType, x.conversion_action.type),
          origin: en(enums.ConversionOrigin, x.conversion_action.origin),
          status: en(enums.ConversionActionStatus, x.conversion_action.status),
          primary: Boolean(x.conversion_action.primary_for_goal),
          inConversions: Boolean(x.conversion_action.include_in_conversions_metric),
        })),
        accountGoals: goals.map((x) => ({
          category: en(enums.ConversionActionCategory, x.customer_conversion_goal.category),
          origin: en(enums.ConversionOrigin, x.customer_conversion_goal.origin),
          biddable: Boolean(x.customer_conversion_goal.biddable),
        })),
        last30Days: counts.map((x) => ({ action: x.segments.conversion_action_name, conversions: num(x.metrics.conversions) ?? 0, allConversions: num(x.metrics.all_conversions) ?? 0 })),
      }
      const bidding = result.accountGoals.filter((g) => g.biddable).length
      return { result, label: `${result.actions.length} conversion action${result.actions.length === 1 ? '' : 's'}, ${bidding} goal${bidding === 1 ? '' : 's'} used for bidding on ${ctx.client}` }
    },
  },
  {
    name: 'campaign_settings',
    description:
      'Settings for one campaign or all: budget (and whether shared), bidding strategy and its limits, location option (Presence or Presence-or-interest), networks, start and end, targeted and excluded locations, ad groups with bids, and the campaign’s negative keywords.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, campaignId: { type: 'string', description: 'Optional: one campaign only.' } }, required: ['customerId'] },
    run: async (ctx, i) => {
      const only = i.campaignId ? ` AND campaign.id = ${digits(i.campaignId, 'campaignId')}` : ''
      const camps = await query(
        ctx,
        `SELECT campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type, campaign.manual_cpc.enhanced_cpc_enabled,
                campaign.target_spend.cpc_bid_ceiling_micros, campaign.maximize_conversions.target_cpa_micros, campaign.target_cpa.target_cpa_micros,
                campaign.geo_target_type_setting.positive_geo_target_type, campaign.geo_target_type_setting.negative_geo_target_type,
                campaign.network_settings.target_google_search, campaign.network_settings.target_search_network,
                campaign.network_settings.target_content_network, campaign.network_settings.target_partner_search_network,
                campaign.start_date_time, campaign.end_date_time, campaign_budget.amount_micros, campaign_budget.explicitly_shared, campaign_budget.reference_count
         FROM campaign WHERE campaign.status != 'REMOVED'${only}`
      )
      const crit = await query(
        ctx,
        `SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.type, campaign_criterion.negative, campaign_criterion.location.geo_target_constant,
                campaign_criterion.proximity.radius, campaign_criterion.proximity.radius_units, campaign_criterion.proximity.address.city_name,
                campaign_criterion.keyword.text, campaign_criterion.keyword.match_type
         FROM campaign_criterion
         WHERE campaign_criterion.type IN ('LOCATION', 'PROXIMITY', 'KEYWORD') AND campaign.status != 'REMOVED'${only}`
      )
      const groups = await query(
        ctx,
        `SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros FROM ad_group WHERE ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'${only}`
      )
      const geoIds = Array.from(new Set(crit.map((c) => c.campaign_criterion.location?.geo_target_constant).filter(Boolean))) as string[]
      const geoNames = new Map<string, string>()
      if (geoIds.length) {
        const geos = await query(
          ctx,
          `SELECT geo_target_constant.resource_name, geo_target_constant.canonical_name FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${geoIds.map((g) => `'${g}'`).join(', ')})`
        )
        for (const g of geos) geoNames.set(g.geo_target_constant.resource_name, g.geo_target_constant.canonical_name)
      }
      const campaigns = camps.map((x) => {
        const id = String(x.campaign.id)
        const mine = crit.filter((c) => String(c.campaign.id) === id)
        const type = (c: any) => en(enums.CriterionType, c.campaign_criterion.type)
        return {
          id,
          name: x.campaign.name,
          status: en(enums.CampaignStatus, x.campaign.status),
          dailyBudget: usd(x.campaign_budget?.amount_micros),
          budgetShared: Boolean(x.campaign_budget?.explicitly_shared) || Number(x.campaign_budget?.reference_count ?? 1) > 1,
          bidding: en(enums.BiddingStrategyType, x.campaign.bidding_strategy_type),
          cpcCeiling: usd(x.campaign.target_spend?.cpc_bid_ceiling_micros),
          targetCpa: usd(x.campaign.maximize_conversions?.target_cpa_micros ?? x.campaign.target_cpa?.target_cpa_micros),
          locationOption: en(enums.PositiveGeoTargetType, x.campaign.geo_target_type_setting?.positive_geo_target_type),
          exclusionOption: en(enums.NegativeGeoTargetType, x.campaign.geo_target_type_setting?.negative_geo_target_type),
          networks: {
            googleSearch: Boolean(x.campaign.network_settings?.target_google_search),
            searchPartners: Boolean(x.campaign.network_settings?.target_search_network),
            display: Boolean(x.campaign.network_settings?.target_content_network),
          },
          start: x.campaign.start_date_time || null,
          end: x.campaign.end_date_time || null,
          locations: mine
            .filter((c) => type(c) === 'LOCATION' || type(c) === 'PROXIMITY')
            .map((c) => ({
              criterionId: String(c.campaign_criterion.criterion_id),
              excluded: Boolean(c.campaign_criterion.negative),
              place:
                type(c) === 'LOCATION'
                  ? geoNames.get(c.campaign_criterion.location.geo_target_constant) ?? c.campaign_criterion.location.geo_target_constant
                  : `${c.campaign_criterion.proximity?.radius} ${en(enums.ProximityRadiusUnits, c.campaign_criterion.proximity?.radius_units)?.toLowerCase()} around ${c.campaign_criterion.proximity?.address?.city_name ?? 'a point'}`,
            })),
          negativeKeywords: mine
            .filter((c) => type(c) === 'KEYWORD' && c.campaign_criterion.negative)
            .map((c) => `${c.campaign_criterion.keyword?.text} (${en(enums.KeywordMatchType, c.campaign_criterion.keyword?.match_type)})`),
          adGroups: groups
            .filter((g) => String(g.campaign.id) === id)
            .map((g) => ({ id: String(g.ad_group.id), name: g.ad_group.name, status: en(enums.AdGroupStatus, g.ad_group.status), cpcBid: usd(g.ad_group.cpc_bid_micros) })),
        }
      })
      return { result: { campaigns }, label: `Settings for ${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'} on ${ctx.client}` }
    },
  },
  {
    name: 'change_history',
    description: 'Changes made to the account in the last N days (up to 30; newest first, up to 200): when, who, what kind of thing, what changed.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, days: { type: 'number', description: '1 to 30, default 14.' } }, required: ['customerId'] },
    run: async (ctx, i) => {
      // Google refuses a start more than 30 days back, so 30 means the last 29 full days plus today.
      const d = Math.min(Math.max(Math.round(Number(i.days) || 14), 1), 30)
      const start = new Date(Date.now() - (d - 1) * 86_400_000).toISOString().slice(0, 10)
      const end = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
      const rows = await query(
        ctx,
        `SELECT change_event.change_date_time, change_event.change_resource_type, change_event.resource_change_operation, change_event.changed_fields,
                change_event.user_email, change_event.client_type, change_event.campaign
         FROM change_event
         WHERE change_event.change_date_time >= '${start}' AND change_event.change_date_time <= '${end}'
         ORDER BY change_event.change_date_time DESC LIMIT 200`
      )
      const changes = rows.map((x) => ({
        at: x.change_event.change_date_time,
        what: en(enums.ChangeEventResourceType, x.change_event.change_resource_type),
        operation: en(enums.ResourceChangeOperation, x.change_event.resource_change_operation),
        fields: x.change_event.changed_fields?.paths ?? x.change_event.changed_fields ?? null,
        by: x.change_event.user_email || null,
        via: en(enums.ChangeClientType, x.change_event.client_type),
        campaign: x.change_event.campaign || null,
      }))
      return { result: { days: d, changes }, label: `${changes.length} change${changes.length === 1 ? '' : 's'} in ${d} days on ${ctx.client}` }
    },
  },
]

/** Current ad group bid and its campaign, for the lower-only rule. */
async function adGroupBid(ctx: AdsToolContext, adGroupId: string) {
  const rows = await query(ctx, `SELECT ad_group.id, ad_group.name, ad_group.cpc_bid_micros, campaign.id FROM ad_group WHERE ad_group.id = ${adGroupId}`)
  if (!rows.length) throw new Error(`no ad group ${adGroupId} on this account`)
  return { name: rows[0].ad_group.name as string, bidMicros: Number(rows[0].ad_group.cpc_bid_micros ?? 0) }
}

/** set_ad_group_cpc: only lowering in work mode; any change in apply mode. */
const SET_AD_GROUP_CPC: Def = {
  name: 'set_ad_group_cpc',
  description: 'Set an ad group’s default max CPC in dollars. In a work run it must be lower than the current bid; raising a bid is a proposal.',
  input_schema: {
    type: 'object',
    properties: { customerId: customerIdProp, adGroupId: { type: 'string', description: 'Ad group id, digits only.' }, cpc: { type: 'number', description: 'New max CPC in dollars.' }, validateOnly: validateOnlyProp },
    required: ['customerId', 'adGroupId', 'cpc'],
  },
  run: async (ctx, i) => {
    const id = digits(i.adGroupId, 'adGroupId')
    if (!(i.cpc > 0)) throw new Error('cpc must be more than 0')
    const cur = await adGroupBid(ctx, id)
    const next = micros(i.cpc)
    if (ctx.mode === 'work' && !(cur.bidMicros > 0 && next < cur.bidMicros)) {
      throw new Error(`a work run may only lower a bid; ${cur.name} is at $${usd(cur.bidMicros)}. Put a raise in proposals.`)
    }
    const what = `${cur.name} max CPC $${usd(cur.bidMicros)} to $${usd(next)}`
    const r = await mutate(ctx, what, [{ entity: 'ad_group', operation: 'update', resource: { resource_name: res(ctx, 'adGroups', id), cpc_bid_micros: next } }], i.validateOnly)
    return { result: { ...r, from: usd(cur.bidMicros), to: usd(next) }, label: null }
  },
}

/** set_location_option: an AUTO change in a work run, or an approved proposal in apply mode. */
const SET_LOCATION_OPTION: Def = {
  name: 'set_location_option',
  description: 'Set a campaign to show only to people in or regularly in its locations (Presence), instead of people interested in them.',
  input_schema: {
    type: 'object',
    properties: { customerId: customerIdProp, campaignId: campaignIdProp, option: { type: 'string', enum: ['PRESENCE'] }, validateOnly: validateOnlyProp },
    required: ['customerId', 'campaignId', 'option'],
  },
  run: async (ctx, i) => {
    const id = digits(i.campaignId, 'campaignId')
    const what = `campaign ${id} location option to Presence`
    const r = await mutate(
      ctx,
      what,
      [{ entity: 'campaign', operation: 'update', resource: { resource_name: res(ctx, 'campaigns', id), geo_target_type_setting: { positive_geo_target_type: enums.PositiveGeoTargetType.PRESENCE } } }],
      i.validateOnly
    )
    return { result: r, label: null }
  },
}

const WORK_WRITES: Def[] = [
  {
    name: 'add_campaign_negatives',
    description:
      'Add phrase-match negative keywords to one campaign. Block the junk, never a real buyer query for the client’s service. Skip phrases the campaign already has.',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        campaignId: campaignIdProp,
        phrases: { type: 'array', items: { type: 'string' }, description: 'Up to 50 phrases, lower case.' },
        validateOnly: validateOnlyProp,
      },
      required: ['customerId', 'campaignId', 'phrases'],
    },
    run: async (ctx, i) => {
      const campaignId = digits(i.campaignId, 'campaignId')
      const phrases = Array.from(new Set((i.phrases as unknown[]).map((p) => String(p).trim().toLowerCase()).filter(Boolean)))
      if (!phrases.length) throw new Error('phrases is empty')
      if (phrases.length > 50) throw new Error('at most 50 phrases per call')
      const ops = phrases.map((text) => ({
        entity: 'campaign_criterion' as const,
        operation: 'create' as const,
        resource: { campaign: res(ctx, 'campaigns', campaignId), negative: true, keyword: { text, match_type: enums.KeywordMatchType.PHRASE } },
      }))
      const what = `${phrases.length} negative${phrases.length === 1 ? '' : 's'} on campaign ${campaignId} (${oneLine(phrases.join(', '), 80)})`
      const r = await mutate(ctx, what, ops, i.validateOnly)
      return { result: { ...r, phrases }, label: null }
    },
  },
  {
    name: 'pause_campaign',
    description: 'Pause a campaign that is spending against the client’s wishes or with no way to measure results.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, campaignId: campaignIdProp, validateOnly: validateOnlyProp }, required: ['customerId', 'campaignId'] },
    run: async (ctx, i) => {
      const id = digits(i.campaignId, 'campaignId')
      const what = `pause campaign ${id}`
      const r = await mutate(ctx, what, [{ entity: 'campaign', operation: 'update', resource: { resource_name: res(ctx, 'campaigns', id), status: enums.CampaignStatus.PAUSED } }], i.validateOnly)
      return { result: r, label: null }
    },
  },
  {
    name: 'exclude_conversion_goal',
    description:
      'Stop an account-level conversion goal (category + origin, as conversion_actions_and_goals shows them) from being used for bidding, e.g. YouTube or page views. The actions still record.',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        category: { type: 'string', description: 'e.g. PAGE_VIEW, ENGAGEMENT, DEFAULT.' },
        origin: { type: 'string', description: 'e.g. WEBSITE, YOUTUBE_HOSTED, GOOGLE_HOSTED.' },
        validateOnly: validateOnlyProp,
      },
      required: ['customerId', 'category', 'origin'],
    },
    run: async (ctx, i) => {
      const category = String(i.category).toUpperCase()
      const origin = String(i.origin).toUpperCase()
      if (!(category in enums.ConversionActionCategory)) throw new Error(`unknown category ${category}`)
      if (!(origin in enums.ConversionOrigin)) throw new Error(`unknown origin ${origin}`)
      const what = `stop bidding on ${category} / ${origin} conversions`
      const r = await mutate(
        ctx,
        what,
        [{ entity: 'customer_conversion_goal', operation: 'update', resource: { resource_name: res(ctx, 'customerConversionGoals', `${category}~${origin}`), biddable: false } }],
        i.validateOnly
      )
      return { result: r, label: null }
    },
  },
  SET_AD_GROUP_CPC,
  SET_LOCATION_OPTION,
  {
    name: 'create_search_campaign',
    description:
      'Build a NEW Search campaign from a spec Jacob approved, always PAUSED: budget, bidding, locations (Presence), ad groups with keywords and one responsive search ad each, campaign negatives. All or nothing. Run it with validateOnly first.',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        spec: {
          type: 'object',
          description:
            '{ name, dailyBudget, bidding: "MANUAL_CPC" | "MAXIMIZE_CLICKS" | "MAXIMIZE_CONVERSIONS", cpcCeiling?, geoTargetConstantIds?: string[], radius?: {latitude, longitude, miles}, negatives?: string[], adGroups: [{ name, cpc, keywords: [{ text, matchType: "PHRASE" | "EXACT" | "BROAD" }], ad: { headlines: string[3-15], descriptions: string[2-4], finalUrl, path1?, path2? } }] }',
        },
        validateOnly: validateOnlyProp,
      },
      required: ['customerId', 'spec'],
    },
    run: async (ctx, i) => {
      const s = i.spec as Record<string, any>
      const fail = (m: string) => {
        throw new Error(`spec: ${m}`)
      }
      if (!s.name) fail('name is required')
      if (!(s.dailyBudget > 0)) fail('dailyBudget must be more than 0')
      if (!['MANUAL_CPC', 'MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS'].includes(s.bidding)) fail('bidding must be MANUAL_CPC, MAXIMIZE_CLICKS or MAXIMIZE_CONVERSIONS')
      const geos: string[] = (s.geoTargetConstantIds ?? []).map((g: unknown) => digits(g, 'geoTargetConstantIds'))
      if (!geos.length && !s.radius) fail('give geoTargetConstantIds or radius')
      if (!Array.isArray(s.adGroups) || !s.adGroups.length) fail('at least one ad group')

      const budget = res(ctx, 'campaignBudgets', '-1')
      const campaign = res(ctx, 'campaigns', '-2')
      const bidding =
        s.bidding === 'MANUAL_CPC'
          ? { manual_cpc: { enhanced_cpc_enabled: false } }
          : s.bidding === 'MAXIMIZE_CLICKS'
            ? { target_spend: s.cpcCeiling > 0 ? { cpc_bid_ceiling_micros: micros(s.cpcCeiling) } : {} }
            : { maximize_conversions: {} }
      const ops: MutateOperation<any>[] = [
        { entity: 'campaign_budget', operation: 'create', resource: { resource_name: budget, name: `${s.name} budget`, amount_micros: micros(s.dailyBudget), delivery_method: enums.BudgetDeliveryMethod.STANDARD, explicitly_shared: false } },
        {
          entity: 'campaign',
          operation: 'create',
          resource: {
            resource_name: campaign,
            name: s.name,
            status: enums.CampaignStatus.PAUSED,
            advertising_channel_type: enums.AdvertisingChannelType.SEARCH,
            campaign_budget: budget,
            ...bidding,
            network_settings: { target_google_search: true, target_search_network: false, target_content_network: false, target_partner_search_network: false },
            geo_target_type_setting: { positive_geo_target_type: enums.PositiveGeoTargetType.PRESENCE },
            contains_eu_political_advertising: enums.EuPoliticalAdvertisingStatus.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING,
          },
        },
        ...geos.map((g) => ({ entity: 'campaign_criterion' as const, operation: 'create' as const, resource: { campaign, location: { geo_target_constant: `geoTargetConstants/${g}` } } })),
        ...(s.radius
          ? [
              {
                entity: 'campaign_criterion' as const,
                operation: 'create' as const,
                resource: {
                  campaign,
                  proximity: {
                    geo_point: { latitude_in_micro_degrees: Math.round(s.radius.latitude * 1e6), longitude_in_micro_degrees: Math.round(s.radius.longitude * 1e6) },
                    radius: s.radius.miles,
                    radius_units: enums.ProximityRadiusUnits.MILES,
                  },
                },
              },
            ]
          : []),
        ...((s.negatives ?? []) as string[]).map((text) => ({
          entity: 'campaign_criterion' as const,
          operation: 'create' as const,
          resource: { campaign, negative: true, keyword: { text: String(text).toLowerCase(), match_type: enums.KeywordMatchType.PHRASE } },
        })),
      ]
      s.adGroups.forEach((g: Record<string, any>, n: number) => {
        const adGroup = res(ctx, 'adGroups', String(-3 - n))
        if (!g.name || !(g.cpc > 0)) fail(`ad group ${n + 1} needs a name and a cpc`)
        if (!g.ad?.finalUrl || (g.ad?.headlines ?? []).length < 3 || (g.ad?.descriptions ?? []).length < 2) fail(`ad group ${n + 1} needs an ad with a finalUrl, 3+ headlines and 2+ descriptions`)
        ops.push({ entity: 'ad_group', operation: 'create', resource: { resource_name: adGroup, name: g.name, campaign, status: enums.AdGroupStatus.ENABLED, type: enums.AdGroupType.SEARCH_STANDARD, cpc_bid_micros: micros(g.cpc) } })
        for (const k of g.keywords ?? []) {
          const mt = String(k.matchType ?? 'PHRASE').toUpperCase() as 'PHRASE' | 'EXACT' | 'BROAD'
          ops.push({ entity: 'ad_group_criterion', operation: 'create', resource: { ad_group: adGroup, status: enums.AdGroupCriterionStatus.ENABLED, keyword: { text: k.text, match_type: enums.KeywordMatchType[mt] } } })
        }
        ops.push({
          entity: 'ad_group_ad',
          operation: 'create',
          resource: {
            ad_group: adGroup,
            status: enums.AdGroupAdStatus.ENABLED,
            ad: {
              final_urls: [g.ad.finalUrl],
              responsive_search_ad: {
                headlines: g.ad.headlines.map((text: string) => ({ text })),
                descriptions: g.ad.descriptions.map((text: string) => ({ text })),
                ...(g.ad.path1 ? { path1: g.ad.path1 } : {}),
                ...(g.ad.path2 ? { path2: g.ad.path2 } : {}),
              },
            },
          },
        })
      })
      const what = `new PAUSED campaign "${s.name}" ($${s.dailyBudget}/day, ${s.adGroups.length} ad group${s.adGroups.length === 1 ? '' : 's'})`
      const r = await mutate(ctx, what, ops, i.validateOnly)
      return { result: r, label: null }
    },
  },
]

const APPLY_WRITES: Def[] = [
  {
    name: 'set_campaign_budget',
    description: 'Set a campaign’s daily budget in dollars. Refuses a shared budget.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, campaignId: campaignIdProp, dailyBudget: { type: 'number' }, validateOnly: validateOnlyProp }, required: ['customerId', 'campaignId', 'dailyBudget'] },
    run: async (ctx, i) => {
      const id = digits(i.campaignId, 'campaignId')
      if (!(i.dailyBudget > 0)) throw new Error('dailyBudget must be more than 0')
      const rows = await query(ctx, `SELECT campaign.campaign_budget, campaign_budget.amount_micros, campaign_budget.explicitly_shared, campaign_budget.reference_count FROM campaign WHERE campaign.id = ${id}`)
      if (!rows.length) throw new Error(`no campaign ${id} on this account`)
      const b = rows[0]
      if (b.campaign_budget.explicitly_shared || Number(b.campaign_budget.reference_count ?? 1) > 1) throw new Error('this budget is shared with other campaigns; change it in the UI')
      const what = `campaign ${id} budget $${usd(b.campaign_budget.amount_micros)} to $${i.dailyBudget}/day`
      const r = await mutate(ctx, what, [{ entity: 'campaign_budget', operation: 'update', resource: { resource_name: b.campaign.campaign_budget, amount_micros: micros(i.dailyBudget) } }], i.validateOnly)
      return { result: { ...r, from: usd(b.campaign_budget.amount_micros), to: i.dailyBudget }, label: null }
    },
  },
  {
    name: 'enable_campaign',
    description: 'Turn a paused campaign on.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, campaignId: campaignIdProp, validateOnly: validateOnlyProp }, required: ['customerId', 'campaignId'] },
    run: async (ctx, i) => {
      const id = digits(i.campaignId, 'campaignId')
      const r = await mutate(ctx, `enable campaign ${id}`, [{ entity: 'campaign', operation: 'update', resource: { resource_name: res(ctx, 'campaigns', id), status: enums.CampaignStatus.ENABLED } }], i.validateOnly)
      return { result: r, label: null }
    },
  },
  {
    name: 'set_campaign_end_date',
    description: 'Set the last day a campaign runs (YYYY-MM-DD, in the account’s time zone).',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, campaignId: campaignIdProp, endDate: { type: 'string' }, validateOnly: validateOnlyProp }, required: ['customerId', 'campaignId', 'endDate'] },
    run: async (ctx, i) => {
      const id = digits(i.campaignId, 'campaignId')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(i.endDate)) throw new Error('endDate must be YYYY-MM-DD')
      const what = `campaign ${id} end date to ${i.endDate}`
      const r = await mutate(ctx, what, [{ entity: 'campaign', operation: 'update', resource: { resource_name: res(ctx, 'campaigns', id), end_date_time: `${i.endDate} 23:59:59` } }], i.validateOnly)
      return { result: r, label: null }
    },
  },
  SET_AD_GROUP_CPC,
  SET_LOCATION_OPTION,
  {
    name: 'set_bidding_strategy',
    description: 'Switch a campaign’s bidding: MAXIMIZE_CLICKS with a max CPC ceiling, MANUAL_CPC, or MAXIMIZE_CONVERSIONS (optional target CPA).',
    input_schema: {
      type: 'object',
      properties: {
        customerId: customerIdProp,
        campaignId: campaignIdProp,
        strategy: { type: 'string', enum: ['MAXIMIZE_CLICKS', 'MANUAL_CPC', 'MAXIMIZE_CONVERSIONS'] },
        cpcCeiling: { type: 'number', description: 'Dollars. Required for MAXIMIZE_CLICKS.' },
        targetCpa: { type: 'number', description: 'Dollars. Optional for MAXIMIZE_CONVERSIONS.' },
        validateOnly: validateOnlyProp,
      },
      required: ['customerId', 'campaignId', 'strategy'],
    },
    run: async (ctx, i) => {
      const id = digits(i.campaignId, 'campaignId')
      let bidding: Record<string, unknown>
      if (i.strategy === 'MAXIMIZE_CLICKS') {
        if (!(i.cpcCeiling > 0)) throw new Error('MAXIMIZE_CLICKS needs cpcCeiling')
        bidding = { target_spend: { cpc_bid_ceiling_micros: micros(i.cpcCeiling) } }
      } else if (i.strategy === 'MANUAL_CPC') {
        bidding = { manual_cpc: { enhanced_cpc_enabled: false } }
      } else {
        bidding = { maximize_conversions: { target_cpa_micros: i.targetCpa > 0 ? micros(i.targetCpa) : 0 } }
      }
      const what = `campaign ${id} bidding to ${i.strategy}${i.cpcCeiling ? ` (max CPC $${i.cpcCeiling})` : ''}${i.targetCpa ? ` (target CPA $${i.targetCpa})` : ''}`
      const r = await mutate(ctx, what, [{ entity: 'campaign', operation: 'update', resource: { resource_name: res(ctx, 'campaigns', id), ...bidding } }], i.validateOnly)
      return { result: r, label: null }
    },
  },
  {
    name: 'remove_campaign_criterion',
    description: 'Remove one campaign criterion (a location, a negative keyword) by its criterion id from campaign_settings.',
    input_schema: { type: 'object', properties: { customerId: customerIdProp, campaignId: campaignIdProp, criterionId: { type: 'string' }, validateOnly: validateOnlyProp }, required: ['customerId', 'campaignId', 'criterionId'] },
    run: async (ctx, i) => {
      const id = digits(i.campaignId, 'campaignId')
      const crit = digits(i.criterionId, 'criterionId')
      const what = `remove criterion ${crit} from campaign ${id}`
      const r = await mutate(ctx, what, [{ entity: 'campaign_criterion', operation: 'remove', resource: res(ctx, 'campaignCriteria', `${id}~${crit}`) }], i.validateOnly)
      return { result: r, label: null }
    },
  },
]

export const ADS_READ_TOOLS = READS.map((t) => t.name)
export const ADS_WORK_TOOLS = WORK_WRITES.map((t) => t.name)
/** The tools a proposal's action may name: each one runs in apply mode after Jacob's Push. */
export const ADS_APPLY_TOOLS = APPLY_WRITES.map((t) => t.name)

/** A proposal's action and args, checked against the apply tool's schema (customerId is added at apply time). */
export function checkProposal(action: string, args: Record<string, unknown>): string | null {
  const tool = APPLY_WRITES.find((t) => t.name === action)
  if (!tool) return `action "${action}" is not one of ${ADS_APPLY_TOOLS.join(', ')}`
  if ('customerId' in args || 'validateOnly' in args) return 'args must not carry customerId or validateOnly'
  const schema = { ...tool.input_schema, required: (tool.input_schema.required ?? []).filter((k) => k !== 'customerId') }
  const invalid = validate(schema, args)
  return invalid ? `${action}: ${invalid}` : null
}

/** Same value for the apply lock: ids compare as digit strings, numbers by value. */
function sameArg(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b)
  return String(a ?? '').replace(/-/g, '').toUpperCase() === String(b ?? '').replace(/-/g, '').toUpperCase()
}

/** The tools for one run: reads plus the mode's writes (apply: only ctx.allow). Every call is locked to ctx.customerId. */
export function adsTools(ctx: AdsToolContext): ClientTool[] {
  const writes = ctx.mode === 'work' ? WORK_WRITES : APPLY_WRITES.filter((t) => ctx.allow?.includes(t.name))
  if (ctx.mode === 'apply' && !writes.length) throw new Error('apply mode needs the approved proposal’s tool in allow')
  const writeNames = new Set(writes.map((t) => t.name))
  return [...READS, ...writes].map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
    run: async (input) => {
      if (String(input.customerId ?? '').replace(/-/g, '') !== ctx.customerId) {
        throw new Error(`this run works only on ${ctx.client} (customer ${ctx.customerId})`)
      }
      const isWrite = writeNames.has(t.name)
      if (isWrite && ctx.mode === 'apply') {
        const ok = ctx.approved?.action === t.name
        const want = ctx.approved?.args ?? {}
        const extra = Object.keys(input).filter((k) => k !== 'customerId' && k !== 'validateOnly' && !(k in want))
        const differ = Object.keys(want).filter((k) => !sameArg(input[k], want[k]))
        if (!ok || extra.length || differ.length) {
          throw new Error(`apply mode makes only the approved call: ${ctx.approved?.action}(${JSON.stringify(want)})`)
        }
      }
      const out = await t.run(ctx, input)
      if (isWrite) ctx.writes.push({ tool: t.name, changed: Boolean((out.result as { changed?: boolean })?.changed) })
      return out
    },
  }))
}
