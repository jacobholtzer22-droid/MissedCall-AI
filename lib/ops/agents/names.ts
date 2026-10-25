// ===========================================
// /admin/ops agents — pure, client-safe names
// ===========================================
// Shared by the server modules and the panel: the run kinds and the default
// repo name the Provision form prefills.

export const RUN_KINDS = ['site_build', 'site_update', 'go_live'] as const
export type RunKind = (typeof RUN_KINDS)[number]

/** "AA-" + displayName in PascalCase, non-alphanumerics removed. */
export function defaultRepoName(displayName: string): string {
  const pascal = displayName
    .replace(/[‘’']/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')
  return `AA-${pascal}`
}
