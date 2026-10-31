'use client'

// The upload queue shared by the intake page (./intake/[engagementId]/Uploader)
// and the HQ composer (./HqChat). Each file is checked (type, 40 MB), prepared
// in the browser (HEIC to JPEG, long side down to 2400 px;
// lib/ops/intake-upload.ts), then handed to the caller's send(), which uploads
// it straight to Vercel Blob and does whatever comes next. UPLOAD_CONCURRENCY
// run at once. Every file gets a row that ends in Saved or a red reason, with
// Retry; nothing fails silently.

import { useCallback, useEffect, useRef, useState } from 'react'
import { upload } from '@vercel/blob/client'
import type { PutBlobResult } from '@vercel/blob'
import { Check, ImageIcon, RotateCw } from 'lucide-react'
import { fileType, formatBytes, isHeic, rejectReason, type UploadKind } from '@/lib/ops/intake'
import { prepareFile, type Prepared } from '@/lib/ops/intake-upload'

type Status = 'waiting' | 'preparing' | 'uploading' | 'saving' | 'saved' | 'failed'
export type QueueRow<T> = {
  id: string
  file: File
  name: string
  size: number
  status: Status
  progress: number
  reason?: string
  retryable?: boolean
  thumb?: string
  savedAs?: string
  result?: T
}

const ACTIVE: Status[] = ['preparing', 'uploading', 'saving']

export const queueBtn =
  'inline-flex items-center justify-center gap-1 px-3 min-h-[44px] rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-200 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'

/** A reason a person can act on, from whatever the Blob upload threw. */
function uploadReason(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err)
  if (/client token/i.test(m)) return 'Token refused: signed out, or the server would not take this file'
  if (/content type mismatch/i.test(m)) return 'Bad type: storage would not take this file type'
  if (/too large/i.test(m)) return 'Too large for storage'
  if (/expired/i.test(m)) return 'Token expired: retry'
  return `Network: ${m || 'the upload did not finish'}`
}

/** Upload one prepared file straight to Blob; throws with a readable reason. */
export async function uploadToBlob(
  pathname: string,
  prepared: Prepared,
  opts: { handleUploadUrl: string; clientPayload?: string },
  onProgress: (percent: number) => void
): Promise<PutBlobResult> {
  try {
    return await upload(pathname, prepared.file, {
      access: 'public',
      handleUploadUrl: opts.handleUploadUrl,
      ...(opts.clientPayload ? { clientPayload: opts.clientPayload } : {}),
      contentType: prepared.contentType,
      multipart: prepared.file.size > 8 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => onProgress(Math.round(percentage)),
    })
  } catch (err) {
    throw new Error(uploadReason(err))
  }
}

/**
 * send() uploads and finishes one prepared file. It calls saving() once the
 * bytes are in Blob and it moves on to registering them (if it does).
 */
export type Send<T> = (prepared: Prepared, hooks: { progress: (percent: number) => void; saving: () => void }) => Promise<{ result: T; savedAs?: string }>

