// ===========================================
// Weekly ads check-up (ADS_WEEKLY_CHECKUP, off by default): who, and how many
// ===========================================
// Pure. The cron (app/api/cron/ads-checkup) picks the accounts from here and
// starts the EXISTING ads specialist on each in check-up mode
// (lib/ops/hq/ads-tools.ts checkupTools: reads only, no write tool at all).
//
// Who: a client with ads in its services, a bound Google Ads customer id, the ads
// deliverable live or running, not ignored or churned, not on the never-touch list.
//
// How many: Explorer access allows 2,880 Google Ads operations a day across
// everything. Each specialist run is already capped at 150 calls
// (ads-tools.ts MAX_CALLS). A weekly pass budgets CHECKUP_OPS_BUDGET (1,200, well
// under half the day, leaving room for Jacob's own runs), so at most 8 accounts a
// pass, least recently checked first. The rest are skipped with a note and come
// first next week.

export function adsWeeklyCheckupEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ADS_WEEKLY_CHECKUP === 'true'
}

export const EXPLORER_DAILY_OPS = 2880
export const CALLS_PER_RUN = 150
export const CHECKUP_OPS_BUDGET = 1200
export const CHECKUP_MAX_ACCOUNTS = Math.floor(CHECKUP_OPS_BUDGET / CALLS_PER_RUN)

export const CHECKUP_INSTRUCTIONS = [
  'Weekly check-up of this account, last 7 days, compared with the 30 before. Read, then propose; change nothing.',
  '- Search terms: which ones cost money and cannot become a job for this client; propose them as campaign negatives (PHRASE).',
  '- Wasted spend: campaigns or ad groups spending with no conversions; say how much.',
  '- Conversion tracking: do the conversion actions still record conversions (conversion_actions_and_goals, campaign_performance)? Say plainly if nothing has recorded in 7 days.',
  '- Anything spending against a standing decision.',
  'In "expected", two or three plain lines for Jacob: what you found, and what each proposal would save or cost.',
].join('\n')

export type CheckupCandidate = {
  engagementId: string
  name: string
  stage: string
  services: string[]
  customerId: string | null
  adsStep: string | null
  adsStatus: string | null
  neverTouch: boolean
  /** When this client last had a check-up run, if ever. */
  lastCheckupAt: string | null
}

export type CheckupPlan = { run: CheckupCandidate[]; skipped: { candidate: CheckupCandidate; reason: string }[] }

export function planCheckup(rows: CheckupCandidate[], maxAccounts = CHECKUP_MAX_ACCOUNTS): CheckupPlan {
  const skipped: CheckupPlan['skipped'] = []
  const eligible: CheckupCandidate[] = []
  for (const c of rows) {
    if (c.stage === 'ignored' || c.stage === 'churned' || !c.services.includes('ads')) continue
    if (!c.customerId) continue
    if (c.neverTouch) {
      skipped.push({ candidate: c, reason: 'on the never-touch list' })
      continue
    }
    const live = c.adsStep === 'running' || c.adsStatus === 'live'
    if (!live) continue
    eligible.push(c)
  }
  eligible.sort((a, b) => (a.lastCheckupAt ? Date.parse(a.lastCheckupAt) : 0) - (b.lastCheckupAt ? Date.parse(b.lastCheckupAt) : 0) || a.name.localeCompare(b.name))
  const run = eligible.slice(0, maxAccounts)
  for (const c of eligible.slice(maxAccounts)) skipped.push({ candidate: c, reason: `over this week's budget (${maxAccounts} accounts, ${CHECKUP_OPS_BUDGET} Google Ads operations); first in line next week` })
  return { run, skipped }
}

/** The one note a check-up leaves on the client. */
export function checkupNote(expected: string | null | undefined, proposals: number, failed?: string | null): string {
  if (failed) return `Weekly ads check-up did not finish: ${failed}. Nothing was changed.`
  const found = (expected ?? '').replace(/\s+/g, ' ').trim().slice(0, 400) || 'nothing to report'
  return `Weekly ads check-up: ${found} ${proposals} proposal${proposals === 1 ? '' : 's'} filed for your Push. Nothing was changed.`
}
