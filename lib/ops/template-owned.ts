// ===========================================
// /admin/ops: template-owned files (pure)
// ===========================================
// AA-Template's TEMPLATE-OWNED.json lists the files a client repo's agent may
// never edit in CI, plus marked sections inside shared files (AGENT.md's CI
// section). lib/ops/agents/sync-template-files.ts copies them from the
// template into each client repo by PR. Until the template carries the JSON,
// DEFAULT_TEMPLATE_OWNED stands in.

export type TemplateOwned = {
  files: string[]
  sections: { file: string; start: string; end: string }[]
}

export const DEFAULT_TEMPLATE_OWNED: TemplateOwned = {
  files: [
    'lib/config-schema.ts',
    'components/GoogleTag.tsx',
    'scripts/verify.ts',
    'scripts/verify-limits.ts',
    'scripts/contrast-check.ts',
    'lib/hero-scrim.ts',
    'lib/content.ts',
    'next.config.mjs',
    '.github/workflows/aa-build.yml',
  ],
  sections: [{ file: 'AGENT.md', start: '<!-- template-owned:ci:start -->', end: '<!-- template-owned:ci:end -->' }],
}

/** Never synced, whatever the JSON says: the sealed contact form and its checksum belong to each site. */
const NEVER = new Set(['components/ContactForm.tsx', 'scripts/contact-form.sha256', 'site.config.ts'])

/** TEMPLATE-OWNED.json as text → the list, or null when it is missing or malformed. */
export function parseTemplateOwned(text: string | null): TemplateOwned | null {
  if (!text) return null
  try {
    const j = JSON.parse(text) as Partial<TemplateOwned>
    const files = Array.isArray(j.files) ? j.files.filter((f): f is string => typeof f === 'string' && Boolean(f.trim()) && !NEVER.has(f)) : []
    const sections = Array.isArray(j.sections)
      ? j.sections.filter((s): s is TemplateOwned['sections'][number] => Boolean(s && typeof s.file === 'string' && typeof s.start === 'string' && typeof s.end === 'string' && s.start && s.end))
      : []
    return files.length || sections.length ? { files, sections } : null
  } catch {
    return null
  }
}

export type SectionResult =
  | { status: 'same'; text: string }
  | { status: 'replaced'; text: string }
  | { status: 'no-markers-client' | 'no-markers-template'; text: string }

function between(text: string, start: string, end: string): { from: number; to: number } | null {
  const a = text.indexOf(start)
  if (a === -1) return null
  const b = text.indexOf(end, a + start.length)
  if (b === -1) return null
  return { from: a + start.length, to: b }
}

/**
 * The client file with the text between the markers replaced by the
 * template's. A client file without both markers is left alone: guessing where
 * a section ends would overwrite what the client repo added.
 */
export function replaceSection(clientText: string, templateText: string, start: string, end: string): SectionResult {
  const t = between(templateText, start, end)
  if (!t) return { status: 'no-markers-template', text: clientText }
  const c = between(clientText, start, end)
  if (!c) return { status: 'no-markers-client', text: clientText }
  const want = templateText.slice(t.from, t.to)
  if (clientText.slice(c.from, c.to) === want) return { status: 'same', text: clientText }
  return { status: 'replaced', text: clientText.slice(0, c.from) + want + clientText.slice(c.to) }
}
