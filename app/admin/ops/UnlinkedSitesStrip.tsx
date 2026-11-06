'use client'

// Clients tab: website clients the nightly matcher could not link to a GitHub
// repo or a Vercel project. Each row shows the best candidates (ranked by name)
// as one-tap Link buttons, plus a manual pick from every unmatched repo and
// project. Confirming writes the website deliverable's repoUrl /
// vercelProjectId and reruns that client's site checks. The chief has the
// same two steps in chat (suggest_repo_links, link_repo).
//
// Loads on first open, not on tab mount: the suggestion call walks every
// repo and project (20 to 40 seconds cold, 10 minute server cache after).

import { useState } from 'react'
import { ChevronDown, Link2, RefreshCw } from 'lucide-react'
import type { LinkSuggestions } from '@/lib/ops/checks/link'
import type { LinkSuggestion } from '@/lib/ops/checks/link-suggest'
import { smallButton, smallControl, type OpsActions } from './opsUi'

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, data }
  } catch {
    return { ok: false, data: { error: 'Network error' } }
  }
}

const shortRepo = (s: string) => s.replace(/^https:\/\/github\.com\//, '').replace(/^jacobholtzer22-droid\//, '')
const pct = (n: number) => `${Math.round(n * 100)}%`

export function UnlinkedSitesStrip({ actions, onLinked }: { actions: OpsActions; onLinked: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<LinkSuggestions | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [manual, setManual] = useState<string | null>(null)

  const load = async (refresh = false) => {
    setLoading(true)
    const { ok, data: d } = await send(`/api/admin/ops/checks/links${refresh ? '?refresh=1' : ''}`, 'GET')
    setLoading(false)
    if (!ok) {
      actions.toast(String(d.error ?? 'Could not load link suggestions'), 'error')
      return
    }
    setData(d as unknown as LinkSuggestions)
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && data === null && !loading) void load()
  }

  const link = async (s: LinkSuggestion, repo: string | null, project: string | null) => {
    const what = [repo ? shortRepo(repo) : null, project ? `Vercel ${project}` : null].filter(Boolean).join(' + ')
    if (!window.confirm(`Link ${s.client} to ${what}?`)) return
    setBusy(s.engagementId)
    const { ok, data: d } = await send('/api/admin/ops/checks/links', 'POST', { engagementId: s.engagementId, repo, project })
    setBusy(null)
    if (!ok) {
      actions.toast(String(d.error ?? 'Link failed'), 'error')
      return
    }
    const checks = d.checks as { failingByKey?: Record<string, unknown> } | null
    const failing = checks?.failingByKey ? Object.keys(checks.failingByKey).length : null
    actions.toast(`Linked ${s.client}${failing === null ? '' : `, ${failing} check${failing === 1 ? '' : 's'} failing`}`, 'success')
    setManual(null)
    await onLinked()
    void load(true)
  }

  const count = data?.suggestions.length ?? null

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg">
      <div className="flex items-center gap-2 px-4">
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="flex-1 flex items-center gap-2 min-h-[48px] text-sm font-semibold text-gray-100 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          <Link2 className="h-4 w-4 text-gray-500" />
          Unlinked sites
          <span className={`tabular-nums font-normal ${count ? 'text-amber-300' : 'text-gray-500'}`}>{count === null ? (loading ? '…' : '') : count}</span>
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (!open) setOpen(true)
            void load(true)
          }}
          disabled={loading}
          aria-label="Re-read GitHub and Vercel"
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-gray-400 hover:text-gray-100 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-800">
          {data === null ? (
            <p className="px-4 py-4 text-sm text-gray-500">{loading ? 'Reading every repo and Vercel project… (20 to 40 seconds the first time)' : 'Not loaded.'}</p>
          ) : data.suggestions.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-500">Every website client is linked to a repo and a Vercel project.</p>
          ) : (
            <ul className="divide-y divide-gray-800">
              {data.suggestions.map((s) => {
                const topRepo = s.repos[0] ?? null
                const topProject = s.projects[0] ?? null
                const bothId = `${s.engagementId}`
                return (
                  <li key={s.engagementId} className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => actions.openEngagement(s.engagementId)}
                        className="text-sm text-gray-100 hover:underline text-left min-h-[32px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                      >
                        {s.client}
                      </button>
                      <span className="text-xs text-gray-500">
                        {s.linked.repoUrl && !s.linked.vercelProjectId
                          ? 'has repo, no Vercel project'
                          : !s.linked.repoUrl && s.linked.vercelProjectId
                          ? 'has Vercel project, no repo'
                          : 'no repo, no Vercel project'}
                      </span>
                    </div>

                    {topRepo || topProject ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {topRepo && topProject && (
                          <button
                            type="button"
                            disabled={busy === bothId}
                            onClick={() => link(s, topRepo.fullName, topProject.id)}
                            className={`${smallButton} border-blue-700 bg-blue-900/40 hover:bg-blue-800/50`}
                            title={`${topRepo.why}; ${topProject.why}`}
                          >
                            Link {shortRepo(topRepo.fullName)} + {topProject.name}
                            <span className="text-gray-400 tabular-nums">{pct(Math.min(topRepo.score, topProject.score))}</span>
                          </button>
                        )}
                        {topRepo && (
                          <button type="button" disabled={busy === bothId} onClick={() => link(s, topRepo.fullName, null)} className={smallButton} title={topRepo.why}>
                            Repo only: {shortRepo(topRepo.fullName)} <span className="text-gray-400 tabular-nums">{pct(topRepo.score)}</span>
                          </button>
                        )}
                        {topProject && (
                          <button type="button" disabled={busy === bothId} onClick={() => link(s, null, topProject.id)} className={smallButton} title={topProject.why}>
                            Project only: {topProject.name} <span className="text-gray-400 tabular-nums">{pct(topProject.score)}</span>
                          </button>
                        )}
                        <button type="button" onClick={() => setManual(manual === s.engagementId ? null : s.engagementId)} className={smallButton}>
                          Other…
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-500">No name match among the {data.unmatchedRepos.length} free repos and {data.unmatchedProjects.length} free projects.</span>
                        <button type="button" onClick={() => setManual(manual === s.engagementId ? null : s.engagementId)} className={smallButton}>
                          Pick…
                        </button>
                      </div>
                    )}

                    {(s.repos.length > 1 || s.projects.length > 1) && (
                      <p className="text-xs text-gray-500">
                        Also close:{' '}
                        {[...s.repos.slice(1).map((r) => `${shortRepo(r.fullName)} ${pct(r.score)}`), ...s.projects.slice(1).map((p) => `${p.name} ${pct(p.score)}`)].join(', ')}
                      </p>
                    )}

                    {manual === s.engagementId && <ManualPick data={data} s={s} busy={busy === bothId} onLink={(r, p) => link(s, r, p)} onCancel={() => setManual(null)} />}
                  </li>
                )
              })}
            </ul>
          )}
          {data && data.apiErrors.length > 0 && (
            <p className="px-4 pb-3 text-xs text-amber-300">
              {data.apiErrors.length} API error{data.apiErrors.length === 1 ? '' : 's'} while reading: {data.apiErrors.slice(0, 3).join('; ')}
              {data.apiErrors.length > 3 ? '…' : ''}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function ManualPick({
  data,
  s,
  busy,
  onLink,
  onCancel,
}: {
  data: LinkSuggestions
  s: LinkSuggestion
  busy: boolean
  onLink: (repo: string | null, project: string | null) => void
  onCancel: () => void
}) {
  const [repo, setRepo] = useState<string>(s.repos[0]?.fullName ?? '')
  const [project, setProject] = useState<string>(s.projects[0]?.id ?? '')
  const needRepo = !s.linked.repoUrl
  const needProject = !s.linked.vercelProjectId
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
      {needRepo && (
        <label className="text-xs text-gray-400">
          Repo
          <select value={repo} onChange={(e) => setRepo(e.target.value)} className={`${smallControl} mt-1`}>
            <option value="">(leave as is)</option>
            {data.unmatchedRepos.map((r) => (
              <option key={r.fullName} value={r.fullName}>
                {shortRepo(r.fullName)}
                {r.siteSlug ? ` (slug ${r.siteSlug})` : r.hasSiteConfig ? '' : ' (no site.config)'}
              </option>
            ))}
          </select>
        </label>
      )}
      {needProject && (
        <label className="text-xs text-gray-400">
          Vercel project
          <select value={project} onChange={(e) => setProject(e.target.value)} className={`${smallControl} mt-1`}>
            <option value="">(leave as is)</option>
            {data.unmatchedProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.domains[0] ? ` (${p.domains[0]})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-center gap-2 sm:col-span-2">
        <button
          type="button"
          disabled={busy || (!repo && !project)}
          onClick={() => onLink(needRepo && repo ? repo : null, needProject && project ? project : null)}
          className={`${smallButton} border-blue-700 bg-blue-900/40 hover:bg-blue-800/50`}
        >
          Link
        </button>
        <button type="button" onClick={onCancel} className={smallButton}>
          Cancel
        </button>
      </div>
    </div>
  )
}
