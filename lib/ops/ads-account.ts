// ===========================================
// Ops HQ: create the client's Google Ads account by API (ADS_ACCOUNT_CREATE)
// ===========================================
// Off unless ADS_ACCOUNT_CREATE is exactly 'true'. Pure rules plus two runners
// with the Google calls injected (lib/ops/ads-account-server.ts wires the
// google-ads-api client the platform already uses; the tests use fakes).
//
// The flow, every write behind a Push:
//   1. propose (chief tool propose_ads_account): fields from the intake and the board,
//      never invented; a missing or ambiguous field blocks with a list. Then ONE
//      read-only access check: CustomerService.CreateCustomerClient with
//      validate_only = true under Jacob's manager. Google validates and creates
//      nothing (customer_service.proto, CreateCustomerClientRequest.validate_only:
//      "If true, the request is validated but not executed. Only errors are returned,
//      not results."; vendored at node_modules/google-ads-node/build/protos/google/ads/
//      googleads/v23/services/customer_service.proto). A refusal (developer token level,
//      manager permission, account limit) is shown in plain words and no card is made.
//      Otherwise an OpsApproval kind ads_account_create carries the exact fields.
//   2. Push: the same call with validate_only = false. The new id comes back as
//      resource_name "customers/<id>" and is bound BY ID: Business.googleAdsCustomerId
//      (only when empty, the bind_account rule), evidence.adsCustomerId on the ads
//      deliverable, the ads step from account to the next catalog step, an activity.
//   3. The client's Gmail invitation (q17) is a SEPARATE card, kind ads_invite, made on
//      success. CreateCustomerClient can invite in the same call, but its email_address
//      and access_role are "Accessible only to customers on the allow-list" (same proto),
//      so the invite goes through CustomerUserAccessInvitationService (the library's
//      customerUserAccessInvitations.create) on the new account, only when that card is pushed.
//
// Never: billing (the client adds the card in the Ads UI), enabling, any spend, an
// autoflow hop (no autoflow table row can reach this), a never-touch client, a client
// that already has an account id, more than one Google call per step.

export function adsAccountCreateEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ADS_ACCOUNT_CREATE === 'true'
}

export const ACCOUNT_APPROVAL_KINDS = ['ads_account_create', 'ads_invite'] as const

/** US states that sit in one Google Ads time zone (IANA). Split states are left out on purpose. */
const STATE_TZ: Record<string, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago', CA: 'America/Los_Angeles',
  CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York', GA: 'America/New_York',
  HI: 'Pacific/Honolulu', IL: 'America/Chicago', IA: 'America/Chicago', LA: 'America/Chicago', ME: 'America/New_York',
  MD: 'America/New_York', MA: 'America/New_York', MN: 'America/Chicago', MS: 'America/Chicago', MO: 'America/Chicago',
  MT: 'America/Denver', NV: 'America/Los_Angeles', NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver',
  NY: 'America/New_York', NC: 'America/New_York', OH: 'America/New_York', OK: 'America/Chicago', PA: 'America/New_York',
  RI: 'America/New_York', SC: 'America/New_York', UT: 'America/Denver', VT: 'America/New_York', VA: 'America/New_York',
  WA: 'America/Los_Angeles', WV: 'America/New_York', WI: 'America/Chicago', WY: 'America/Denver',
}
/**
 * States with two time zones: the zone that covers most of the state's people. The card
 * says so and asks Jacob to confirm before Push; propose_ads_account takes an explicit
 * time_zone when he says otherwise.
 *   FL  Eastern: all but the western Panhandle.            KY  Eastern: Louisville, Lexington, the east.
 *   MI  Eastern: all but four Upper Peninsula counties.    IN  Eastern: all but the northwest and southwest corners.
 *   TN  Central: Nashville, Memphis and Middle and West TN outnumber East TN.
 *   TX  Central: all but El Paso and Hudspeth.             KS, NE, SD, ND  Central: the western strips are Mountain.
 *   OR  Pacific: all but most of Malheur County.           ID  Mountain: Boise and the south; the north is Pacific.
 * Canonical zones only (America/New_York, Chicago, Denver, Los_Angeles), which keep the same
 * offsets as America/Detroit, Indiana/Indianapolis, Kentucky/Louisville and Boise.
 */
export const SPLIT_STATE_TZ: Record<string, string> = {
  FL: 'America/New_York', MI: 'America/New_York', IN: 'America/New_York', KY: 'America/New_York',
  TN: 'America/Chicago', TX: 'America/Chicago', KS: 'America/Chicago', NE: 'America/Chicago', SD: 'America/Chicago', ND: 'America/Chicago',
  OR: 'America/Los_Angeles', ID: 'America/Denver',
}

export type ZoneResult = { tz: string; split: boolean; source: 'state' | 'override' } | { missing: string }

/** A real IANA zone name, or null. */
export function validTimeZone(v: unknown): string | null {
  if (typeof v !== 'string' || !/^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2}$/.test(v.trim())) return null
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: v.trim() }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

