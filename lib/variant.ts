// ===========================================
// A/B VARIANT: gate vs nogate
// ===========================================
// One structural split on /book. Assignment is server-side on first visit and
// sticky in an httpOnly cookie, so a visitor never flips arms mid-funnel.
//
// Nothing in here picks a winner. It assigns and it reports. The decision is
// the operator's.

export const VARIANT_COOKIE = 'aa_variant'
export const VISITOR_COOKIE = 'aa_visitor'
export const VARIANT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180 // 180 days

export type Variant = 'gate' | 'nogate'
export const VARIANTS: Variant[] = ['gate', 'nogate']

export function isVariant(value: string | null | undefined): value is Variant {
  return value === 'gate' || value === 'nogate'
}

/** 50/50. Deliberately unweighted: one variable, even split, no auto-tuning. */
export function assignVariant(): Variant {
  return Math.random() < 0.5 ? 'gate' : 'nogate'
}

/** `?v=gate` / `?v=nogate` forces an arm for preview and QA. */
export function variantFromQuery(value: string | null | undefined): Variant | null {
  return isVariant(value) ? value : null
}

/** Opaque per-visitor id. Ties the coupon claim and the lead to one browser. */
export function newVisitorId(): string {
  const rand = () => Math.random().toString(36).slice(2, 12)
  return `v_${Date.now().toString(36)}${rand()}${rand()}`
}
