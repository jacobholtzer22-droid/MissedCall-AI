// ===========================================
// Ops HQ: the photo desk (captioning runs)
// ===========================================
// A background run (agent photo, mode work) that looks at unfiled inbox photos
// PHOTOS_PER_TURN at a time and writes onto each one: caption, suggested
// service, hero score, before/after guess, logo, face or plate. Started by the
// message route when one message carries more than BATCH_THRESHOLD photos, or
// by the chief's caption_photos. Each turn's captions are saved before the
// next turn, so a crash keeps what was done and a new run picks up the rest.
// When it ends the job is handed to onSpecialistRunEnded, which wakes the
// chief to file them (the same path as an ads or web run).
//
// Model: OPS_PHOTO_MODEL (default claude-sonnet-5-5), key ANTHROPIC_API_KEY_BUILDS.

import { db } from '@/lib/db'
import { captionInChunks, cleanCaption, type InboxEntry, type PhotoCaption } from '@/lib/ops/photo-filing'
import { AGENT_MODEL_DEFAULT, type Block, streamMessage } from './anthropic'
import { emit } from './events'
import { adoptUnsent, listInbox, writeCaptions } from './inbox'
import { onSpecialistRunEnded } from './jobs'
import { createRun, failRun, finishRun } from './runs'

export const PHOTOS_PER_TURN = 10
/** A photo run still at running after this long died with its function; it is failed so a new one can start. */
const STALE_MS = 20 * 60_000

const photoModel = () => process.env.OPS_PHOTO_MODEL?.trim() || AGENT_MODEL_DEFAULT

const SYSTEM = `You caption photos a local service business sent its marketing agency, for its website. You are not told the business, the town or the jobs, and you never name or guess any of them.

For each photo, by its number, call record_captions once with every photo in this message:
- caption: what is in the frame, one plain sentence of 12 to 18 words (never more than 20). The work, the surface, the material, the setting. No town, street, customer, brand you cannot read, or job you were not told. No em dashes.
- suggestedService: the trade service it shows in two to four words ("Interior painting", "Roofline lighting"), or empty when it shows none (a truck, a team photo, a logo).
- heroScore 0 to 5: how well it works as the wide image at the top of the home page. 5 is a sharp, bright, wide shot of finished work; 0 is a close-up, a dark or blurry shot, a screenshot, a document or a logo.
- beforeAfter: "before" when it plainly shows the job not done yet, "after" when it plainly shows finished work next to a before shot or clearly staged as the result, otherwise empty.
- isLogo: true only for the business logo or a graphic of it.
- hasFaceOrPlate: true when any person's face or any readable licence plate is in the frame.`

const RECORD_TOOL: Block = {
  type: 'custom',
  name: 'record_captions',
  description: 'Record one result per photo number in this message.',
  input_schema: {
    type: 'object',
    properties: {
      photos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            n: { type: 'integer', description: 'The photo number.' },
            caption: { type: 'string' },
            suggestedService: { type: 'string' },
            heroScore: { type: 'integer', minimum: 0, maximum: 5 },
            beforeAfter: { type: 'string', enum: ['before', 'after', ''] },
            isLogo: { type: 'boolean' },
            hasFaceOrPlate: { type: 'boolean' },
          },
          required: ['n', 'caption', 'suggestedService', 'heroScore', 'beforeAfter', 'isLogo', 'hasFaceOrPlate'],
        },
      },
    },
    required: ['photos'],
  },
}

