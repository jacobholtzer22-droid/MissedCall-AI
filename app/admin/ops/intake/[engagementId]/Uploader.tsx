'use client'

// The intake page's upload queue. Files go straight from the browser to
// Vercel Blob (a token from .../assets/token), never through a function body.
// Each file is checked (type, 40 MB), prepared (HEIC to JPEG, long side down
// to 2400 px; lib/ops/intake-upload.ts), uploaded, then registered with
// POST .../assets, which writes the record only once Blob has the file.
// UPLOAD_CONCURRENCY run at once. Every file gets a row that ends in Saved or
// a red reason; nothing fails silently.

import { useCallback, useEffect, useRef, useState } from 'react'
import { upload } from '@vercel/blob/client'
import { Check, ImageIcon, ImagePlus, RotateCw } from 'lucide-react'
import { UPLOAD_CONCURRENCY, fileType, formatBytes, isHeic, rejectReason, uploadPath, type Intake, type UploadKind } from '@/lib/ops/intake'
import { filesFromDrop, prepareFile } from '@/lib/ops/intake-upload'

type Status = 'waiting' | 'preparing' | 'uploading' | 'saving' | 'saved' | 'failed'
type Row = {
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
}

const ACTIVE: Status[] = ['preparing', 'uploading', 'saving']

const btn =
  'inline-flex items-center justify-center gap-1 px-3 min-h-[44px] rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-200 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'

/** A reason a person can act on, from whatever the upload threw. */
function uploadReason(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err)
  if (/client token/i.test(m)) return 'Token refused: signed out, or the server would not take this file'
  if (/content type mismatch/i.test(m)) return 'Bad type: storage would not take this file type'
  if (/too large/i.test(m)) return 'Too large for storage'
  if (/expired/i.test(m)) return 'Token expired: retry'
  return `Network: ${m || 'the upload did not finish'}`
}

export function Uploader({ engagementId, kind, hasLogo, onSaved }: { engagementId: string; kind: Exclude<UploadKind, 'document'>; hasLogo?: boolean; onSaved: (i: Intake) => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const rowsRef = useRef<Row[]>([])
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const base = `/api/admin/ops/engagements/${engagementId}`
  const limit = kind === 'logo' ? 1 : UPLOAD_CONCURRENCY

  const update = useCallback((id: string, patch: Partial<Row>) => {
    rowsRef.current = rowsRef.current.map((r) => (r.id === id ? { ...r, ...patch } : r))
    setRows(rowsRef.current)
  }, [])

  const run = useCallback(
    async (row: Row) => {
      let stage: 'prepare' | 'upload' | 'save' = 'prepare'
      try {
        const prepared = await prepareFile(row.file)
        if (!row.thumb) update(row.id, { thumb: URL.createObjectURL(prepared.file) })
        stage = 'upload'
        update(row.id, { status: 'uploading', progress: 0 })
        const blob = await upload(uploadPath(engagementId, crypto.randomUUID(), prepared.filename), prepared.file, {
          access: 'public',
          handleUploadUrl: `${base}/assets/token`,
          clientPayload: JSON.stringify({ kind }),
          contentType: prepared.contentType,
          multipart: prepared.file.size > 8 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => update(row.id, { progress: Math.round(percentage) }),
        })
        stage = 'save'
        update(row.id, { status: 'saving', progress: 100 })
        const res = await fetch(`${base}/assets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: blob.url, filename: prepared.filename, kind, width: prepared.width ?? undefined, height: prepared.height ?? undefined }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(String(data.error ?? `HTTP ${res.status}`))
        onSaved(data.intake)
        update(row.id, { status: 'saved', savedAs: data.asset?.filename !== row.name ? data.asset?.filename : undefined })
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err)
        const reason = stage === 'prepare' ? m : stage === 'upload' ? uploadReason(err) : `Uploaded but not saved: ${m}`
        update(row.id, { status: 'failed', reason, retryable: true })
      }
    },
    [base, engagementId, kind, onSaved, update]
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

  const add = (files: File[]) => {
    const list = kind === 'logo' ? files.slice(0, 1) : files
    const added: Row[] = list.map((f) => {
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
  }

  const retry = (id: string) => update(id, { status: 'waiting', progress: 0, reason: undefined, retryable: undefined })
  const clear = () => {
    rowsRef.current.forEach((r) => r.thumb && URL.revokeObjectURL(r.thumb))
    rowsRef.current = []
    setRows([])
  }

  const saved = rows.filter((r) => r.status === 'saved').length
  const failed = rows.filter((r) => r.status === 'failed').length

  return (
    <div className="space-y-3">
      <div
        data-intake-drop={kind}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void filesFromDrop(e.dataTransfer).then(add)
        }}
        className={`rounded-lg border-2 border-dashed p-5 text-center text-sm ${over ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700'}`}
      >
        <input
          ref={input}
          type="file"
          multiple={kind === 'photo'}
          accept={kind === 'logo' ? 'image/*,.heic,.heif,.svg' : 'image/*,.heic,.heif'}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) add(Array.from(e.target.files))
            e.target.value = ''
          }}
        />
        <button type="button" onClick={() => input.current?.click()} className={btn}>
          <ImagePlus className="h-4 w-4" /> {kind === 'logo' ? (hasLogo ? 'Replace the logo' : 'Add the logo') : 'Add photos'}
        </button>
        <p className="mt-2 text-xs text-gray-500">
          or drop {kind === 'logo' ? 'it' : 'them (or a folder)'} here. JPG, PNG, WebP or HEIC{kind === 'logo' ? ' or SVG' : ''}, up to 40 MB each. HEIC is converted and big photos are shrunk before upload.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p aria-live="polite" className={`text-sm ${failed ? 'text-red-300' : busy ? 'text-gray-300' : 'text-emerald-300'}`}>
              {saved} of {rows.length} saved{failed ? `, ${failed} not saved` : ''}
              {busy ? '. Uploading…' : '.'}
            </p>
            {!busy && (
              <button type="button" onClick={clear} className={btn}>
                Clear list
              </button>
            )}
          </div>
          <ul className="divide-y divide-gray-800 rounded-lg border border-gray-800 bg-gray-950">
            {rows.map((r) => (
              <QueueRow key={r.id} row={r} onRetry={() => retry(r.id)} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function QueueRow({ row: r, onRetry }: { row: Row; onRetry: () => void }) {
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
        <button type="button" onClick={onRetry} aria-label={`Retry ${r.name}`} className={`${btn} flex-none`}>
          <RotateCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </li>
  )
}
