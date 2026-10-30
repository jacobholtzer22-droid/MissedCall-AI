'use client'

// Chat with the chief: Jacob on the right, the chief on the left (markdown),
// the job report as a card under the job's last chief message, "Chief is
// thinking" while a chief run is open, and the composer pinned to the bottom of the panel (the message list scrolls, the panel never grows past 60vh when stacked)
// (Enter sends, Shift+Enter is a new line). Photos: drop them on the panel,
// paste them, or the paperclip (the camera roll on a phone). They go through
// the same upload queue as the intake page, straight to Blob under ops-inbox/,
// and ride on the message as attachments; the chief files them on a client.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ExternalLink, Paperclip, Send } from 'lucide-react'
import { UPLOAD_CONCURRENCY } from '@/lib/ops/intake'
import { filesFromDrop } from '@/lib/ops/intake-upload'
import { inboxPath, type ChatAttachment } from '@/lib/ops/photo-filing'
import { QueueList, QueueSummary, queueBtn, uploadToBlob, useUploadQueue, type Send as QueueSend } from './UploadQueue'
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
  onSend: (body: string, attachments: ChatAttachment[]) => Promise<boolean>
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [over, setOver] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const uploadOne: QueueSend<ChatAttachment> = useCallback(async (prepared, { progress }) => {
    const blob = await uploadToBlob(inboxPath(crypto.randomUUID(), prepared.filename), prepared, { handleUploadUrl: '/api/admin/ops/hq/attachments/token' }, progress)
    return { result: { url: blob.url, filename: prepared.filename, width: prepared.width, height: prepared.height, bytes: prepared.file.size } }
  }, [])
  // kind logo: photos plus SVG, so a logo file can come along too.
  const q = useUploadQueue({ kind: 'logo', limit: UPLOAD_CONCURRENCY, send: uploadOne })
  const attachments = q.rows.flatMap((r) => (r.status === 'saved' && r.result ? [r.result] : []))
  const canSend = !sending && !q.busy && (Boolean(draft.trim()) || attachments.length > 0)
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
    if (!canSend) return
    setSending(true)
    pinned.current = true
    const ok = await onSend(draft.trim(), attachments)
    setSending(false)
    if (ok) {
      setDraft('')
      q.clear()
    }
  }

  return (
    <section
      aria-label="Chat with the chief"
      data-hq-chat
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length && !e.dataTransfer.items.length) return
        e.preventDefault()
        setOver(false)
        void filesFromDrop(e.dataTransfer).then((files) => files.length && q.add(files))
      }}
      className={`bg-gray-900 border rounded-lg flex flex-col h-[60vh] min-h-[320px] xl:min-h-0 xl:h-full ${over ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-gray-800'}`}
    >
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
        className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-4 space-y-3 text-sm"
      >
        {messages.length === 0 && !thinking && <p className="text-gray-500 py-8 text-center">Tell the chief what happened or what you need.</p>}
        {messages.map((m) => (
          <div key={m.id} className="space-y-2">
            {m.role === 'jacob' ? (
              <div className="flex justify-end">
                <div className={`max-w-[85%] rounded-lg bg-blue-600/20 border border-blue-500/30 px-3 py-2 text-gray-100 whitespace-pre-wrap break-words space-y-2 ${m.pending ? 'opacity-60' : ''}`}>
                  {m.attachments && m.attachments.length > 0 && <Thumbs list={m.attachments} />}
                  {m.body && <div>{m.body}</div>}
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
      {q.rows.length > 0 && (
        <div data-hq-queue className="shrink-0 border-t border-gray-800 px-3 pt-2 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <QueueSummary total={q.rows.length} saved={q.saved} failed={q.failed} busy={q.busy} />
            {!q.busy && (
              <button type="button" onClick={q.clear} className={queueBtn}>
                Clear
              </button>
            )}
          </div>
          <div className="max-h-40 overflow-y-auto">
            <QueueList rows={q.rows} onRetry={q.retry} />
          </div>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        className="shrink-0 border-t border-gray-800 bg-gray-900 p-3 flex items-end gap-2 rounded-b-lg"
      >
        <input
          ref={picker}
          type="file"
          multiple
          accept="image/*,.heic,.heif,.svg"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            if (e.target.files) q.add(Array.from(e.target.files))
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => picker.current?.click()}
          aria-label="Attach photos"
          className="inline-flex flex-none items-center justify-center w-11 h-11 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <label htmlFor="hq-composer" className="sr-only">
          Message the chief
        </label>
        <textarea
          id="hq-composer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files)
            if (!files.length) return
            e.preventDefault()
            q.add(files)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send()
            }
          }}
          rows={Math.min(6, Math.max(1, draft.split('\n').length))}
          placeholder={attachments.length ? 'Whose are these? (optional)' : 'Message the chief'}
          className="flex-1 resize-none bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={q.busy ? 'Send (waiting for uploads)' : 'Send'}
          className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  )
}

/** A message's photos: thumbnails that open the full image; a check once the chief filed one. */
function Thumbs({ list }: { list: ChatAttachment[] }) {
  return (
    <div className="flex flex-wrap gap-1.5" data-hq-thumbs>
      {list.map((a) => (
        <a key={a.url} href={a.url} target="_blank" rel="noreferrer" title={a.filedTo ? `${a.filename} (filed)` : a.filename} className="relative isolate block h-20 w-20 overflow-hidden rounded-md bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.url}
            alt={a.filename}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              // Unfiled inbox photos are removed after 7 days.
              e.currentTarget.style.display = 'none'
            }}
          />
          <span className="absolute inset-0 -z-10 flex items-center justify-center p-1 text-center text-[10px] leading-tight text-gray-400 break-all">{a.filename}</span>
          {a.filedTo && (
            <span className="absolute bottom-1 right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-gray-950">
              <Check className="h-3 w-3" />
            </span>
          )}
        </a>
      ))}
    </div>
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