export function useUploadQueue<T>({ kind, limit, send }: { kind: UploadKind; limit: number; send: Send<T> }) {
  const [rows, setRows] = useState<QueueRow<T>[]>([])
  const rowsRef = useRef<QueueRow<T>[]>([])

  const update = useCallback((id: string, patch: Partial<QueueRow<T>>) => {
    rowsRef.current = rowsRef.current.map((r) => (r.id === id ? { ...r, ...patch } : r))
    setRows(rowsRef.current)
  }, [])

  const run = useCallback(
    async (row: QueueRow<T>) => {
      try {
        const prepared = await prepareFile(row.file)
        if (!row.thumb && prepared.contentType.startsWith('image/')) update(row.id, { thumb: URL.createObjectURL(prepared.file) })
        update(row.id, { status: 'uploading', progress: 0 })
        const done = await send(prepared, {
          progress: (progress) => update(row.id, { progress }),
          saving: () => update(row.id, { status: 'saving', progress: 100 }),
        })
        update(row.id, { status: 'saved', result: done.result, savedAs: done.savedAs && done.savedAs !== row.name ? done.savedAs : undefined })
      } catch (err) {
        update(row.id, { status: 'failed', reason: err instanceof Error ? err.message : String(err), retryable: true })
      }
    },
    [send, update]
  )

  // Start waiting rows whenever a slot is free. Reads the ref, not `rows`, so
  // a second run of this effect can never start the same file twice.
  useEffect(() => {
    const now = rowsRef.current
    const active = now.filter((r) => ACTIVE.includes(r.status)).length
    const next = now.filter((r) => r.status === 'waiting').slice(0, Math.max(0, limit - active))
    for (const r of next) {
      update(r.id, { status: 'preparing' })
      void run(r)
    }
  }, [rows, limit, run, update])

  const busy = rows.some((r) => r.status === 'waiting' || ACTIVE.includes(r.status))

  // Leaving mid-batch would drop the rest.
  useEffect(() => {
    if (!busy) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

  useEffect(() => () => rowsRef.current.forEach((r) => r.thumb && URL.revokeObjectURL(r.thumb)), [])

  const add = useCallback(
    (files: File[]) => {
      const added: QueueRow<T>[] = files.map((f) => {
        const reason = rejectReason(f, kind)
        const type = fileType(f.name, f.type)
        return {
          id: crypto.randomUUID(),
          file: f,
          name: f.name,
          size: f.size,
          status: reason ? 'failed' : 'waiting',
          progress: 0,
          ...(reason ? { reason } : {}),
          ...(!reason && type.startsWith('image/') && !isHeic(type) ? { thumb: URL.createObjectURL(f) } : {}),
        }
      })
      rowsRef.current = [...rowsRef.current, ...added]
      setRows(rowsRef.current)
    },
    [kind]
  )

  const retry = useCallback((id: string) => update(id, { status: 'waiting', progress: 0, reason: undefined, retryable: undefined }), [update])
  const remove = useCallback((ids: string[]) => {
    const drop = new Set(ids)
    rowsRef.current.forEach((r) => drop.has(r.id) && r.thumb && URL.revokeObjectURL(r.thumb))
    rowsRef.current = rowsRef.current.filter((r) => !drop.has(r.id))
    setRows(rowsRef.current)
  }, [])
  const clear = useCallback(() => {
    rowsRef.current.forEach((r) => r.thumb && URL.revokeObjectURL(r.thumb))
    rowsRef.current = []
    setRows([])
  }, [])

  const saved = rows.filter((r) => r.status === 'saved').length
  const failed = rows.filter((r) => r.status === 'failed').length
  return { rows, add, retry, remove, clear, busy, saved, failed }
}

/** "10 of 12 saved, 2 not saved." */
export function QueueSummary({ total, saved, failed, busy }: { total: number; saved: number; failed: number; busy: boolean }) {
  return (
    <p aria-live="polite" className={`text-sm ${failed ? 'text-red-300' : busy ? 'text-gray-300' : 'text-emerald-300'}`}>
      {saved} of {total} saved{failed ? `, ${failed} not saved` : ''}
      {busy ? '. Uploading…' : '.'}
    </p>
  )
}

export function QueueList<T>({ rows, onRetry }: { rows: QueueRow<T>[]; onRetry: (id: string) => void }) {
  return (
    <ul className="divide-y divide-gray-800 rounded-lg border border-gray-800 bg-gray-950">
      {rows.map((r) => (
        <QueueRowView key={r.id} row={r} onRetry={() => onRetry(r.id)} />
      ))}
    </ul>
  )
}

function QueueRowView<T>({ row: r, onRetry }: { row: QueueRow<T>; onRetry: () => void }) {
  const label =
    r.status === 'waiting'
      ? 'Waiting'
      : r.status === 'preparing'
        ? 'Preparing…'
        : r.status === 'uploading'
          ? `Uploading ${r.progress}%`
          : r.status === 'saving'
            ? 'Saving…'
            : null
  return (
    <li data-intake-row={r.status} className="flex items-center gap-3 p-2">
      <div className="h-12 w-12 flex-none overflow-hidden rounded-md bg-gray-800 flex items-center justify-center">
        {r.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-5 w-5 text-gray-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-gray-200" title={r.name}>
          {r.name}
        </p>
        <p className="text-xs text-gray-500 tabular-nums">{formatBytes(r.size)}</p>
        {label && (
          <div className="mt-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
              <div
                className={`h-full rounded-full bg-blue-500 transition-[width] ${r.status === 'preparing' || r.status === 'waiting' ? 'opacity-40' : ''}`}
                style={{ width: `${r.status === 'uploading' ? r.progress : r.status === 'saving' ? 100 : r.status === 'preparing' ? 8 : 0}%` }}
              />
            </div>
            <p className="mt-0.5 text-xs text-gray-400">{label}</p>
          </div>
        )}
        {r.status === 'saved' && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-300">
            <Check className="h-3.5 w-3.5" /> Saved{r.savedAs ? ` as ${r.savedAs}` : ''}
          </p>
        )}
        {r.status === 'failed' && <p className="mt-0.5 text-xs text-red-400">{r.reason}</p>}
      </div>
      {r.status === 'failed' && r.retryable && (
        <button type="button" onClick={onRetry} aria-label={`Retry ${r.name}`} className={`${queueBtn} flex-none`}>
          <RotateCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </li>
  )
}
