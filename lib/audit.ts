import { db } from './db'
import { auditLogs } from './db/schema'
import { getSession } from './auth'

export interface AuditInput {
  action: string // e.g. 'deal.status', 'commission.approve'
  summary: string // one-line human description
  entity?: string | null // 'deal' | 'commission' | 'coach' | 'payout' | ...
  entityRef?: string | null // e.g. 'DEAL-10428'
  meta?: Record<string, unknown> | null
}

/**
 * Append one audit entry (spec §39). Actor is resolved from the current session
 * unless overridden (system/cron writes pass actorRole 'system'). Never throws —
 * a logging failure must not break the underlying action.
 */
export async function logAudit(
  input: AuditInput,
  actor?: { id: string | null; role: string }
): Promise<void> {
  try {
    let actorId = actor?.id ?? null
    let actorRole = actor?.role ?? 'system'
    if (!actor) {
      const s = await getSession()
      if (s) {
        actorRole = s.role
        actorId = s.role === 'coach' ? s.coachId : 'admin'
      }
    }
    await db.insert(auditLogs).values({
      actorId,
      actorRole,
      action: input.action,
      entity: input.entity ?? null,
      entityRef: input.entityRef ?? null,
      summary: input.summary,
      meta: input.meta ?? null,
    })
  } catch {
    /* audit logging is best-effort */
  }
}
