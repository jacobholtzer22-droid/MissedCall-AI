// ===========================================
// Ops HQ — what one model turn cost (pure)
// ===========================================
// Prices are USD per million tokens, first-party Claude API rates, from the
// claude-api skill's model table (cached 2026-10-06). A 5-minute cache write
// bills 1.25x input, a 1-hour write 2x input; cache reads have their own rate.
// Update this table when Anthropic changes prices; nothing else hardcodes one.
//
// usage is the Messages API usage object as streamMessage returns it. When it
// carries usage.iterations (a server-side fallback re-ran the request, or a
// server-side step like compaction ran), each iteration is priced on its own
// model: the top-level counts cover only the attempt that produced the message.
//
// An unknown model prices as null (tokens are still counted), so a new model id
// shows "cost not recorded" rather than a wrong number.

export type ModelPrice = { input: number; output: number; cacheRead: number }

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
}

const WRITE_5M = 1.25
const WRITE_1H = 2

export type TurnUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  /** null when a model in the turn has no price in MODEL_PRICES. */
  costUsd: number | null
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/** A model id with any date suffix or platform prefix stripped, e.g. "claude-opus-5-5-20260401" -> "claude-opus-5-5". */
export function priceFor(model: string | null | undefined): ModelPrice | null {
  if (!model) return null
  if (MODEL_PRICES[model]) return MODEL_PRICES[model]
  const key = Object.keys(MODEL_PRICES)
    .sort((a, b) => b.length - a.length)
    .find((k) => model.includes(k))
  return key ? MODEL_PRICES[key] : null
}

function priceOne(model: string | null | undefined, u: Record<string, unknown>): TurnUsage {
  const inputTokens = num(u.input_tokens)
  const outputTokens = num(u.output_tokens)
  const cacheReadTokens = num(u.cache_read_input_tokens)
  const cacheWriteTokens = num(u.cache_creation_input_tokens)
  const split = (u.cache_creation ?? null) as Record<string, unknown> | null
  const write1h = Math.min(num(split?.ephemeral_1h_input_tokens), cacheWriteTokens)
  const write5m = cacheWriteTokens - write1h
  const p = priceFor(model)
  const costUsd = p
    ? (inputTokens * p.input + outputTokens * p.output + cacheReadTokens * p.cacheRead + write5m * p.input * WRITE_5M + write1h * p.input * WRITE_1H) / 1_000_000
    : null
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd }
}

/** Tokens and dollars for one Messages response. model is the response's model (or the requested one). */
export function turnCost(model: string | null | undefined, usage: Record<string, unknown> | null | undefined): TurnUsage {
  const u = usage ?? {}
  const iterations = Array.isArray(u.iterations) ? (u.iterations as Record<string, unknown>[]).filter((i) => i && typeof i === 'object') : []
  const counted = iterations.filter((i) => 'input_tokens' in i || 'output_tokens' in i)
  if (!counted.length) return priceOne(model, u)
  return sumUsage(counted.map((i) => priceOne(typeof i.model === 'string' ? i.model : model, i)))
}

/** Several turns added up. costUsd is null if any turn's was. */
export function sumUsage(turns: TurnUsage[]): TurnUsage {
  return turns.reduce<TurnUsage>(
    (a, t) => ({
      inputTokens: a.inputTokens + t.inputTokens,
      outputTokens: a.outputTokens + t.outputTokens,
      cacheReadTokens: a.cacheReadTokens + t.cacheReadTokens,
      cacheWriteTokens: a.cacheWriteTokens + t.cacheWriteTokens,
      costUsd: a.costUsd === null || t.costUsd === null ? null : a.costUsd + t.costUsd,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 }
  )
}

/** "$0.042" under a dollar, "$1.24" above, "$128" at 100 and up. */
export function formatUsd(v: number): string {
  if (v < 1) return `$${v.toFixed(3)}`
  if (v < 100) return `$${v.toFixed(2)}`
  return `$${Math.round(v).toLocaleString('en-US')}`
}

/** One feed line for a turn: "Turn 3 cost $0.042: 12,345 in, 40,210 cached, 812 out". */
export function usageLabel(turn: number | null, u: TurnUsage): string {
  const n = (x: number) => x.toLocaleString('en-US')
  const cost = u.costUsd === null ? 'cost not recorded' : formatUsd(u.costUsd)
  const parts = [`${n(u.inputTokens)} in`, u.cacheReadTokens ? `${n(u.cacheReadTokens)} cached` : null, u.cacheWriteTokens ? `${n(u.cacheWriteTokens)} written to cache` : null, `${n(u.outputTokens)} out`].filter(Boolean)
  return `${turn ? `Turn ${turn} ` : ''}${cost}: ${parts.join(', ')}`
}
