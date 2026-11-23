'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { postSavedChatToTicket } from '@/lib/actions/transcripts'
import { Button } from '@/components/ui/button'

export function PostSavedChatButton({ transcriptId, leadId }: { transcriptId: string; leadId: string }) {
  const [pending, start] = useTransition()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await postSavedChatToTicket(transcriptId, leadId)
            toast.success('Posted into the ticket')
          } catch (e) {
            toast.error(e instanceof Error && e.message ? e.message : 'Could not post')
          }
        })
      }
    >
      {pending ? 'Posting…' : 'Post into current ticket'}
    </Button>
  )
}
