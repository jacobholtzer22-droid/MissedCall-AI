'use client'

// A video as a still: its poster frame with a play badge and the running time,
// linking to the clip itself (the browser plays it in a new tab). With no
// poster (the uploading browser could not play it) a dark tile with the name.
// Used by the intake page and the HQ chat bubbles.

import { Play } from 'lucide-react'
import { formatDuration } from '@/lib/ops/video-meta'

export function VideoPoster({
  url,
  posterUrl,
  filename,
  duration,
  className = '',
  small = false,
}: {
  url: string
  posterUrl?: string | null
  filename: string
  duration?: number | null
  className?: string
  /** Chat thumbnails: a smaller badge and no running time. */
  small?: boolean
}) {
  const time = formatDuration(duration)
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      data-video-poster
      title={`${filename}${time ? `, ${time}` : ''} (opens the video)`}
      className={`relative isolate block overflow-hidden bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
    >
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterUrl}
          alt={`${filename} (video)`}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => {
            // Unfiled inbox frames are removed after 7 days.
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : null}
      <span className="absolute inset-0 -z-10 flex items-end justify-center p-1 text-center text-[10px] leading-tight text-gray-400 break-all">{filename}</span>
      <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <span className={`inline-flex items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/40 ${small ? 'h-7 w-7' : 'h-11 w-11'}`}>
          <Play className={`${small ? 'h-3.5 w-3.5' : 'h-5 w-5'} translate-x-px fill-current`} />
        </span>
      </span>
      {!small && time && <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">{time}</span>}
    </a>
  )
}
