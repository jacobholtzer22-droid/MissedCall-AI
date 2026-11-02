// ===========================================
// Ops: one key per trade, for comparing clients in the same line of work
// ===========================================
// The Research desk compares a client with the other ads clients in its trade
// (trade_siblings) and the monthly learnings job groups accounts by trade.
// Both go through tradeKey here, so they always agree.
//
// TRADES is a plain table on purpose: edit it to add a trade or a synonym.
// Order matters: the first row with a matching word wins, so a more specific
// row sits above a broader one. Words match whole words after normalising
// (lowercase, "&" to "and", punctuation to spaces), so "lawn" matches
// "Brad's Lawn Services" but not "lawnmower".
//
// Built Nov 2 2026 from every Engagement.trade and Business.businessType on the
// board plus the client names, since most rows say "Other".

export type Trade = { key: string; label: string; words: string[] }

export const TRADES: Trade[] = [
  { key: 'spray_foam', label: 'Spray foam and insulation', words: ['spray foam', 'insulation', 'foam insulation'] },
  { key: 'pressure_washing', label: 'Pressure washing', words: ['pressure washing', 'pressure wash', 'pressure cleaning', 'power washing', 'power wash', 'soft washing', 'soft wash'] },
  { key: 'detailing', label: 'Auto detailing', words: ['detailing', 'auto detailing', 'mobile detailing', 'car detailing', 'detailers', 'detailer', 'auto spa', 'car wash'] },
  { key: 'junk_removal', label: 'Junk removal and hauling', words: ['junk removal', 'junk', 'hauling', 'haul', 'demo', 'demolition', 'waste removal', 'dumpster', 'dump'] },
  { key: 'tree_service', label: 'Tree service and land clearing', words: ['tree service', 'tree', 'trees', 'land clearing', 'stump', 'stump grinding', 'arborist'] },
  { key: 'landscaping', label: 'Landscaping and lawn care', words: ['landscaping', 'landscape', 'lawn care', 'lawn', 'lawns', 'mowing', 'gardener', 'gardner', 'gardening'] },
  { key: 'holiday_lighting', label: 'Holiday and permanent lighting', words: ['holiday lighting', 'christmas lights', 'christmas lighting', 'permanent lighting', 'permanent lights', 'holiday lights'] },
  { key: 'windows_doors', label: 'Windows, doors and blinds', words: ['windows and doors', 'windows', 'window', 'doors', 'blinds', 'shutters', 'shades', 'window treatments'] },
  { key: 'roofing', label: 'Roofing', words: ['roofing', 'roofer', 'roof', 'roofs'] },
  { key: 'drywall', label: 'Drywall', words: ['drywall', 'sheetrock'] },
  { key: 'painting', label: 'Painting', words: ['painting', 'painter', 'painters'] },
  { key: 'water_filtration', label: 'Water filtration', words: ['water filtration', 'water treatment', 'water softener', 'water softeners', 'water pros', 'reverse osmosis'] },
  { key: 'hvac', label: 'HVAC', words: ['hvac', 'heating', 'air conditioning', 'ac repair', 'furnace'] },
  { key: 'electrical', label: 'Electrical', words: ['electric', 'electrical', 'electrician'] },
  { key: 'truck_repair', label: 'Truck and auto repair', words: ['truck repair', 'auto repair', 'diesel repair', 'mechanic'] },
  { key: 'remodeling', label: 'Remodeling and general contracting', words: ['remodel', 'remodeling', 'remodelling', 'renovation', 'renovations', 'general contractor', 'general contracting', 'construction', 'contractor'] },
  { key: 'handyman', label: 'Handyman', words: ['handyman', 'handy man', 'property care', 'odd jobs'] },
]

/** Values that name no trade at all. */
const GENERIC = new Set(['', 'other', 'other home service', 'home service', 'home services', 'services', 'n a', 'na', 'none'])

export function normalizeTrade(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** The trade key for one piece of text, or null when it names none of TRADES. */
export function tradeKey(text: string | null | undefined): string | null {
  if (!text) return null
  const norm = normalizeTrade(text)
  if (GENERIC.has(norm)) return null
  const padded = ` ${norm} `
  for (const t of TRADES) if (t.words.some((w) => padded.includes(` ${normalizeTrade(w)} `))) return t.key
  return null
}

export const tradeLabel = (key: string | null | undefined) => TRADES.find((t) => t.key === key)?.label ?? key ?? 'Unknown trade'

/**
 * A client's trade key: the first source that names a trade, in this order
 * (most to least trusted on today's board): the intake's trade, the display
 * name, Engagement.trade, Business.businessType, then the service names.
 * The name comes before the two trade columns because those mostly say "Other"
 * and are sometimes copied wrong (Cowboy Spray Foam's say Car Detailing).
 */
export function clientTradeKey(src: {
  intakeTrade?: string | null
  name?: string | null
  trade?: string | null
  businessType?: string | null
  services?: (string | null | undefined)[]
}): { key: string | null; from: string | null } {
  const order: [string, string | null | undefined][] = [
    ['intake trade', src.intakeTrade],
    ['name', src.name],
    ['trade', src.trade],
    ['business type', src.businessType],
    ...(src.services ?? []).map((s): [string, string | null | undefined] => ['service', s]),
  ]
  for (const [from, text] of order) {
    const key = tradeKey(text)
    if (key) return { key, from }
  }
  return { key: null, from: null }
}
