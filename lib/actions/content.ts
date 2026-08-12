'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { coachContent } from '../db/schema'
import { requireRep } from '../auth'

const toInt = (v: number | string | null | undefined): number => {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseInt(v, 10) : v
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0
}

export interface ContentInput {
  coachId: string
  videoLink?: string | null
  views?: number | string | null
  comments?: number | string | null
  dms?: number | string | null
  leadsGenerated?: number | string | null
  ticketsOpened?: number | string | null
  buyers?: number | string | null
  revenueDollars?: number | string | null
}

export async function createContent(input: ContentInput): Promise<string> {
  await requireRep()
  const revenueCents = Math.round((Number(input.revenueDollars) || 0) * 100)
  const [row] = await db
    .insert(coachContent)
    .values({
      coachId: input.coachId,
      videoLink: input.videoLink?.toString().trim() || null,
      views: toInt(input.views),
      comments: toInt(input.comments),
      dms: toInt(input.dms),
      leadsGenerated: toInt(input.leadsGenerated),
      ticketsOpened: toInt(input.ticketsOpened),
      buyers: toInt(input.buyers),
      revenueCents: Math.max(0, revenueCents),
    })
    .returning()
  revalidatePath('/content')
  return row.id
}

export async function deleteContent(id: string): Promise<void> {
  await requireRep()
  await db.delete(coachContent).where(eq(coachContent.id, id))
  revalidatePath('/content')
}
