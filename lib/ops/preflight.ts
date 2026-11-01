// ===========================================
// Ops HQ pre-flight (OPS_AUTOFLOW, off by default)
// ===========================================
// Before the chief starts a site_build, a site_update or an ads run, check what
// that run will need and refuse with ONE grouped list instead of starting it
// and stopping halfway (a half-provisioned repo, a callback that 401s, a
// campaign built with no call asset). Pure: lib/ops/preflight-server.ts reads
// the facts, the chief's tools call it only with the flag on.
//
// Every item is something the run really fails on, with where it fails:
//
//   web, both kinds
//     platform account     dispatch refuses without business_slug       lib/ops/agents/dispatch.ts:119
//     GITHUB_OPS_TOKEN     dispatch refuses; every GitHub call throws   dispatch.ts:120, lib/ops/github.ts:27
//     OPS_CALLBACK_SECRET  the build runs, then its callback 401s and   app/api/ops/build-callback/route.ts:22-25
//                          the run fails "callback never arrived"
//     aa-build workflow    a dispatch to a repo without it runs nothing dispatch.ts:124-126 (only when web
//                          checks recorded repoHasWorkflow false)
//   site_build
//     brief stored         refused                                      lib/ops/hq/web.ts:214
//     no repo yet: the build provisions first. Provisioning refuses without the first
//     two (listed here so the refusal comes in the same list), and stops halfway without
//     the Vercel pair (the repo exists, the Vercel project does not, and a retry is then
//     refused because the repo name is taken):
//       ANTHROPIC_API_KEY_BUILDS, OPS_CALLBACK_SECRET  refused   lib/ops/agents/shared.ts:56, provision.ts:50
//       the production deployment                      refused   shared.ts:68, provision.ts:43
//       VERCEL_API_TOKEN, VERCEL_TEAM_ID               halfway   lib/ops/vercel.ts:21-23
//   site_update
//     a repo               refused                                      web.ts:224
//     instructions         refused                                      web.ts:221
//   ads
//     GOOGLE_ADS_* (5)     the run is offline                           lib/ops/hq/ads.ts:172, ads-tools.ts:31
//     ANTHROPIC_API_KEY_BUILDS  the run is created, then its first      lib/ops/hq/anthropic.ts:57-58, :67
//                          model turn throws
//     never-touch client   refused                                      ads.ts:186
//
// Never blocked: anything from the client (Jacob's rule, M12: build with what is known,
// look up the public listing, ask at the end). Real photos: with none, the build runs
// without images (AA-Template rule 2e; stock stays his call, "with stock") and photos
// come back as a question (lib/ops/build-questions.ts). The call-asset phone for a spec
// build: the run builds the campaign and stops short of the call asset, and the enable
// gate holds the campaign on "no call asset".
//
// Deliberately NOT blocked, because the run handles it: no Google Ads customer id (a work
// run finds and binds the account), no stock photo keys (the build runs without stock),
// final URLs on vercel.app (swapped before any enable), billing and advertiser
// verification (UI-only, reported as ui_steps).

export type PreflightGroup = 'From the client' | 'From you' | 'Setup'
export type PreflightItem = { group: PreflightGroup; text: string }

type Env = Record<string, string | undefined>
const unset = (env: Env, ...names: string[]) => names.filter((n) => !env[n]?.trim())

export type WebFacts = {
  kind: 'site_build' | 'site_update'
  engagementId: string
  hasBrief: boolean
  photos: number
  oldSiteVerbatim: boolean
  withStock: boolean
  hasInstructions: boolean
  businessLinked: boolean
  hasRepo: boolean
  /** evidence.repoHasWorkflow as the web checks recorded it; null when never checked. */
  repoHasWorkflow: boolean | null
}

export function webPreflight(f: WebFacts, env: Env = process.env): PreflightItem[] {
  const out: PreflightItem[] = []
  if (f.kind === 'site_build') {
    if (!f.hasBrief) out.push({ group: 'From you', text: 'a stored brief (write it with the chief and say "looks good")' })
  } else {
    if (!f.hasRepo) out.push({ group: 'From you', text: 'a built site: there is no repo yet, so build it first' })
    if (!f.hasInstructions) out.push({ group: 'From you', text: 'what to change (site_update needs instructions)' })
  }
  if (!f.businessLinked) out.push({ group: 'From you', text: 'a platform account for the client (create_client with createBusiness, or add_platform_account)' })
  if (f.hasRepo && f.repoHasWorkflow === false) out.push({ group: 'Setup', text: 'the repo has no aa-build workflow: run Sync workflow on the website card' })
  const setup = new Set<string>(unset(env, 'GITHUB_OPS_TOKEN', 'OPS_CALLBACK_SECRET'))
  if (f.kind === 'site_build' && !f.hasRepo) {
    for (const n of unset(env, 'ANTHROPIC_API_KEY_BUILDS', 'OPS_CALLBACK_SECRET', 'VERCEL_API_TOKEN', 'VERCEL_TEAM_ID')) setup.add(n)
    if (!(env.NODE_ENV === 'production' && env.VERCEL_ENV === 'production')) {
      out.push({ group: 'Setup', text: 'provisioning runs only on the production deployment (secrets are sealed from there): use Ops HQ on the live site' })
    }
  }
  for (const n of Array.from(setup)) out.push({ group: 'Setup', text: `${n} is not set` })
  return out
}

export const ADS_ENV = ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_MCC_ID'] as const

/** A campaign build from one of the launch specs (docs/ads-specs/*.md all carry this in their title line). */
export const isSpecBuild = (instructions: string) => /\|\s*Google Ads launch spec\s*\|/i.test(instructions)

/** A US-style phone number anywhere in the text. */
export const hasPhone = (text: string | null | undefined) => /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(text ?? '')

export type AdsFacts = {
  neverTouch: boolean
  instructions: string
  ownerPhone: string | null
  intakePhone: string | null
}

export function adsPreflight(f: AdsFacts, env: Env = process.env): PreflightItem[] {
  const out: PreflightItem[] = []
  if (f.neverTouch) out.push({ group: 'From you', text: 'this client is on the never-touch list in the ads playbook' })
  for (const n of unset(env, ...ADS_ENV, 'ANTHROPIC_API_KEY_BUILDS')) out.push({ group: 'Setup', text: `${n} is not set` })
  return out
}

const ORDER: PreflightGroup[] = ['From the client', 'From you', 'Setup']

/** One grouped message for Jacob, or null when nothing is missing. */
export function formatPreflight(what: string, client: string, items: PreflightItem[]): string | null {
  if (!items.length) return null
  const lines = [`Not starting the ${what} for ${client}. Missing:`]
  for (const g of ORDER) {
    const inGroup = items.filter((i) => i.group === g)
    if (!inGroup.length) continue
    lines.push(`${g}:`)
    for (const i of inGroup) lines.push(`- ${i.text}`)
  }
  lines.push('Nothing was started.')
  return lines.join('\n')
}