/** "City, ST" (Engagement.location, or the intake's home base) to a time zone, or why not. An override wins. */
export function timeZoneFor(location: string | null | undefined, override?: string | null): ZoneResult {
  if (override) {
    const tz = validTimeZone(override)
    return tz ? { tz, split: false, source: 'override' } : { missing: `the time zone: "${override}" is not a valid time zone name (e.g. America/Chicago)` }
  }
  const st = location?.match(/,\s*([A-Za-z]{2})\b\s*(\d{5})?\s*$/)?.[1]?.toUpperCase()
  if (!st) return { missing: 'the time zone: the client location (City, ST) is not on the board or in the intake (q9)' }
  if (SPLIT_STATE_TZ[st]) return { tz: SPLIT_STATE_TZ[st], split: true, source: 'state' }
  const tz = STATE_TZ[st]
  return tz ? { tz, split: false, source: 'state' } : { missing: `the time zone: ${st} is not a US state I know` }
}

/** The card's time zone line. */
export function zoneLine(z: { tz: string; split: boolean; source: string }): string {
  if (z.source === 'override') return `Time zone: ${z.tz} (as you said)`
  return z.split ? `Time zone: ${z.tz} (state spans two zones; confirm before Push)` : `Time zone: ${z.tz}`
}

export type AccountFacts = {
  engagementId: string
  /** The board name, else the intake's customer-facing name (q1). */
  displayName: string | null
  location: string | null
  intakeAddress: string | null
  /** q17: the Gmail to invite. Optional: no invite card without it. */
  accountEmail: string | null
  businessId: string | null
  existingCustomerId: string | null
  neverTouch: boolean
  hasAdsDeliverable: boolean
}

export type AccountFields = { descriptiveName: string; currencyCode: 'USD'; timeZone: string }
export type AccountZone = { split: boolean; source: 'state' | 'override' }

/** The exact fields, or the list of what blocks the proposal. Currency is USD only because the client is in a US state. */
export function accountFields(f: AccountFacts, timeZoneOverride?: string | null): { fields: AccountFields; zone: AccountZone } | { blocked: string[] } {
  const blocked: string[] = []
  if (f.neverTouch) blocked.push('this client is on the never-touch list in the ads playbook')
  if (f.existingCustomerId) blocked.push(`the client already has a Google Ads account (${f.existingCustomerId}); bind or use that one`)
  if (!f.hasAdsDeliverable) blocked.push('the client has no ads service on the board')
  if (!f.businessId) blocked.push('the client has no platform account to store the account id on')
  const name = f.displayName?.trim()
  if (!name) blocked.push('the business name (q1)')
  const tz = timeZoneFor(f.location?.trim() || f.intakeAddress?.trim() || null, timeZoneOverride)
  if ('missing' in tz) blocked.push(tz.missing)
  if (blocked.length || 'missing' in tz) return { blocked }
  return { fields: { descriptiveName: name!.slice(0, 120), currencyCode: 'USD', timeZone: tz.tz }, zone: { split: tz.split, source: tz.source } }
}

/** "customers/1234567890" to "1234567890", or null. */
export function customerIdFrom(resourceName: string | null | undefined): string | null {
  return resourceName?.match(/^customers\/(\d{6,12})$/)?.[1] ?? null
}

/** The ads step after an account exists: the step after `account` in the catalog, only from account or none. */
export function stepAfterAccount(current: string | null, catalog: readonly { key: string }[]): string | null {
  if (current !== null && current !== 'account') return null
  const i = catalog.findIndex((s) => s.key === 'account')
  return i >= 0 ? catalog[i + 1]?.key ?? null : null
}

/** A Google refusal of the validate_only create, in plain words. */
export function accessRefusal(err: string): string {
  const e = err.toUpperCase()
  if (/DEVELOPER_TOKEN|NOT_APPROVED|TEST_ACCOUNT/.test(e)) return 'the developer token is not allowed to create client accounts at its access level'
  if (/PERMISSION|AUTHORIZATION|NOT_ALLOWED|USER_PERMISSION_DENIED/.test(e)) return 'this manager account or login is not allowed to create client accounts'
  if (/LIMIT|TOO_MANY|RESOURCE_COUNT/.test(e)) return 'the manager has reached the number of client accounts Google lets it create'
  return `Google refused the check: ${err}`
}

// -------------------------------------------
// Runners (Google and the board injected)
// -------------------------------------------

export type AccountDeps = {
  facts(engagementId: string): Promise<AccountFacts | null>
  /** CustomerService.CreateCustomerClient under the manager. Returns resource_name. Throws Google's error. */
  createCustomerClient(fields: AccountFields, validateOnly: boolean): Promise<string | null>
  /** CustomerUserAccessInvitationService create on the new account. */
  invite(customerId: string, email: string, role: 'ADMIN' | 'STANDARD'): Promise<void>
  /** Business.googleAdsCustomerId (only when empty), evidence.adsCustomerId, the ads step, an activity. */
  bind(engagementId: string, customerId: string, nextStep: string | null, fields: AccountFields): Promise<{ businessSet: boolean }>
  currentAdsStep(engagementId: string): Promise<string | null>
  proposeCard(kind: (typeof ACCOUNT_APPROVAL_KINDS)[number], engagementId: string, title: string, detail: Record<string, unknown>, expected: string): Promise<string>
  activity(engagementId: string, body: string): Promise<void>
}

