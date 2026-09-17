// ===========================================
// WORK AFTER THE RESPONSE
// ===========================================
// The visitor gets their answer as soon as the essential write is done (the
// lead row, the appointment row, the gate cookie, the Lead claim). Everything
// that only has to HAPPEN, not happen before they see success (CRM, texts,
// emails, CAPI, owner alert), runs here, after the response.
//
// waitUntil keeps the Vercel function alive until the promise settles; without
// it the lambda can be frozen the moment the response returns and the work is
// dropped. Outside Vercel (local dev) it is a no-op and the promise simply runs.
//
// Every task has a timeout and logs on failure. Nothing here is silent.

import { waitUntil } from '@vercel/functions'

export const AFTER_RESPONSE_TIMEOUT_MS = 15_000

/**
 * Schedule one task to run after the response.
 *
 * Returns immediately. The task starts now, in parallel with any others, so a
 * slow one never delays the rest. A throw, a rejection or a timeout is logged
 * with the route and task label and never reaches the visitor.
 */
export function afterResponse(
  route: string,
  label: string,
  work: () => Promise<unknown>,
  timeoutMs = AFTER_RESPONSE_TIMEOUT_MS
): void {
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  const task = (async () => {
    try {
      await Promise.race([
        work(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs)
        }),
      ])
    } catch (err) {
      console.error(
        `[${route}] after-response FAILED task=${label} ms=${Date.now() - startedAt} ` +
          `error=${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      if (timer) clearTimeout(timer)
    }
  })()
  try {
    waitUntil(task)
  } catch (err) {
    // waitUntil only throws for a non-promise, which cannot happen here. Logged
    // anyway: a task Vercel is not holding open may be dropped.
    console.error(`[${route}] waitUntil unavailable task=${label} error=${err instanceof Error ? err.message : String(err)}`)
  }
}
