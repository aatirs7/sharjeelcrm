'use server'

import { eq } from 'drizzle-orm'
import { db } from '../db'
import { leads, ticketTranscripts } from '../db/schema'
import { requireAdmin } from '../auth'
import { logAudit } from '../audit'
import { postTextFile } from '../discord'
import { transcriptText, type SavedMessage } from '../ticket-cleanup'

/** Admin: post a saved (closed) ticket chat into this deal's open ticket as a file. */
export async function postSavedChatToTicket(transcriptId: string, leadId: string): Promise<void> {
  await requireAdmin()
  const [t, lead] = await Promise.all([
    db.query.ticketTranscripts.findFirst({ where: eq(ticketTranscripts.id, transcriptId) }),
    db.query.leads.findFirst({ where: eq(leads.id, leadId) }),
  ])
  if (!t) throw new Error('Saved chat not found')
  if (!lead?.discordChannelId) throw new Error('This deal has no open ticket')
  const mention = lead.discordUserId ? `<@${lead.discordUserId}> ` : ''
  const ok = await postTextFile(
    lead.discordChannelId,
    {
      content: `${mention}here is your conversation from your previous ticket (#${t.channelName}), so nothing is lost. We will continue here.`,
    },
    `${t.channelName}.txt`,
    transcriptText(t.channelName, (t.messages as SavedMessage[]) ?? [])
  )
  if (!ok) throw new Error('Could not post to the ticket')
  await logAudit({
    action: 'ticket.chat_restored',
    entity: 'deal',
    entityRef: `DEAL-${lead.dealNumber}`,
    summary: `Posted the saved chat from #${t.channelName} into the ticket`,
  })
}
