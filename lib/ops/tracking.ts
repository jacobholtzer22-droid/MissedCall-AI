// ===========================================
// /admin/ops: Google tag ids and conversion labels
// ===========================================
// Pure and tested. A site's Google tag (AA-Template site.config.ts tracking)
// needs the account's AW- id and a label per conversion. Both come from the
// conversion action's tag snippet ("send_to": "AW-123/AbC"), read with
// read_conversion_labels or right after create_conversion_action, and live on
// the ads deliverable's evidence:
//   googleAdsId         'AW-123'
//   conversionActions   { formId, formLabel, callId, callLabel, adCallId }
// The AW- id is the account's conversion tracking id, which is not the
// customer id; it is read from the snippet (or the customer's
// conversion_tracking_setting), never built from the customer id.

export type SendTo = { awId: string; label: string }

/** "send_to": "AW-123456789/AbCdEf" out of a tag snippet. */
export function parseSendTo(snippet: string | null | undefined): SendTo | null {
  const m = /send_to['"]?\s*:\s*['"](AW-\d+)\/([\w-]+)['"]/.exec(snippet ?? '')
  return m ? { awId: m[1], label: m[2] } : null
}

export type ConversionRow = {
  id: string
  name: string
  type: string
  category: string
  status: string
  /** Every tag snippet's event snippet text for this action. */
  snippets: string[]
}

export type ConversionActionsEvidence = {
  formId: string | null
  formLabel: string | null
  callId: string | null
  callLabel: string | null
  adCallId: string | null
}

const isForm = (r: ConversionRow) => r.category === 'SUBMIT_LEAD_FORM' || /\bform\b/i.test(r.name)
const isSiteCall = (r: ConversionRow) =>
  r.type !== 'AD_CALL' && (/click.?to.?call|call.*(site|website)|website call|phone click/i.test(r.name) || (r.category === 'PHONE_CALL_LEAD' && r.type === 'WEBPAGE'))

/**
 * Which enabled action is the form, which the click-to-call on the site,
 * which counts calls from ads. pinned ids (Jacob's or the brief's) win.
 * Only actions whose snippet carries a send_to give a label.
 */
export function classifyConversionActions(
  rows: ConversionRow[],
  pinned: { formId?: string | null; callId?: string | null } = {},
  trackingId: string | null = null
): { googleAdsId: string | null; conversionActions: ConversionActionsEvidence } {
  // Tag-fired (WEBPAGE) actions first: codeless and Google-hosted lead form actions are not fired by the site tag.
  const enabled = rows.filter((r) => r.status === 'ENABLED').sort((a, b) => Number(b.type === 'WEBPAGE') - Number(a.type === 'WEBPAGE'))
  const sendTo = (r: ConversionRow | undefined) => (r ? r.snippets.map(parseSendTo).find(Boolean) ?? null : null)
  const pick = (id: string | null | undefined, test: (r: ConversionRow) => boolean) =>
    (id ? enabled.find((r) => r.id === id) : undefined) ?? enabled.find((r) => test(r) && sendTo(r)) ?? enabled.find(test)
  const form = pick(pinned.formId, isForm)
  const call = pick(pinned.callId, (r) => r !== form && isSiteCall(r))
  const adCall = enabled.find((r) => r.type === 'AD_CALL')
  const f = sendTo(form)
  const c = sendTo(call)
  const fromSnippet = f?.awId ?? c?.awId ?? enabled.map(sendTo).find(Boolean)?.awId ?? null
  const tid = trackingId ? (trackingId.startsWith('AW-') ? trackingId : `AW-${trackingId}`) : null
  return {
    googleAdsId: fromSnippet ?? tid,
    conversionActions: {
      formId: form?.id ?? null,
      formLabel: f?.label ?? null,
      callId: call?.id ?? null,
      callLabel: c?.label ?? null,
      adCallId: adCall?.id ?? null,
    },
  }
}

export type TrackingBlock = { googleAdsId: string; conversions: { form?: string; call?: string } }

/** The site.config.ts tracking block from the ads deliverable's evidence, or what is missing. */
export function trackingBlockFrom(ev: Record<string, unknown> | null | undefined): { block: TrackingBlock | null; missing: string[] } {
  const id = typeof ev?.googleAdsId === 'string' && /^AW-\d{6,12}$/.test(ev.googleAdsId) ? ev.googleAdsId : null
  const ca = (ev?.conversionActions ?? {}) as Record<string, unknown>
  const label = (v: unknown) => (typeof v === 'string' && /^[\w-]+$/.test(v) ? v : null)
  const form = label(ca.formLabel)
  const call = label(ca.callLabel)
  const missing = [...(id ? [] : ['the AW- id']), ...(form ? [] : ['the form label']), ...(call ? [] : ['the click-to-call label'])]
  if (!id || (!form && !call)) return { block: null, missing }
  return { block: { googleAdsId: id, conversions: { ...(form ? { form: `${id}/${form}` } : {}), ...(call ? { call: `${id}/${call}` } : {}) } }, missing }
}

/** INSTRUCTIONS.md for the site agent: a tracking install (AGENT.md: write the block, nothing else). */
export function trackingInstructions(block: TrackingBlock): string {
  const conv = [block.conversions.form ? `form: '${block.conversions.form}'` : null, block.conversions.call ? `call: '${block.conversions.call}'` : null].filter(Boolean).join(', ')
  return [
    'Tracking install. Write this tracking block into site.config.ts as the `tracking` key, exactly as given, and change nothing else (AGENT.md, CI mode, Tracking installs):',
    '',
    '```ts',
    `tracking: {`,
    `  googleAdsId: '${block.googleAdsId}',`,
    `  conversions: { ${conv} },`,
    `},`,
    '```',
    '',
    'Then run the gate: check 22 must pass.',
  ].join('\n')
}

/** The AW- ids in a page's HTML (gtag.js loader and gtag config calls). */
export function gtagIdsIn(html: string): string[] {
  const ids = new Set<string>()
  for (const m of Array.from(html.matchAll(/gtag\/js\?id=(AW-\d+|G-[A-Z0-9]+)/g))) ids.add(m[1])
  for (const m of Array.from(html.matchAll(/gtag\(\s*\\?['"]config\\?['"]\s*,\s*\\?['"](AW-\d+|G-[A-Z0-9]+)/g))) ids.add(m[1])
  return Array.from(ids)
}
