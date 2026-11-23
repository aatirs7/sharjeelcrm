import Link from 'next/link'
import type { SavedMessage } from '@/lib/ticket-cleanup'

export interface TranscriptView {
  id: string
  channelName: string
  leadId: string | null
  dealNumber: number | null
  messages: SavedMessage[]
  messageCount: number
  closedAt: Date
}

function when(iso: string | Date) {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  })
}

/**
 * Chats saved from tickets the idle cleanup closed: this deal's own ticket plus
 * any other closed tickets from the same buyer. Admin only, since a chat can
 * hold the account login that was handed over.
 */
export function TicketTranscripts({ items, currentLeadId }: { items: TranscriptView[]; currentLeadId: string }) {
  return (
    <section className="space-y-3">
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          saved ticket chats · admin only
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Closed tickets from this buyer. Anything sent in the ticket, including logins, is kept here.
        </p>
      </div>
      <div className="mx-auto max-w-3xl space-y-2">
        {items.map((t) => (
          <details key={t.id} className="rounded-xl border bg-card" open={items.length === 1}>
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-medium">
                #{t.channelName}
                {t.dealNumber && t.leadId !== currentLeadId && (
                  <>
                    {' · '}
                    <Link href={`/tickets/${t.leadId}`} className="text-primary hover:underline">
                      DEAL-{t.dealNumber}
                    </Link>
                  </>
                )}
                {t.leadId === currentLeadId && <span className="text-muted-foreground"> · this deal</span>}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {t.messageCount} messages · closed {when(t.closedAt)}
              </span>
            </summary>
            <ol className="space-y-3 border-t px-4 py-3">
              {t.messages.map((m, i) => (
                <li key={i} className="text-sm">
                  <p className="text-xs text-muted-foreground">
                    <span className={m.bot ? '' : 'font-medium text-foreground'}>{m.author}</span>
                    {m.bot ? ' · bot' : ''} · {when(m.at)}
                  </p>
                  {m.content && <p className="mt-0.5 whitespace-pre-wrap break-words">{m.content}</p>}
                  {m.attachments.length > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Attachment{m.attachments.length > 1 ? 's' : ''} (file not kept): {m.attachments.join(', ')}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </section>
  )
}
