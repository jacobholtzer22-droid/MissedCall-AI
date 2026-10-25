// ===========================================
// /admin/ops web checks — shared plumbing
// ===========================================
// Concurrency and timeouts for every external call the web checks make
// (Vercel, GitHub, DNS, the live sites). Errors never carry tokens: callers
// pass only a label and the status.

/** Every external call in lib/ops/checks runs at most this many at a time. */
export const EXTERNAL_CONCURRENCY = 5

/** Map over `items` with at most `limit` in flight, keeping order. */
export async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** fetch with a hard timeout. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' })
  } finally {
    clearTimeout(timer)
  }
}

export const errMessage = (err: unknown) =>
  err instanceof Error ? (err.name === 'AbortError' ? 'timed out' : err.message) : String(err)
