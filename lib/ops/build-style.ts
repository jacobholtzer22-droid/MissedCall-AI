// ===========================================
// /admin/ops: build style history, extras and questions
// ===========================================
// Pure and tested.
//
//   parseDesignDirection  the workflow's design_direction text (the report's
//                         "Design direction" item) → { direction, pairing,
//                         headingAccent }, stored as AgentRun output.style so
//                         the next dispatch reads style history in one query.
//   questionsFrom         CLIENT-TODO.md's "Questions for Jacob" section → one
//                         question per line, for the job report and the client
//                         card.
//   buildExtras           the dispatch's `extras` key: recent_styles (do not
//                         repeat), the GBP lookup and the client's style asks.

export type BuildStyle = { direction: string | null; pairing: string | null; headingAccent: string | null }
export type RecentStyle = { client: string; direction: string | null; pairing: string | null; headingAccent: string | null }

const clean = (v: string) =>
  v
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Reads `direction: x`, `pairing: x`, `headingAccent: x` lines, bullets and bold tolerated. null when none is there. */
export function parseDesignDirection(text: string | null | undefined): BuildStyle | null {
  if (!text) return null
  const out: BuildStyle = { direction: null, pairing: null, headingAccent: null }
  const keys: Record<string, keyof BuildStyle> = { direction: 'direction', pairing: 'pairing', headingaccent: 'headingAccent', 'heading accent': 'headingAccent' }
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/[*_`]/g, '')
    const m = /^\s*(direction|pairing|heading ?accent)\s*[:=]\s*(.+)$/i.exec(line)
    if (!m) continue
    const key = keys[m[1].toLowerCase()]
    const value = clean(m[2])
    if (key && value && !out[key]) out[key] = value.slice(0, 120)
  }
  return out.direction || out.pairing || out.headingAccent ? out : null
}

/** One question per line from the "Questions for Jacob" section (or the whole text when it has no heading). */
export function questionsFrom(clientTodo: string | null | undefined, max = 20): string[] {
  if (!clientTodo) return []
  const lines = clientTodo.split('\n')
  const start = lines.findIndex((l) => /^#{1,6}\s*questions for jacob/i.test(l.trim()))
  const body: string[] = []
  for (let i = start === -1 ? 0 : start + 1; i < lines.length; i++) {
    if (start !== -1 && /^#{1,6}\s/.test(lines[i].trim())) break
    body.push(lines[i])
  }
  return body
    .map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+(\[[ x]\]\s+)?/i, '').replace(/\u2014/g, ',').trim())
    .filter((l) => l && !/^#{1,6}\s/.test(l))
    .slice(0, max)
}

export type IntakeStyle = { referenceSites?: string[]; colors?: string[]; sitesLiked?: string[]; brandColors?: string[]; avoid?: string }

const list = (...vs: (string[] | undefined)[]) => Array.from(new Set(vs.flatMap((v) => (Array.isArray(v) ? v : [])).map((s) => String(s).trim()).filter(Boolean)))

/** intake.style in the workflow's terms: referenceSites and colors are what the intake page calls them. */
export function styleFromIntake(style: IntakeStyle | null | undefined): { sitesLiked?: string[]; brandColors?: string[] } | null {
  const sitesLiked = list(style?.sitesLiked, style?.referenceSites)
  const brandColors = list(style?.brandColors, style?.colors)
  if (!sitesLiked.length && !brandColors.length) return null
  return { ...(sitesLiked.length ? { sitesLiked } : {}), ...(brandColors.length ? { brandColors } : {}) }
}

export type BuildExtras = {
  recent_styles?: RecentStyle[]
  gbp?: Record<string, unknown>
  style?: { sitesLiked?: string[]; brandColors?: string[] }
}

/** The dispatch's extras; null (sent as '') when there is nothing in it. */
export function buildExtras(opts: { recentStyles?: RecentStyle[]; gbp?: Record<string, unknown> | null; style?: IntakeStyle | null }): BuildExtras | null {
  const recent = (opts.recentStyles ?? []).filter((s) => s.direction || s.pairing || s.headingAccent).slice(0, 5)
  const gbp = opts.gbp && typeof opts.gbp === 'object' && Object.keys(opts.gbp).length ? opts.gbp : null
  const style = styleFromIntake(opts.style)
  const out: BuildExtras = { ...(recent.length ? { recent_styles: recent } : {}), ...(gbp ? { gbp } : {}), ...(style ? { style } : {}) }
  return Object.keys(out).length ? out : null
}
