// ===========================================
// IN-MEMORY PER-IP RATE LIMIT
// ===========================================
// IMPORTANT LIMITATION: this is per serverless instance on Vercel. Each lambda
// gets its own module scope, and instances are recycled, so a determined
// attacker spread across enough concurrent invocations is not stopped by this.
// It exists to blunt casual abuse and accidental double-submits, nothing more.
// Real limiting needs shared state (Redis or a database table), which is a
// dependency decision, not a code one.
//
// No new dependency, no external service.

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

// Cheap opportunistic sweep so the Map cannot grow without bound on a
// long-lived instance.
function sweep(now: number) {
  if (buckets.size < 500) return
  for (const [key, b] of Array.from(buckets.entries())) {
    if (b.resetAt <= now) buckets.delete(key)
  }
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

/**
 * Fixed-window limiter.
 * @param key      caller-scoped identity, usually `${route}:${ip}`
 * @param limit    requests allowed per window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(key: string, limit = 10, windowMs = 60_000): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }

  existing.count += 1
  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 }
}

/** Best-effort client IP from proxy headers. Falls back to a shared bucket. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}
