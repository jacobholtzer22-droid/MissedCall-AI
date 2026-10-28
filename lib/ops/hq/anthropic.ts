// ===========================================
// Ops HQ — streaming Messages API client (raw fetch)
// ===========================================
// Raw fetch on purpose: the repo's @anthropic-ai/sdk (0.52) stays pinned for
// the SMS webhook, and it predates server-side fallbacks.
//
// POST https://api.anthropic.com/v1/messages with stream: true. The SSE stream
// is parsed here and each content block is rebuilt from its start + deltas;
// onBlock fires the moment a block stops, which is what makes the HQ feed live.
// Blocks are returned exactly as received (thinking signatures included) so the
// loop can append them back unchanged.
//
// Key: ANTHROPIC_API_KEY_BUILDS, read by name, never logged.

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
/** Models that take server-side fallbacks: on a policy decline the API re-runs the request on a fallback model. */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5'])

export const CHIEF_MODEL_DEFAULT = 'claude-opus-5-5'
export const AGENT_MODEL_DEFAULT = 'claude-sonnet-5-5'

export type Block = { type: string; [key: string]: unknown }
export type ApiMessage = { role: 'user' | 'assistant'; content: string | Block[] }
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type MessageRequest = {
  model: string
  system: string
  messages: ApiMessage[]
  /** Client tools, in a fixed order so the prompt cache holds. */
  tools?: Block[]
  effort?: Effort
  maxTokens?: number
}

export type StreamResult = {
  content: Block[]
  stopReason: string | null
  stopDetails: { category?: string | null; explanation?: string | null } | null
  model: string | null
  usage: Record<string, unknown>
}

export class AnthropicError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean
  ) {
    super(message)
  }
}

export function hqApiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY_BUILDS?.trim() || null
}

/** Stream one Messages request. onBlock gets each completed content block, in order. */
export async function streamMessage(
  req: MessageRequest,
  onBlock: (block: Block) => Promise<void> | void
): Promise<StreamResult> {
  const key = hqApiKey()
  if (!key) throw new AnthropicError('ANTHROPIC_API_KEY_BUILDS is not set', null, false)

  const betas: string[] = []
  const fallbacks = FALLBACK_MODELS.has(req.model)
  if (fallbacks) betas.push(FALLBACK_BETA)

  const body = {
    model: req.model,
    max_tokens: req.maxTokens ?? 32000,
    stream: true,
    system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
    messages: req.messages,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: req.effort ?? 'medium' },
    ...(req.tools?.length ? { tools: req.tools } : {}),
    ...(fallbacks ? { fallbacks: 'default' } : {}),
  }

  // 429, 529 and 5xx are retried with backoff (retry-after when given); the stream itself is not resumed.
  let res: Response | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        ...(betas.length ? { 'anthropic-beta': betas.join(',') } : {}),
      },
      body: JSON.stringify(body),
    })
    if (res.ok) break
    const retryable = res.status === 429 || res.status === 529 || res.status >= 500
    const text = await res.text().catch(() => '')
    if (!retryable || attempt === 3) throw new AnthropicError(`Anthropic HTTP ${res.status}: ${errorMessage(text)}`, res.status, retryable)
    const after = Number(res.headers.get('retry-after'))
    await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 60) * 1000 : 2000 * 2 ** attempt)
  }
  if (!res?.body) throw new AnthropicError('Anthropic returned no body', res?.status ?? null, true)

  const result: StreamResult = { content: [], stopReason: null, stopDetails: null, model: null, usage: {} }
  const open = new Map<number, { block: Block; json: string }>()

  const handle = async (event: string, data: Record<string, unknown>) => {
    switch (event) {
      case 'message_start': {
        const m = data.message as Record<string, unknown>
        result.model = (m?.model as string) ?? null
        result.usage = { ...((m?.usage as Record<string, unknown>) ?? {}) }
        break
      }
      case 'content_block_start':
        open.set(data.index as number, { block: { ...(data.content_block as Block) }, json: '' })
        break
      case 'content_block_delta': {
        const slot = open.get(data.index as number)
        const d = data.delta as Record<string, unknown>
        if (!slot || !d) break
        if (d.type === 'text_delta') slot.block.text = String(slot.block.text ?? '') + String(d.text ?? '')
        else if (d.type === 'thinking_delta') slot.block.thinking = String(slot.block.thinking ?? '') + String(d.thinking ?? '')
        else if (d.type === 'signature_delta') slot.block.signature = d.signature
        else if (d.type === 'input_json_delta') slot.json += String(d.partial_json ?? '')
        else if (d.type === 'citations_delta') slot.block.citations = [...((slot.block.citations as unknown[]) ?? []), d.citation]
        break
      }
      case 'content_block_stop': {
        const idx = data.index as number
        const slot = open.get(idx)
        if (!slot) break
        open.delete(idx)
        if (slot.json) {
          // Strict parse. A tool_use whose input does not parse keeps the raw text so the loop can return an error result.
          try {
            slot.block.input = JSON.parse(slot.json)
          } catch {
            slot.block.input = {}
            slot.block._invalidInput = slot.json
          }
        }
        result.content[idx] = slot.block
        await onBlock(slot.block)
        break
      }
      case 'message_delta': {
        const d = data.delta as Record<string, unknown>
        result.stopReason = (d?.stop_reason as string) ?? result.stopReason
        result.stopDetails = (d?.stop_details as StreamResult['stopDetails']) ?? result.stopDetails
        result.usage = { ...result.usage, ...((data.usage as Record<string, unknown>) ?? {}) }
        break
      }
      case 'error': {
        const e = data.error as Record<string, unknown>
        const type = String(e?.type ?? 'error')
        throw new AnthropicError(`Anthropic stream error: ${type}: ${String(e?.message ?? '')}`, null, type === 'overloaded_error')
      }
    }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let cut: number
    while ((cut = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, cut)
      buffer = buffer.slice(cut + 2)
      let event = 'message'
      let data = ''
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data || event === 'ping') continue
      await handle(event, JSON.parse(data))
    }
  }
  result.content = result.content.filter(Boolean)
  return result
}

/** The raw text of a tool_use input that did not parse, if any. */
export function invalidInput(block: Block): string | null {
  return typeof block._invalidInput === 'string' ? block._invalidInput : null
}

/** A copy of a block safe to send back: no client-only keys. */
export function forApi(block: Block): Block {
  if (!('_invalidInput' in block)) return block
  const { _invalidInput: _drop, ...rest } = block
  return rest as Block
}

function errorMessage(text: string): string {
  try {
    const j = JSON.parse(text) as { error?: { message?: string } }
    return j.error?.message ?? text.slice(0, 300)
  } catch {
    return text.slice(0, 300)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
