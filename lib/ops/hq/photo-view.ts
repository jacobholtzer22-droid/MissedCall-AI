// ===========================================
// Ops HQ: how a message's photos look to the chief
// ===========================================
// Pure. Up to BATCH_THRESHOLD photos: every unfiled one as an image block plus
// a list of url and filename it can cite in file_photos. A batch (more than
// BATCH_THRESHOLD): a count and the first BATCH_THRESHOLD unfiled photos only;
// the rest are read as text through list_inbox and filed with all: true.

import { BATCH_THRESHOLD, INBOX_MAX_AGE_DAYS, isBatch, isCaptioned, type ChatAttachment } from '@/lib/ops/photo-filing'
import type { Block } from './anthropic'

/**
 * A message with photos: the text, a list the chief can cite in file_photos,
 * and each unfiled photo as an image block (source url: the public Blob URL).
 * Filed ones are named, not shown; past INBOX_MAX_AGE_DAYS the blobs are gone.
 */
export function withPhotos(body: string, list: ChatAttachment[], sentAt: Date, allow: () => boolean, now = Date.now()): string | Block[] {
  if (!list.length) return body
  const fresh = now - sentAt.getTime() < INBOX_MAX_AGE_DAYS * 86_400_000
  if (isBatch(list.length)) return batchView(body, list, fresh, allow)
  const lines: string[] = []
  const blocks: Block[] = []
  list.forEach((a, n) => {
    const size = a.width && a.height ? `, ${a.width}x${a.height}` : ''
    if (a.filedTo) lines.push(`${n + 1}. ${a.filename}: already filed (client ${a.filedTo})`)
    else if (!fresh) lines.push(`${n + 1}. ${a.filename}: older than ${INBOX_MAX_AGE_DAYS} days, removed unfiled`)
    else {
      const shown = !/\.svg$/i.test(a.filename) && allow()
      lines.push(`${n + 1}. url=${a.url} filename=${a.filename}${size}${shown ? '' : ' (not shown)'}`)
      if (shown) blocks.push({ type: 'text', text: `Photo ${n + 1}: ${a.filename}` }, { type: 'image', source: { type: 'url', url: a.url } })
    }
  })
  return [{ type: 'text', text: `${body || '(no text)'}\n\n[Photos attached to this message]\n${lines.join('\n')}` }, ...blocks]
}

/**
 * A batch (more than BATCH_THRESHOLD photos): the count, how many are filed
 * and captioned, and only the first BATCH_THRESHOLD unfiled ones as images.
 * The rest are read through list_inbox, as text.
 */
function batchView(body: string, list: ChatAttachment[], fresh: boolean, allow: () => boolean): Block[] {
  const filed = list.filter((a) => a.filedTo).length
  const unfiled = list.filter((a) => !a.filedTo)
  const head = `${body || '(no text)'}\n\n[${list.length} photos attached to this message: ${filed} filed, ${unfiled.length} unfiled, ${unfiled.filter(isCaptioned).length} of them captioned by the Photo desk.`
  if (!fresh || !unfiled.length) return [{ type: 'text', text: `${head}${fresh ? '' : ` Older than ${INBOX_MAX_AGE_DAYS} days: unfiled ones were removed.`}]` }]
  const shown = unfiled.filter((a) => !/\.svg$/i.test(a.filename)).slice(0, BATCH_THRESHOLD).filter(() => allow())
  const blocks: Block[] = shown.flatMap((a, n) => [{ type: 'text', text: `Photo ${n + 1}: ${a.filename}` }, { type: 'image', source: { type: 'url', url: a.url } }])
  return [{ type: 'text', text: `${head} The first ${shown.length} are shown. Use list_inbox for the rest and file_photos all: true to file them.]` }, ...blocks]
}
