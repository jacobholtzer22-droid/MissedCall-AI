// ===========================================
// Who pushed it (OPS_AUTOFLOW, off by default)
// ===========================================
// decideApproval already writes { decidedBy, decidedVia } on the approval's
// detail. With the flag on that identity also travels with what the Push did:
//   ads apply run       input.approval carries approvalId, decidedBy, decidedVia
//   go_live (web_push)  the dispatched run's input gains the same three
//   every applied card  one activity, "Pushed by jacob via hq (approval <id>): <title>"
//                       (web_push merge, connect_domain, buy_domain, admin_change,
//                       ads_account_create, ads_invite, link_existing; an ads
//                       change gets its line when its apply run starts)
//   the job report      each approval lists decidedBy and decidedVia, each apply
//                       run its approval and approver, and both print as a line.
// Pure.

export type Approver = { decidedBy: string; decidedVia: string }

export function approverOf(detail: unknown): Approver | null {
  const d = (detail ?? {}) as Record<string, unknown>
  return typeof d.decidedBy === 'string' && d.decidedBy ? { decidedBy: d.decidedBy, decidedVia: typeof d.decidedVia === 'string' && d.decidedVia ? d.decidedVia : 'unknown' } : null
}

export function pushedByLine(approvalId: string, title: string, by: Approver | null): string {
  return `Pushed by ${by?.decidedBy ?? 'jacob (not recorded)'} via ${by?.decidedVia ?? 'unknown'} (approval ${approvalId}): ${title}`
}

/** What an apply run's input carries. */
export function approvalStamp(approvalId: string, by: Approver): { approvalId: string; decidedBy: string; decidedVia: string } {
  return { approvalId, decidedBy: by.decidedBy, decidedVia: by.decidedVia }
}

/** The report line for an apply run: from its input, or null when it carries no approval. */
export function applyRunLine(input: unknown): string | null {
  const i = (input ?? {}) as Record<string, unknown>
  const a = (i.approval ?? {}) as Record<string, unknown>
  const id = typeof i.approvalId === 'string' ? i.approvalId : typeof a.id === 'string' ? a.id : null
  if (!id) return null
  const by = approverOf(a.decidedBy ? a : i)
  return `Applied approval ${id}, pushed by ${by?.decidedBy ?? 'jacob (not recorded)'} via ${by?.decidedVia ?? 'unknown'}`
}
