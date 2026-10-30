'use client'

// The intake page's uploader: the shared upload queue (../../UploadQueue)
// with a drop zone and picker. Files go straight from the browser to Vercel
// Blob (a token from .../assets/token), never through a function body, then
// register with POST .../assets, which writes the record only once Blob has
// the file. The logo takes one file at a time.

import { useCallback, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { UPLOAD_CONCURRENCY, uploadPath, type Intake, type UploadKind } from '@/lib/ops/intake'
import { filesFromDrop } from '@/lib/ops/intake-upload'
import { QueueList, QueueSummary, queueBtn, uploadToBlob, useUploadQueue, type Send } from '../../UploadQueue'

export function Uploader({ engagementId, kind, hasLogo, onSaved }: { engagementId: string; kind: Exclude<UploadKind, 'document'>; hasLogo?: boolean; onSaved: (i: Intake) => void }) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const base = `/api/admin/ops/engagements/${engagementId}`

  const send: Send<null> = useCallback(
    async (prepared, { progress, saving }) => {
      const blob = await uploadToBlob(uploadPath(engagementId, crypto.randomUUID(), prepared.filename), prepared, { handleUploadUrl: `${base}/assets/token`, clientPayload: JSON.stringify({ kind }) }, progress)
      saving()
      const res = await fetch(`${base}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: blob.url, filename: prepared.filename, kind, width: prepared.width ?? undefined, height: prepared.height ?? undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`Uploaded but not saved: ${String(data.error ?? `HTTP ${res.status}`)}`)
      onSaved(data.intake)
      return { result: null, savedAs: data.asset?.filename }
    },
    [base, engagementId, kind, onSaved]
  )
  const q = useUploadQueue({ kind, limit: kind === 'logo' ? 1 : UPLOAD_CONCURRENCY, send })
  const add = (files: File[]) => q.add(kind === 'logo' ? files.slice(0, 1) : files)

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
        <button type="button" onClick={() => input.current?.click()} className={queueBtn}>
          <ImagePlus className="h-4 w-4" /> {kind === 'logo' ? (hasLogo ? 'Replace the logo' : 'Add the logo') : 'Add photos'}
        </button>
        <p className="mt-2 text-xs text-gray-500">
          or drop {kind === 'logo' ? 'it' : 'them (or a folder)'} here. JPG, PNG, WebP or HEIC{kind === 'logo' ? ' or SVG' : ''}, up to 40 MB each. HEIC is converted and big photos are shrunk before upload.
        </p>
      </div>

      {q.rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <QueueSummary total={q.rows.length} saved={q.saved} failed={q.failed} busy={q.busy} />
            {!q.busy && (
              <button type="button" onClick={q.clear} className={queueBtn}>
                Clear list
              </button>
            )}
          </div>
          <QueueList rows={q.rows} onRetry={q.retry} />
        </div>
      )}
    </div>
  )
}
