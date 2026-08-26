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

/**
 * Traffic split. THIS IS THE ONE PLACE TO CHANGE TO REVIVE THE TEST.
 *
 * The nogate arm is currently switched off: everyone gets the gate. The
 * infrastructure stays fully wired (cookies, pixel `variant` params, the
 * reporting endpoint, the nogate code path in the funnel), so restoring a
 * 50/50 split is `nogate: 1` and nothing else.
 *
 * A weight of 0 does two things: new visitors are never assigned that arm, and
 * visitors already carrying its cookie are moved off it on their next visit.
 */
export const VARIANT_WEIGHTS: Record<Variant, number> = {
  gate: 1,
  nogate: 0,
}

/** A variant still receiving organic assignment. `?v=` overrides ignore this. */
export function isLiveVariant(variant: Variant): boolean {
  return (VARIANT_WEIGHTS[variant] ?? 0) > 0
}

export function assignVariant(): Variant {
  const total = VARIANTS.reduce((sum, v) => sum + (VARIANT_WEIGHTS[v] ?? 0), 0)
  if (total <= 0) return 'gate' // every arm disabled: fail to the control
  let roll = Math.random() * total
  for (const v of VARIANTS) {
    roll -= VARIANT_WEIGHTS[v] ?? 0
    if (roll < 0) return v
  }
  return 'gate'
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