/** One model turn: up to PHOTOS_PER_TURN photos as image blocks, results keyed by url. */
export async function captionChunk(chunk: InboxEntry[]): Promise<Map<string, PhotoCaption>> {
  const content: Block[] = [{ type: 'text', text: `${chunk.length} photos. Caption every one with record_captions.` }]
  chunk.forEach((e, n) => {
    content.push({ type: 'text', text: `Photo ${n + 1}: ${e.filename}` })
    if (/\.svg$/i.test(e.filename)) content.push({ type: 'text', text: '(an SVG file: treat it as a logo or graphic, heroScore 0)' })
    else content.push({ type: 'image', source: { type: 'url', url: e.url } })
  })
  const res = await streamMessage({ model: photoModel(), system: SYSTEM, messages: [{ role: 'user', content }], tools: [RECORD_TOOL], effort: 'low', maxTokens: 8000 }, () => undefined)
  if (res.stopReason === 'refusal') throw new Error('the model declined to caption these photos')
  const use = res.content.find((b) => b.type === 'tool_use' && b.name === 'record_captions')
  const rows = Array.isArray((use?.input as { photos?: unknown })?.photos) ? ((use!.input as { photos: Record<string, unknown>[] }).photos) : []
  const now = new Date()
  const out = new Map<string, PhotoCaption>()
  for (const r of rows) {
    const entry = chunk[Math.round(Number(r.n)) - 1]
    const c = entry && cleanCaption(r, now)
    if (entry && c && !out.has(entry.url)) out.set(entry.url, c)
  }
  return out
}

/** The running photo run, if any. One that outlived STALE_MS is failed first. */
export async function activePhotoRun() {
  await db.agentRun.updateMany({
    where: { agent: 'photo', status: 'running', startedAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: 'failed', finishedAt: new Date(), error: 'Timed out; captions saved so far are kept' },
  })
  const run = await db.agentRun.findFirst({ where: { agent: 'photo', status: 'running' }, orderBy: { createdAt: 'desc' }, select: { id: true, output: true } })
  if (!run) return null
  const out = (run.output ?? {}) as { done?: number; total?: number }
  return { id: run.id, done: out.done ?? 0, total: out.total ?? 0 }
}

/** Start a photo run on the unfiled, uncaptioned photos among urls (all of them when urls is empty). */
export async function startPhotoRun(opts: { jobId: string | null; urls?: string[]; messageId?: string | null }) {
  if (await activePhotoRun()) throw new Error('a photo run is already captioning; wait for it to finish')
  const targets = await photoTargets(opts.urls)
  if (!targets.length) throw new Error('every unfiled photo there is already captioned')
  const run = await createRun({ agent: 'photo', kind: 'photo_caption', mode: 'work', engagementId: null, jobId: opts.jobId, input: { urls: targets.map((t) => t.url), messageId: opts.messageId ?? null } })
  await db.agentRun.update({ where: { id: run.id }, data: { output: { done: 0, total: targets.length } } })
  return { run, count: targets.length }
}

async function photoTargets(urls?: string[]) {
  const want = urls?.length ? new Set(urls) : null
  return (await listInbox()).filter((e) => !e.caption && (!want || want.has(e.url)))
}

const progressLine = (done: number, total: number) => `Captioning ${total} photo${total === 1 ? '' : 's'}, ${done} done`

export async function runPhotoRun(runId: string) {
  const run = await db.agentRun.findUniqueOrThrow({ where: { id: runId }, select: { input: true, jobId: true } })
  const input = (run.input ?? {}) as { urls?: string[] }
  try {
    // Unsent blobs go onto a message first: captions live on message attachments.
    const targets = await adoptUnsent(await photoTargets(input.urls))
    await emit(runId, 'status', progressLine(0, targets.length))
    const r = await captionInChunks({
      entries: targets,
      chunkSize: PHOTOS_PER_TURN,
      caption: captionChunk,
      save: writeCaptions,
      progress: async (done, total) => {
        await db.agentRun.updateMany({ where: { id: runId, status: 'running' }, data: { output: { done, total } } })
        await emit(runId, 'status', progressLine(done, total))
      },
      stopped: async () => (await db.agentRun.findUnique({ where: { id: runId }, select: { status: true } }))?.status !== 'running',
    })
    if (r.stopped) await emit(runId, 'status', `Stopped with ${r.done} of ${targets.length} captioned`)
    await finishRun(runId, { done: r.done, total: targets.length, missed: r.missed.length, stopped: r.stopped })
  } catch (err) {
    await failRun(runId, err)
  }
  if (run.jobId) await onSpecialistRunEnded(run.jobId).catch((err) => console.error('[hq/photo] wake chief failed:', err instanceof Error ? err.message : err))
}
