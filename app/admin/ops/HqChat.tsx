'use client'

// Chat with the chief: Jacob on the right, the chief on the left (markdown),
// the job report as a card under the job's last chief message, "Chief is
// thinking" while a chief run is open, and the composer pinned at the bottom
// (Enter sends, Shift+Enter is a new line).

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Send } from 'lucide-react'
import { personaFor, PERSONAS } from '@/lib/ops/hq/personas'
import { Avatar, Markdown, type FeedJob, type FeedMessage, type ReportSection } from './hqShared'

const chief = personaFor('chief') ?? PERSONAS[0]

export function Chat({
  messages,
  jobs,
  thinking,
  onSend,
}: {
  messages: FeedMessage[]
  jobs: FeedJob[]
  thinking: boolean
  onSend: (body: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // The report card goes under the last chief message of its job.
  const reportAfter = new Map<string, FeedJob>()
  for (const job of jobs) {
    if (!job.report) continue
    const last = [...messages].reverse().find((m) => m.jobId === job.id && m.role === 'chief')
    if (last) reportAfter.set(last.id, job)
  }

  useEffect(() => {
    const el = listRef.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [messages.length, thinking, jobs])

  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    pinned.current = true
    const ok = await onSend(body)
    setSending(false)
    if (ok) setDraft('')
  }

  return (
    <section aria-label="Chat with the chief" className="bg-gray-900 border border-gray-800 rounded-lg flex flex-col min-h-[60vh] lg:min-h-0 lg:h-full">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
        <Avatar persona={chief} size={24} />
        <h2 className="text-sm font-semibold text-gray-100">{chief.name}</h2>
      </div>
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
        }}
        className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-3 text-sm"
      >
        {messages.length === 0 && !thinking && <p className="text-gray-500 py-8 text-center">Tell the chief what happened or what you need.</p>}
        {messages.map((m) => (
          <div key={m.id} className="space-y-2">
            {m.role === 'jacob' ? (
              <div className="flex justify-end">
                <div className={`max-w-[85%] rounded-lg bg-blue-600/20 border border-blue-500/30 px-3 py-2 text-gray-100 whitespace-pre-wrap break-words ${m.pending ? 'opacity-60' : ''}`}>
                  {m.body}
                </div>
              </div>
            ) : (
              <div className="flex gap-2 items-start">
                <Avatar persona={chief} size={28} />
                <div className="max-w-[85%] rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-gray-300">
                  <Markdown text={m.body} />
                </div>
              </div>
            )}
            {reportAfter.has(m.id) && <ReportCard job={reportAfter.get(m.id)!} />}
          </div>
        ))}
        {thinking && (
          <div className="flex items-center gap-2 text-xs text-gray-500 pl-1" aria-live="polite">
            <span className="hq-pulse h-1.5 w-1.5 rounded-full bg-blue-400" />
            {chief.name} is thinking
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        className="sticky bottom-0 border-t border-gray-800 bg-gray-900 p-3 flex items-end gap-2 rounded-b-lg"
      >
        <label htmlFor="hq-composer" className="sr-only">
          Message the chief
        </label>
        <textarea
          id="hq-composer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send()
            }
          }}
          rows={Math.min(6, Math.max(1, draft.split('\n').length))}
          placeholder="Message the chief"
          className="flex-1 resize-none bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Send"
          className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  )
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : typeof v === 'string' && v.trim() ? [v] : [])

/**
 * The job report: per agent Did, Expect, Waiting for Push and links. Also used
 * by History, as a snapshot: the pending count is left out there and the list
 * reads "Queued for Push", since the approval rows show what happened after.
 */
export function ReportCard({ job, className = 'ml-9', snapshot = false }: { job: Pick<FeedJob, 'report'>; className?: string; snapshot?: boolean }) {
  const report = job.report!
  return (
    <div className={`${className} rounded-lg border border-gray-800 bg-gray-950`}>
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-200">Job report</span>
        {!snapshot && report.pendingApprovals > 0 && (
          <span className="text-xs text-amber-300 tabular-nums">{report.pendingApprovals} waiting for Push</span>
        )}
      </div>
      <div className="divide-y divide-gray-800">
        {report.sections.map((s: ReportSection, n) => {
          const p = personaFor(s.agent)
          const did = asList(s.did)
          const waiting = typeof s.waitingForPush === 'number' ? [] : asList(s.waitingForPush)
          const questions = asList(s.questions)
          const links = (s.links ?? []).filter((l) => typeof l?.url === 'string' && /^https?:\/\//.test(l.url))
          return (
            <div key={n} className="px-3 py-2.5 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                {p && <Avatar persona={p} size={20} />}
                <span className="font-medium text-gray-100">{p?.name ?? s.agent ?? 'Agent'}</span>
                {s.client && <span className="text-gray-500 truncate">{s.client}</span>}
              </div>
              {did.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500">Did</div>
                  <ul className="list-disc pl-5 text-gray-300 space-y-0.5">
                    {did.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
              {s.expect && (
                <div>
                  <div className="text-xs text-gray-500">Expect</div>
                  <p className="text-gray-300">{s.expect}</p>
                </div>
              )}
              {waiting.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500">{snapshot ? 'Queued for Push' : 'Waiting for Push'}</div>
                  <ul className={`list-disc pl-5 space-y-0.5 ${snapshot ? 'text-gray-300' : 'text-amber-200'}`}>
                    {waiting.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {questions.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500">Questions for you</div>
                  <ul className="list-disc pl-5 text-sky-200 space-y-0.5">
                    {questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
              {links.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {links.map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 min-h-[44px] text-blue-400 hover:text-blue-300">
                      {l.label || 'Link'} <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
