// ===========================================
// Ops HQ — the agent loop shared by the chief and the specialists
// ===========================================
// One AgentRun, up to MAX_TURNS model turns. Each turn streams one Messages
// request; every completed block becomes an AgentEvent as it lands.
//
//   tool_use (client tools)  run here, results go back in one user message
//   pause_turn               re-send the conversation as is (no extra user turn)
//   refusal                  the run fails; never run that turn's tools
//   max_tokens on a tool_use the input may be cut off: error result, no run
//
// History is append-only: assistant content goes back exactly as received.
// Before every turn the run row is read; status cancelled stops the loop.

import { db } from '@/lib/db'
import { type ApiMessage, type Block, type Effort, forApi, invalidInput, streamMessage } from './anthropic'
import { emit, noEmDash, oneLine } from './events'

export const MAX_TURNS = 60

export type JsonSchema = { type: 'object'; properties: Record<string, { type?: string; enum?: string[]; description?: string; items?: unknown }>; required?: string[] }

export type ClientTool = {
  name: string
  description: string
  input_schema: JsonSchema
  /** result goes back to the model as JSON; label is the feed line for it (null when the tool already wrote its own event). */
  run: (input: Record<string, unknown>) => Promise<{ result: unknown; label: string | null }>
}

export type LoopOptions = {
  runId: string
  model: string
  system: string
  messages: ApiMessage[]
  tools?: ClientTool[]
  effort?: Effort
  maxTurns?: number
  /** Feed line for a tool call, e.g. "Calling search_terms on OC Water Pros". Default: name plus the first two simple args. */
  describeCall?: (name: string, input: Record<string, unknown>) => string
}

export type LoopResult = { finalText: string; messages: ApiMessage[]; turns: number; cancelled: boolean }

export async function runAgentLoop(opts: LoopOptions): Promise<LoopResult> {
  const messages = [...opts.messages]
  const toolsByName = new Map((opts.tools ?? []).map((t) => [t.name, t]))
  const apiTools: Block[] = (opts.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema, eager_input_streaming: true, type: 'custom' }))
  const maxTurns = opts.maxTurns ?? MAX_TURNS

  const onBlock = async (b: Block) => {
    switch (b.type) {
      case 'thinking': {
        const text = String(b.thinking ?? '').trim()
        if (text) await emit(opts.runId, 'thinking', text, { thinking: noEmDash(text) })
        break
      }
      case 'text': {
        const text = String(b.text ?? '').trim()
        if (text) await emit(opts.runId, 'text', text, { text: noEmDash(text) })
        break
      }
      case 'tool_use': {
        const name = String(b.name)
        const input = (b.input ?? {}) as Record<string, unknown>
        await emit(opts.runId, 'tool_call', opts.describeCall?.(name, input) ?? `Calling ${name}${argsHint(input)}`, { name, input })
        break
      }
      case 'fallback': {
        const to = (b.to as { model?: string } | undefined)?.model
        await emit(opts.runId, 'status', `Switched to ${to ?? 'the fallback model'} after a policy decline`, { from: b.from, to: b.to })
        break
      }
    }
  }

  for (let turn = 1; turn <= maxTurns; turn++) {
    const row = await db.agentRun.findUnique({ where: { id: opts.runId }, select: { status: true } })
    if (!row || row.status === 'cancelled') {
      await emit(opts.runId, 'status', 'Cancelled')
      return { finalText: '', messages, turns: turn - 1, cancelled: true }
    }

    const res = await streamMessage(
      { model: opts.model, system: opts.system, messages, tools: apiTools, effort: opts.effort },
      onBlock
    )
    messages.push({ role: 'assistant', content: res.content.map(forApi) })

    if (res.stopReason === 'refusal') {
      const why = res.stopDetails?.category ? ` (${res.stopDetails.category})` : ''
      throw new Error(`The model declined this request${why}`)
    }
    if (res.stopReason === 'pause_turn') continue

    const uses = res.content.filter((b) => b.type === 'tool_use')
    if (uses.length > 0) {
      const results: Block[] = []
      for (const u of uses) results.push(await runClientTool(u, toolsByName, opts.runId, res.stopReason === 'max_tokens'))
      messages.push({ role: 'user', content: results })
      continue
    }

    const finalText = noEmDash(
      res.content
        .filter((b) => b.type === 'text')
        .map((b) => String(b.text ?? ''))
        .join('\n\n')
        .trim()
    )
    return { finalText, messages, turns: turn, cancelled: false }
  }
  throw new Error(`Stopped after ${maxTurns} model turns`)
}

async function runClientTool(use: Block, tools: Map<string, ClientTool>, runId: string, cutOff: boolean): Promise<Block> {
  const id = String(use.id)
  const name = String(use.name)
  const fail = async (message: string) => {
    await emit(runId, 'error', `${name}: ${message}`, { name, error: message })
    return { type: 'tool_result', tool_use_id: id, is_error: true, content: message }
  }
  const tool = tools.get(name)
  if (!tool) return fail(`unknown tool ${name}`)
  if (cutOff) return fail('the input was cut off at max_tokens; call the tool again with a shorter input')
  const raw = invalidInput(use)
  if (raw !== null) return fail(`the input was not valid JSON: ${raw.slice(0, 500)}`)
  const input = (use.input ?? {}) as Record<string, unknown>
  const invalid = validate(tool.input_schema, input)
  if (invalid) return fail(invalid)
  try {
    const { result, label } = await tool.run(input)
    if (label !== null) await emit(runId, 'tool_result', label, { name, result })
    return { type: 'tool_result', tool_use_id: id, content: JSON.stringify(result) }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

/** Required keys, primitive types and enums. Enough for our own small schemas. */
export function validate(schema: JsonSchema, input: Record<string, unknown>): string | null {
  for (const key of schema.required ?? []) if (input[key] === undefined || input[key] === null) return `missing required "${key}"`
  for (const [key, value] of Object.entries(input)) {
    const prop = schema.properties[key]
    if (!prop) return `unknown field "${key}"`
    if (value === undefined || value === null) continue
    const t = prop.type
    if (t === 'string' && typeof value !== 'string') return `"${key}" must be a string`
    if (t === 'number' && typeof value !== 'number') return `"${key}" must be a number`
    if (t === 'boolean' && typeof value !== 'boolean') return `"${key}" must be a boolean`
    if (t === 'array' && !Array.isArray(value)) return `"${key}" must be an array`
    if (t === 'object' && (typeof value !== 'object' || Array.isArray(value))) return `"${key}" must be an object`
    if (prop.enum && !prop.enum.includes(String(value))) return `"${key}" must be one of ${prop.enum.join(', ')}`
  }
  return null
}

function argsHint(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const parts = Object.entries(input as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([k, v]) => `${k}: ${oneLine(String(v), 40)}`)
  return parts.length ? ` (${parts.slice(0, 2).join(', ')})` : ''
}