export type ProposeResult = { proposed: true; approvalId: string; fields: AccountFields } | { proposed: false; reason: string }

/** Step 1. Never creates anything: one validate_only call, then a card. */
export async function proposeAccount(engagementId: string, deps: AccountDeps, timeZoneOverride?: string | null): Promise<ProposeResult> {
  if (!adsAccountCreateEnabled()) return { proposed: false, reason: 'ADS_ACCOUNT_CREATE is off' }
  const f = await deps.facts(engagementId)
  if (!f) return { proposed: false, reason: 'no such client' }
  const r = accountFields(f, timeZoneOverride)
  if ('blocked' in r) return { proposed: false, reason: `Not proposing a Google Ads account. Missing or blocking: ${r.blocked.join('; ')}.` }
  const tzLine = zoneLine({ tz: r.fields.timeZone, ...r.zone })
  try {
    await deps.createCustomerClient(r.fields, true)
  } catch (err) {
    const why = accessRefusal(err instanceof Error ? err.message : String(err))
    await deps.activity(engagementId, `Google Ads account not proposed: ${why}. Nothing was created.`)
    return { proposed: false, reason: `Not proposing a Google Ads account: ${why}. Nothing was created.` }
  }
  const approvalId = await deps.proposeCard(
    'ads_account_create',
    engagementId,
    `Create the Google Ads account for ${f.displayName}`,
    {
      action: 'create_customer_client',
      engagementId,
      ...r.fields,
      timeZoneSource: r.zone.source,
      ...(r.zone.split ? { timeZoneNote: 'state spans two zones; confirm before Push' } : {}),
      accountEmail: f.accountEmail,
      accessCheck: 'validate_only create passed',
    },
    `${tzLine}. Creates "${r.fields.descriptiveName}" (${r.fields.currencyCode}, ${r.fields.timeZone}) under your manager and binds it to ${f.displayName} by id. No billing, no campaign, nothing spends.${f.accountEmail ? ` The invite to ${f.accountEmail} comes as its own card after.` : ' No q17 Gmail on the intake, so no invite card.'}`
  )
  return { proposed: true, approvalId, fields: r.fields }
}

/** Step 2, only from an approved ads_account_create card. */
export async function applyAccountCreate(detail: Record<string, unknown>, deps: AccountDeps, catalog: readonly { key: string }[]): Promise<{ customerId: string; inviteApprovalId: string | null }> {
  const engagementId = String(detail.engagementId ?? '')
  const f = await deps.facts(engagementId)
  if (!f) throw new Error('the client is gone')
  // Re-check at Push time: an account may have been bound since the card was made. The card's
  // zone is what Jacob confirmed by pushing it, so an override on the card is honoured.
  const r = accountFields(f, detail.timeZoneSource === 'override' ? String(detail.timeZone ?? '') : null)
  if ('blocked' in r) throw new Error(`not created: ${r.blocked.join('; ')}`)
  const fields: AccountFields = {
    descriptiveName: String(detail.descriptiveName ?? ''),
    currencyCode: 'USD',
    timeZone: String(detail.timeZone ?? ''),
  }
  if (fields.descriptiveName !== r.fields.descriptiveName || fields.timeZone !== r.fields.timeZone) throw new Error('the client details changed since the card was made; propose again')
  const customerId = customerIdFrom(await deps.createCustomerClient(fields, false))
  if (!customerId) throw new Error('Google did not return a customer id')
  await deps.bind(engagementId, customerId, stepAfterAccount(await deps.currentAdsStep(engagementId), catalog), fields)
  let inviteApprovalId: string | null = null
  if (f.accountEmail) {
    inviteApprovalId = await deps.proposeCard(
      'ads_invite',
      engagementId,
      `Invite ${f.accountEmail} to ${fields.descriptiveName}'s Google Ads account`,
      { action: 'invite_user', engagementId, customerId, email: f.accountEmail, role: 'ADMIN' },
      `Sends Google's access invitation to ${f.accountEmail} (q17) as Admin on ${customerId}, so the client can add billing themselves. Nothing else changes.`
    )
  }
  return { customerId, inviteApprovalId }
}

/** Step 3, only from an approved ads_invite card. */
export async function applyInvite(detail: Record<string, unknown>, deps: AccountDeps): Promise<void> {
  const customerId = String(detail.customerId ?? '')
  const email = String(detail.email ?? '')
  if (!/^\d{6,12}$/.test(customerId)) throw new Error('bad customer id on the card')
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error('bad email on the card')
  const role = detail.role === 'STANDARD' ? 'STANDARD' : 'ADMIN'
  await deps.invite(customerId, email, role)
  await deps.activity(String(detail.engagementId ?? ''), `Google Ads invitation sent to ${email} (${role}) on ${customerId}.`)
}
